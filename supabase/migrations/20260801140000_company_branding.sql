-- =============================================================================
-- White-label company branding + storage
-- =============================================================================

CREATE TABLE public.company_branding (
  company_id UUID PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  tagline TEXT,
  support_email TEXT,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT company_branding_primary_hex CHECK (
    primary_color IS NULL OR primary_color ~* '^#[0-9a-f]{6}$'
  ),
  CONSTRAINT company_branding_secondary_hex CHECK (
    secondary_color IS NULL OR secondary_color ~* '^#[0-9a-f]{6}$'
  ),
  CONSTRAINT company_branding_accent_hex CHECK (
    accent_color IS NULL OR accent_color ~* '^#[0-9a-f]{6}$'
  ),
  CONSTRAINT company_branding_support_email CHECK (
    support_email IS NULL OR support_email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
  ),
  CONSTRAINT company_branding_website_url CHECK (
    website_url IS NULL
    OR website_url ~* '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?(/.*)?$'
  )
);

CREATE TRIGGER company_branding_set_updated_at
  BEFORE UPDATE ON public.company_branding
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;

-- Company members can read their own branding (shells / track prep)
CREATE POLICY company_branding_select_tenant
  ON public.company_branding
  FOR SELECT
  TO authenticated
  USING (
    public.same_company(company_id)
    OR public.is_master_admin()
  );

-- Only Master Admin mutates branding (via authenticated session + RLS)
CREATE POLICY company_branding_insert_master
  ON public.company_branding
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master_admin());

CREATE POLICY company_branding_update_master
  ON public.company_branding
  FOR UPDATE
  TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

CREATE POLICY company_branding_delete_master
  ON public.company_branding
  FOR DELETE
  TO authenticated
  USING (public.is_master_admin());

-- Storage bucket for branding assets (public read for logos on public track)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path convention: {company_id}/logo.* or {company_id}/favicon.*
CREATE OR REPLACE FUNCTION public.branding_storage_company_id(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_part TEXT;
BEGIN
  v_part := split_part(object_name, '/', 1);
  IF v_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_part::UUID;
  END IF;
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS branding_storage_public_read ON storage.objects;
CREATE POLICY branding_storage_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_storage_master_insert ON storage.objects;
CREATE POLICY branding_storage_master_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND public.is_master_admin()
    AND public.branding_storage_company_id(name) IS NOT NULL
  );

DROP POLICY IF EXISTS branding_storage_master_update ON storage.objects;
CREATE POLICY branding_storage_master_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'branding'
    AND public.is_master_admin()
  )
  WITH CHECK (
    bucket_id = 'branding'
    AND public.is_master_admin()
  );

DROP POLICY IF EXISTS branding_storage_master_delete ON storage.objects;
CREATE POLICY branding_storage_master_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'branding'
    AND public.is_master_admin()
  );

