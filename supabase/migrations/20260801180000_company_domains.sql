-- =============================================================================
-- Custom domains & tenant hostname resolution (Prompt 11)
-- Automatic DNS / SSL / billing are NOT implemented here.
-- =============================================================================

CREATE TYPE public.company_domain_status AS ENUM (
  'pending',
  'active',
  'disabled'
);

CREATE TABLE public.company_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  normalized_domain TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status public.company_domain_status NOT NULL DEFAULT 'pending',
  verification_token TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  last_verification_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT company_domains_domain_hostname CHECK (
    domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    AND char_length(domain) <= 253
    AND position('/' IN domain) = 0
    AND position(':' IN domain) = 0
  ),
  CONSTRAINT company_domains_normalized_matches CHECK (
    normalized_domain = lower(btrim(domain))
  ),
  CONSTRAINT company_domains_token_not_blank CHECK (
    char_length(btrim(verification_token)) >= 32
  ),
  CONSTRAINT company_domains_active_requires_verified CHECK (
    status <> 'active' OR verified_at IS NOT NULL
  ),
  CONSTRAINT company_domains_primary_requires_active CHECK (
    NOT is_primary OR status = 'active'
  )
);

CREATE UNIQUE INDEX company_domains_normalized_domain_key
  ON public.company_domains (normalized_domain);

-- At most one primary domain per company
CREATE UNIQUE INDEX company_domains_one_primary_per_company
  ON public.company_domains (company_id)
  WHERE is_primary;

CREATE INDEX company_domains_company_id_idx
  ON public.company_domains (company_id);

CREATE INDEX company_domains_active_lookup_idx
  ON public.company_domains (normalized_domain)
  WHERE status = 'active';

CREATE TRIGGER company_domains_set_updated_at
  BEFORE UPDATE ON public.company_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_domains_select_master_or_tenant
  ON public.company_domains
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR company_id = public.auth_company_id()
  );

CREATE POLICY company_domains_insert_master
  ON public.company_domains
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master_admin());

CREATE POLICY company_domains_update_master
  ON public.company_domains
  FOR UPDATE
  TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

CREATE POLICY company_domains_delete_master
  ON public.company_domains
  FOR DELETE
  TO authenticated
  USING (public.is_master_admin());

-- -----------------------------------------------------------------------------
-- Normalize hostname helper (DB-side, mirrors app rules)
-- Exact hostname — no automatic www stripping
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_hostname(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(p_input));
  v := regexp_replace(v, '^https?://', '', 'i');
  v := split_part(v, '/', 1);
  v := split_part(v, '?', 1);
  v := split_part(v, '#', 1);
  -- strip port
  IF v ~ ':[0-9]+$' THEN
    v := regexp_replace(v, ':[0-9]+$', '');
  END IF;
  v := regexp_replace(v, '\.$', '');
  v := btrim(v);

  IF v = '' THEN
    RETURN NULL;
  END IF;

  RETURN v;
END;
$$;

