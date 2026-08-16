-- HMAC distributor tenant provisioning (server-to-server).
-- Idempotency store + service-role provision RPC (no user JWT).

CREATE TABLE IF NOT EXISTS public.distributor_provision_requests (
  idempotency_key UUID PRIMARY KEY,
  client_id UUID NOT NULL,
  distributor_id UUID NOT NULL,
  product_sku TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  admin_email TEXT,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT distributor_provision_sku_length CHECK (
    char_length(btrim(product_sku)) BETWEEN 1 AND 64
  ),
  CONSTRAINT distributor_provision_hash_length CHECK (
    char_length(request_hash) = 64
  )
);

CREATE INDEX IF NOT EXISTS distributor_provision_requests_company_id_idx
  ON public.distributor_provision_requests (company_id);

CREATE INDEX IF NOT EXISTS distributor_provision_requests_client_idx
  ON public.distributor_provision_requests (client_id, created_at DESC);

ALTER TABLE public.distributor_provision_requests ENABLE ROW LEVEL SECURITY;

-- No authenticated policies: service role only (bypasses RLS).
DROP POLICY IF EXISTS distributor_provision_requests_deny_all
  ON public.distributor_provision_requests;
CREATE POLICY distributor_provision_requests_deny_all
  ON public.distributor_provision_requests
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.distributor_provision_requests IS
  'Idempotent Webfinance distributor provision responses. Service-role API only.';

-- Service-role (or master admin) company provision — used by HMAC endpoint.
CREATE OR REPLACE FUNCTION public.service_provision_company(
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
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only service role or Master Admin can provision companies';
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

  INSERT INTO public.companies (name, slug, description, email, phone, status)
  VALUES (
    btrim(p_company_name), v_slug,
    NULLIF(btrim(COALESCE(p_company_description, '')), ''),
    NULLIF(btrim(COALESCE(p_company_email, '')), ''),
    NULLIF(btrim(COALESCE(p_company_phone, '')), ''),
    'active'
  )
  RETURNING * INTO v_company;

  INSERT INTO public.profiles (id, company_id, full_name, email, phone, role)
  VALUES (
    p_admin_user_id, v_company.id, btrim(p_admin_full_name),
    lower(btrim(p_admin_email)),
    NULLIF(btrim(COALESCE(p_admin_phone, '')), ''),
    'admin'
  )
  RETURNING * INTO v_profile;

  -- Insert settings/branding directly (nested master_* RPCs require a Master Admin JWT).
  INSERT INTO public.company_settings (
    company_id, timezone, currency, support_email, support_phone, website_url
  ) VALUES (
    v_company.id,
    COALESCE(NULLIF(btrim(p_timezone), ''), 'Africa/Lagos'),
    COALESCE(NULLIF(upper(btrim(p_currency)), ''), 'NGN'),
    NULLIF(lower(btrim(COALESCE(p_support_email, p_company_email, ''))), ''),
    NULLIF(btrim(COALESCE(p_support_phone, p_company_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_website_url, '')), '')
  )
  RETURNING * INTO v_settings;

  v_has_branding :=
    NULLIF(btrim(COALESCE(p_primary_color, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(p_secondary_color, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(p_accent_color, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(p_tagline, '')), '') IS NOT NULL
    OR v_settings.support_email IS NOT NULL
    OR v_settings.website_url IS NOT NULL;

  IF v_has_branding THEN
    INSERT INTO public.company_branding (
      company_id, primary_color, secondary_color, accent_color,
      tagline, support_email, website_url
    ) VALUES (
      v_company.id,
      NULLIF(lower(btrim(COALESCE(p_primary_color, ''))), ''),
      NULLIF(lower(btrim(COALESCE(p_secondary_color, ''))), ''),
      NULLIF(lower(btrim(COALESCE(p_accent_color, ''))), ''),
      NULLIF(btrim(COALESCE(p_tagline, '')), ''),
      v_settings.support_email,
      v_settings.website_url
    )
    RETURNING * INTO v_branding;
  END IF;

  RETURN jsonb_build_object(
    'company', to_jsonb(v_company),
    'admin', to_jsonb(v_profile),
    'settings', to_jsonb(v_settings),
    'branding', to_jsonb(v_branding)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

-- Callable only via service role key (PostgREST service_role JWT).
GRANT EXECUTE ON FUNCTION public.service_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