-- Upsert branding (Master Admin only)
CREATE OR REPLACE FUNCTION public.master_upsert_company_branding(
  p_company_id UUID,
  p_logo_url TEXT DEFAULT NULL,
  p_favicon_url TEXT DEFAULT NULL,
  p_primary_color TEXT DEFAULT NULL,
  p_secondary_color TEXT DEFAULT NULL,
  p_accent_color TEXT DEFAULT NULL,
  p_tagline TEXT DEFAULT NULL,
  p_support_email TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_clear_logo BOOLEAN DEFAULT FALSE,
  p_clear_favicon BOOLEAN DEFAULT FALSE
)
RETURNS public.company_branding
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_branding;
  v_logo TEXT;
  v_favicon TEXT;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can update branding';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  SELECT logo_url, favicon_url
  INTO v_logo, v_favicon
  FROM public.company_branding
  WHERE company_id = p_company_id;

  IF p_clear_logo THEN
    v_logo := NULL;
  ELSIF p_logo_url IS NOT NULL THEN
    v_logo := p_logo_url;
  END IF;

  IF p_clear_favicon THEN
    v_favicon := NULL;
  ELSIF p_favicon_url IS NOT NULL THEN
    v_favicon := p_favicon_url;
  END IF;

  INSERT INTO public.company_branding (
    company_id,
    logo_url,
    favicon_url,
    primary_color,
    secondary_color,
    accent_color,
    tagline,
    support_email,
    website_url
  ) VALUES (
    p_company_id,
    v_logo,
    v_favicon,
    NULLIF(lower(btrim(COALESCE(p_primary_color, ''))), ''),
    NULLIF(lower(btrim(COALESCE(p_secondary_color, ''))), ''),
    NULLIF(lower(btrim(COALESCE(p_accent_color, ''))), ''),
    NULLIF(btrim(COALESCE(p_tagline, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_support_email, ''))), ''),
    NULLIF(btrim(COALESCE(p_website_url, '')), '')
  )
  ON CONFLICT (company_id) DO UPDATE SET
    logo_url = EXCLUDED.logo_url,
    favicon_url = EXCLUDED.favicon_url,
    primary_color = EXCLUDED.primary_color,
    secondary_color = EXCLUDED.secondary_color,
    accent_color = EXCLUDED.accent_color,
    tagline = EXCLUDED.tagline,
    support_email = EXCLUDED.support_email,
    website_url = EXCLUDED.website_url,
    updated_at = timezone('utc', now())
  RETURNING * INTO v_row;

  -- Keep legacy company columns in sync for older reads
  UPDATE public.companies
  SET
    logo_url = v_row.logo_url,
    primary_color = v_row.primary_color
  WHERE id = p_company_id;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_reset_company_branding(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can reset branding';
  END IF;

  DELETE FROM public.company_branding WHERE company_id = p_company_id;

  UPDATE public.companies
  SET logo_url = NULL, primary_color = NULL
  WHERE id = p_company_id;
END;
$$;

-- Safe public branding for tracking pages
CREATE OR REPLACE FUNCTION public.get_public_company_branding(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company public.companies;
  v_brand public.company_branding;
BEGIN
  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_brand FROM public.company_branding WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'company_name', v_company.name,
    'company_slug', v_company.slug,
    'logo_url', COALESCE(v_brand.logo_url, v_company.logo_url),
    'favicon_url', v_brand.favicon_url,
    'primary_color', COALESCE(v_brand.primary_color, v_company.primary_color),
    'secondary_color', v_brand.secondary_color,
    'accent_color', v_brand.accent_color,
    'tagline', v_brand.tagline,
    'support_email', v_brand.support_email,
    'website_url', v_brand.website_url
  );
END;
$$;

-- Extend public tracking with safe branding (no PII)
CREATE OR REPLACE FUNCTION public.get_public_tracking(p_tracking_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries;
  v_current public.delivery_stops;
  v_result JSONB;
  v_branding JSONB;
BEGIN
  IF p_tracking_number IS NULL OR btrim(p_tracking_number) = '' THEN
    RAISE EXCEPTION 'Tracking number is required';
  END IF;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE tracking_number = upper(btrim(p_tracking_number));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No delivery found for this tracking number'
    );
  END IF;

  SELECT * INTO v_current
  FROM public.delivery_stops
  WHERE id = v_delivery.current_stop_id;

  v_branding := public.get_public_company_branding(v_delivery.company_id);

  SELECT jsonb_build_object(
    'found', true,
    'tracking_number', v_delivery.tracking_number,
    'status', v_delivery.status,
    'origin', jsonb_build_object(
      'name', v_delivery.origin_name,
      'latitude', v_delivery.origin_latitude,
      'longitude', v_delivery.origin_longitude
    ),
    'destination', jsonb_build_object(
      'name', v_delivery.destination_name,
      'latitude', v_delivery.destination_latitude,
      'longitude', v_delivery.destination_longitude
    ),
    'current_location', CASE
      WHEN v_current.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_current.name,
        'latitude', v_current.latitude,
        'longitude', v_current.longitude,
        'stop_order', v_current.stop_order,
        'status', v_current.status
      )
    END,
    'current_stop', CASE
      WHEN v_current.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_current.name,
        'stop_order', v_current.stop_order,
        'status', v_current.status,
        'arrived_at', v_current.arrived_at,
        'latitude', v_current.latitude,
        'longitude', v_current.longitude
      )
    END,
    'completed_stops', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', s.name,
          'stop_order', s.stop_order,
          'arrived_at', s.arrived_at,
          'completed_at', s.completed_at,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'status', s.status
        )
        ORDER BY s.stop_order
      )
      FROM public.delivery_stops s
      WHERE s.delivery_id = v_delivery.id
        AND s.status = 'completed'
    ), '[]'::jsonb),
    'upcoming_stops', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', s.name,
          'stop_order', s.stop_order,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'status', s.status
        )
        ORDER BY s.stop_order
      )
      FROM public.delivery_stops s
      WHERE s.delivery_id = v_delivery.id
        AND s.status = 'upcoming'
    ), '[]'::jsonb),
    'timeline', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'location_name', h.location_name,
          'event_type', h.event_type,
          'created_at', h.created_at
        )
        ORDER BY h.created_at
      )
      FROM public.delivery_location_history h
      WHERE h.delivery_id = v_delivery.id
    ), '[]'::jsonb),
    'estimated_delivery_at', v_delivery.estimated_delivery_at,
    'last_updated', v_delivery.updated_at,
    'branding', v_branding
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.master_upsert_company_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_reset_company_branding(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_company_branding(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branding_storage_company_id(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.master_upsert_company_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_reset_company_branding(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_company_branding(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_storage_company_id(TEXT) TO authenticated;