-- -----------------------------------------------------------------------------
-- Resolve active tenant by hostname (safe for middleware / anon)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_hostname(p_hostname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host TEXT;
  v_domain public.company_domains;
  v_company public.companies;
BEGIN
  v_host := public.normalize_hostname(p_hostname);
  IF v_host IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_domain
  FROM public.company_domains
  WHERE normalized_domain = v_host
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_company
  FROM public.companies
  WHERE id = v_domain.company_id;

  IF NOT FOUND OR v_company.status <> 'active' THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'company_id', v_company.id,
    'company_name', v_company.name,
    'company_slug', v_company.slug,
    'company_status', v_company.status,
    'domain_id', v_domain.id,
    'domain', v_domain.normalized_domain,
    'is_primary', v_domain.is_primary
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Master Admin: add domain (pending)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_add_company_domain(
  p_company_id UUID,
  p_domain TEXT,
  p_verification_token TEXT
)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host TEXT;
  v_row public.company_domains;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can manage domains';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  v_host := public.normalize_hostname(p_domain);
  IF v_host IS NULL
    OR v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    OR char_length(v_host) > 253 THEN
    RAISE EXCEPTION 'Invalid domain hostname';
  END IF;

  -- Block obvious internal/loopback hostnames from being production-claimed
  IF v_host IN ('localhost', '127.0.0.1', '0.0.0.0', '::1')
    OR v_host LIKE '%.local'
    OR v_host LIKE '%.internal' THEN
    -- Allow *.localhost for local development testing only via app-layer flag;
    -- still permit storing *.localhost for demos.
    IF v_host = 'localhost' OR v_host = '127.0.0.1' THEN
      RAISE EXCEPTION 'Invalid domain hostname';
    END IF;
  END IF;

  IF p_verification_token IS NULL OR char_length(btrim(p_verification_token)) < 32 THEN
    RAISE EXCEPTION 'Verification token is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_domains WHERE normalized_domain = v_host
  ) THEN
    RAISE EXCEPTION 'Domain already registered';
  END IF;

  INSERT INTO public.company_domains (
    company_id,
    domain,
    normalized_domain,
    is_primary,
    status,
    verification_token
  ) VALUES (
    p_company_id,
    v_host,
    v_host,
    FALSE,
    'pending',
    btrim(p_verification_token)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Mark verified → active
CREATE OR REPLACE FUNCTION public.master_mark_domain_verified(p_domain_id UUID)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_domains;
  v_make_primary BOOLEAN;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can verify domains';
  END IF;

  SELECT * INTO v_row FROM public.company_domains WHERE id = p_domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found';
  END IF;

  IF v_row.status = 'disabled' THEN
    RAISE EXCEPTION 'Disabled domains cannot be verified';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.company_domains
    WHERE company_id = v_row.company_id
      AND is_primary
      AND id <> p_domain_id
  )
  INTO v_make_primary;

  UPDATE public.company_domains
  SET
    status = 'active',
    verified_at = COALESCE(verified_at, timezone('utc', now())),
    last_verification_attempt_at = timezone('utc', now()),
    is_primary = CASE WHEN v_make_primary THEN TRUE ELSE is_primary END
  WHERE id = p_domain_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_domain_status(
  p_domain_id UUID,
  p_status public.company_domain_status
)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_domains;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can change domain status';
  END IF;

  IF p_status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION 'Invalid domain status transition';
  END IF;

  SELECT * INTO v_row FROM public.company_domains WHERE id = p_domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found';
  END IF;

  IF p_status = 'active' AND v_row.verified_at IS NULL THEN
    RAISE EXCEPTION 'Domain must be verified before it can be activated';
  END IF;

  UPDATE public.company_domains
  SET
    status = p_status,
    is_primary = CASE WHEN p_status = 'disabled' THEN FALSE ELSE is_primary END
  WHERE id = p_domain_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_primary_domain(p_domain_id UUID)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_domains;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can set the primary domain';
  END IF;

  SELECT * INTO v_row FROM public.company_domains WHERE id = p_domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found';
  END IF;

  IF v_row.status <> 'active' OR v_row.verified_at IS NULL THEN
    RAISE EXCEPTION 'Only verified active domains can be primary';
  END IF;

  UPDATE public.company_domains
  SET is_primary = FALSE
  WHERE company_id = v_row.company_id
    AND is_primary
    AND id <> p_domain_id;

  UPDATE public.company_domains
  SET is_primary = TRUE
  WHERE id = p_domain_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_touch_domain_verification_attempt(
  p_domain_id UUID
)
RETURNS public.company_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_domains;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can verify domains';
  END IF;

  UPDATE public.company_domains
  SET last_verification_attempt_at = timezone('utc', now())
  WHERE id = p_domain_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain not found';
  END IF;

  RETURN v_row;
END;
$$;

-- Domain-scoped public tracking (optional company filter)
DROP FUNCTION IF EXISTS public.get_public_tracking(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_tracking(
  p_tracking_number TEXT,
  p_company_id UUID DEFAULT NULL
)
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

  -- Tenant custom-domain tracking: never reveal cross-company deliveries
  IF p_company_id IS NOT NULL AND v_delivery.company_id <> p_company_id THEN
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

REVOKE ALL ON FUNCTION public.normalize_hostname(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_tenant_by_hostname(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_add_company_domain(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_mark_domain_verified(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_set_domain_status(UUID, public.company_domain_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_set_primary_domain(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_touch_domain_verification_attempt(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_tracking(TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.normalize_hostname(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_hostname(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.master_add_company_domain(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_mark_domain_verified(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_set_domain_status(UUID, public.company_domain_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_set_primary_domain(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_touch_domain_verification_attempt(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_tracking(TEXT, UUID) TO anon, authenticated;

-- Keep single-arg overload usable (Postgres: DEFAULT makes one function)
COMMENT ON FUNCTION public.resolve_tenant_by_hostname(TEXT) IS
  'Returns active company for an active custom domain hostname. Null if none.';
COMMENT ON FUNCTION public.get_public_tracking(TEXT, UUID) IS
  'Public tracking. Optional p_company_id scopes results to a tenant custom domain.';
