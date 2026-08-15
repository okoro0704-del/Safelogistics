-- Remove all payment / billing features and provision without payments.
-- Also drop domain_orders.payment_id linkage.

-- 1) Drop FK from domain_orders first
ALTER TABLE IF EXISTS public.domain_orders
  DROP COLUMN IF EXISTS payment_id;

-- 2) Drop payment RPCs / stats
DROP FUNCTION IF EXISTS public.master_record_payment(
  UUID, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT
) CASCADE;
DROP FUNCTION IF EXISTS public.master_void_payment(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.master_payment_stats() CASCADE;
DROP FUNCTION IF EXISTS public.master_billing_stats() CASCADE;

-- 3) Drop ALL master_provision_company overloads, then recreate payment-free
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'master_provision_company'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

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

  v_settings := public.master_upsert_company_settings(
    v_company.id, p_timezone, p_currency,
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
      v_company.id, NULL, NULL,
      NULLIF(lower(btrim(COALESCE(p_primary_color, ''))), ''),
      NULLIF(lower(btrim(COALESCE(p_secondary_color, ''))), ''),
      NULLIF(lower(btrim(COALESCE(p_accent_color, ''))), ''),
      NULLIF(btrim(COALESCE(p_tagline, '')), ''),
      v_settings.support_email, v_settings.website_url, FALSE, FALSE
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
    p_company_name, p_company_slug, p_admin_user_id,
    p_admin_full_name, p_admin_email, p_admin_phone,
    NULL, p_company_email, p_company_phone,
    'Africa/Lagos', 'NGN', p_company_email, p_company_phone,
    NULL, NULL, NULL, NULL, NULL
  );
  RETURN jsonb_build_object(
    'company', v_result->'company',
    'admin', v_result->'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.master_register_company_with_admin(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- Update master_complete_domain_order to remove payment_id arg if present
DROP FUNCTION IF EXISTS public.master_complete_domain_order(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.master_complete_domain_order(
  p_order_id UUID,
  p_status TEXT,
  p_namecheap_order_id TEXT DEFAULT NULL,
  p_company_domain_id UUID DEFAULT NULL,
  p_last_error TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.domain_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.domain_orders;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can update domain orders';
  END IF;

  IF p_status NOT IN ('pending', 'purchased', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid domain order status';
  END IF;

  UPDATE public.domain_orders
  SET
    status = p_status,
    namecheap_order_id = COALESCE(p_namecheap_order_id, namecheap_order_id),
    company_domain_id = COALESCE(p_company_domain_id, company_domain_id),
    last_error = CASE
      WHEN p_status = 'purchased' THEN NULL
      ELSE COALESCE(p_last_error, last_error)
    END,
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Domain order not found';
  END IF;

  IF p_company_domain_id IS NOT NULL AND p_status = 'purchased' THEN
    UPDATE public.company_domains
    SET
      acquisition_source = 'namecheap',
      registrar_order_id = COALESCE(p_namecheap_order_id, registrar_order_id),
      expires_at = COALESCE(p_expires_at, expires_at),
      updated_at = now()
    WHERE id = p_company_domain_id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.master_complete_domain_order(
  UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_complete_domain_order(
  UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ
) TO authenticated;

-- 4) Drop payments table and enum
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TYPE IF EXISTS public.manual_payment_method CASCADE;
DROP TYPE IF EXISTS public.manual_payment_status CASCADE;
