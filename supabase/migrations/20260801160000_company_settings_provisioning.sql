-- =============================================================================
-- Company settings + full tenant provisioning (Prompt 10)
-- Custom domains / DNS / billing are NOT implemented here.
-- =============================================================================

-- Optional company description
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_description_length;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_description_length
  CHECK (description IS NULL OR char_length(description) <= 500);

-- -----------------------------------------------------------------------------
-- company_settings (1:1 operational config; separate from visual branding)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  currency TEXT NOT NULL DEFAULT 'NGN',
  support_email TEXT,
  support_phone TEXT,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT company_settings_timezone_format CHECK (
    timezone ~ '^[A-Za-z0-9_+\-]+(/[A-Za-z0-9_+\-]+)*$'
    AND char_length(timezone) <= 64
  ),
  CONSTRAINT company_settings_currency_format CHECK (
    currency ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT company_settings_support_email CHECK (
    support_email IS NULL
    OR support_email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  ),
  CONSTRAINT company_settings_support_phone CHECK (
    support_phone IS NULL
    OR (
      support_phone ~ '^\+?[0-9()\-\s.]{7,20}$'
      AND char_length(btrim(support_phone)) >= 7
    )
  ),
  CONSTRAINT company_settings_website_url CHECK (
    website_url IS NULL
    OR website_url ~* '^https?://'
  )
);

CREATE TRIGGER company_settings_set_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_settings_select_tenant
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR company_id = public.auth_company_id()
  );

CREATE POLICY company_settings_insert_master
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master_admin());

CREATE POLICY company_settings_update_master
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

CREATE POLICY company_settings_delete_master
  ON public.company_settings
  FOR DELETE
  TO authenticated
  USING (public.is_master_admin());

-- Backfill defaults for existing companies
INSERT INTO public.company_settings (company_id, timezone, currency)
SELECT c.id, 'Africa/Lagos', 'NGN'
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

-- Sync support contacts from branding where settings are empty
UPDATE public.company_settings s
SET
  support_email = COALESCE(s.support_email, b.support_email),
  website_url = COALESCE(s.website_url, b.website_url)
FROM public.company_branding b
WHERE b.company_id = s.company_id;

-- -----------------------------------------------------------------------------
-- Upsert settings (Master Admin only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_upsert_company_settings(
  p_company_id UUID,
  p_timezone TEXT DEFAULT 'Africa/Lagos',
  p_currency TEXT DEFAULT 'NGN',
  p_support_email TEXT DEFAULT NULL,
  p_support_phone TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL
)
RETURNS public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_settings;
  v_tz TEXT;
  v_cur TEXT;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can update company settings';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  v_tz := NULLIF(btrim(COALESCE(p_timezone, '')), '');
  IF v_tz IS NULL THEN
    v_tz := 'Africa/Lagos';
  END IF;

  v_cur := upper(btrim(COALESCE(p_currency, 'NGN')));
  IF v_cur !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code';
  END IF;

  INSERT INTO public.company_settings (
    company_id, timezone, currency, support_email, support_phone, website_url
  ) VALUES (
    p_company_id,
    v_tz,
    v_cur,
    NULLIF(lower(btrim(COALESCE(p_support_email, ''))), ''),
    NULLIF(btrim(COALESCE(p_support_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_website_url, '')), '')
  )
  ON CONFLICT (company_id) DO UPDATE SET
    timezone = EXCLUDED.timezone,
    currency = EXCLUDED.currency,
    support_email = EXCLUDED.support_email,
    support_phone = EXCLUDED.support_phone,
    website_url = EXCLUDED.website_url,
    updated_at = timezone('utc', now())
  RETURNING * INTO v_row;

  -- Keep public branding contact fields in sync when present
  INSERT INTO public.company_branding (
    company_id, support_email, website_url
  ) VALUES (
    p_company_id, v_row.support_email, v_row.website_url
  )
  ON CONFLICT (company_id) DO UPDATE SET
    support_email = COALESCE(EXCLUDED.support_email, public.company_branding.support_email),
    website_url = COALESCE(EXCLUDED.website_url, public.company_branding.website_url),
    updated_at = timezone('utc', now());

  RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------------------
-- Full provision: company + admin + settings + optional branding (one txn)
-- Auth user must already exist (created server-side with service role).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_provision_company(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_admin_user_id UUID,
  p_admin_full_name TEXT,
  p_admin_email TEXT,
  p_admin_phone TEXT DEFAULT NULL,
  p_company_description TEXT DEFAULT NULL,
  p_company_email TEXT DEFAULT NULL,
  p_company_phone TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT 'Africa/Lagos',
  p_currency TEXT DEFAULT 'NGN',
  p_support_email TEXT DEFAULT NULL,
  p_support_phone TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_primary_color TEXT DEFAULT NULL,
  p_secondary_color TEXT DEFAULT NULL,
  p_accent_color TEXT DEFAULT NULL,
  p_tagline TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_company public.companies;
  v_profile public.profiles;
  v_settings public.company_settings;
  v_branding public.company_branding;
  v_has_branding BOOLEAN;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can provision companies';
  END IF;

  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  v_slug := lower(btrim(COALESCE(p_company_slug, '')));
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Company slug must be lowercase letters, numbers, and hyphens';
  END IF;

  IF EXISTS (SELECT 1 FROM public.companies WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Company slug already exists';
  END IF;

  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin user id is required';
  END IF;

  IF p_admin_full_name IS NULL OR btrim(p_admin_full_name) = '' THEN
    RAISE EXCEPTION 'Admin name is required';
  END IF;

  IF p_admin_email IS NULL OR btrim(p_admin_email) = '' THEN
    RAISE EXCEPTION 'Admin email is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_user_id) THEN
    RAISE EXCEPTION 'Admin profile already exists for this user';
  END IF;

  INSERT INTO public.companies (
    name, slug, description, email, phone, status
  ) VALUES (
    btrim(p_company_name),
    v_slug,
    NULLIF(btrim(COALESCE(p_company_description, '')), ''),
    NULLIF(btrim(COALESCE(p_company_email, '')), ''),
    NULLIF(btrim(COALESCE(p_company_phone, '')), ''),
    'active'
  )
  RETURNING * INTO v_company;

  INSERT INTO public.profiles (
    id, company_id, full_name, email, phone, role
  ) VALUES (
    p_admin_user_id,
    v_company.id,
    btrim(p_admin_full_name),
    lower(btrim(p_admin_email)),
    NULLIF(btrim(COALESCE(p_admin_phone, '')), ''),
    'admin'
  )
  RETURNING * INTO v_profile;

  v_settings := public.master_upsert_company_settings(
    v_company.id,
    p_timezone,
    p_currency,
    COALESCE(p_support_email, p_company_email),
    COALESCE(p_support_phone, p_company_phone),
    p_website_url
  );

  v_has_branding :=
    NULLIF(btrim(COALESCE(p_primary_color, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(p_secondary_color, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(p_accent_color, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(p_tagline, '')), '') IS NOT NULL
    OR v_settings.support_email IS NOT NULL
    OR v_settings.website_url IS NOT NULL;

  IF v_has_branding THEN
    v_branding := public.master_upsert_company_branding(
      v_company.id,
      NULL,
      NULL,
      NULLIF(lower(btrim(COALESCE(p_primary_color, ''))), ''),
      NULLIF(lower(btrim(COALESCE(p_secondary_color, ''))), ''),
      NULLIF(lower(btrim(COALESCE(p_accent_color, ''))), ''),
      NULLIF(btrim(COALESCE(p_tagline, '')), ''),
      v_settings.support_email,
      v_settings.website_url,
      FALSE,
      FALSE
    );
  END IF;

  RETURN jsonb_build_object(
    'company', to_jsonb(v_company),
    'admin', to_jsonb(v_profile),
    'settings', to_jsonb(v_settings),
    'branding', to_jsonb(v_branding)
  );
END;
$$;

-- Compensating cleanup if Auth succeeded but later steps fail
CREATE OR REPLACE FUNCTION public.master_rollback_company_provision(
  p_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can roll back provisioning';
  END IF;

  IF p_company_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.company_branding WHERE company_id = p_company_id;
  DELETE FROM public.company_settings WHERE company_id = p_company_id;
  DELETE FROM public.profiles WHERE company_id = p_company_id;
  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.master_upsert_company_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_provision_company(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_rollback_company_provision(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.master_upsert_company_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_provision_company(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_rollback_company_provision(UUID) TO authenticated;

-- Ensure legacy create path also gets default settings
CREATE OR REPLACE FUNCTION public.master_register_company_with_admin(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_admin_user_id UUID,
  p_admin_full_name TEXT,
  p_admin_email TEXT,
  p_admin_phone TEXT DEFAULT NULL,
  p_company_email TEXT DEFAULT NULL,
  p_company_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.master_provision_company(
    p_company_name,
    p_company_slug,
    p_admin_user_id,
    p_admin_full_name,
    p_admin_email,
    p_admin_phone,
    NULL,
    p_company_email,
    p_company_phone,
    'Africa/Lagos',
    'NGN',
    p_company_email,
    p_company_phone,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
  RETURN jsonb_build_object(
    'company', v_result->'company',
    'admin', v_result->'admin'
  );
END;
$$;
