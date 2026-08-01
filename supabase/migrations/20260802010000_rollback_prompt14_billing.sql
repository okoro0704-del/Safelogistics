-- =============================================================================
-- Rollback Prompt 14 SaaS billing architecture
-- Drops provider-oriented plans/subscriptions if present.
-- Safe on fresh DBs (IF EXISTS) and on DBs that applied Prompt 14.
-- Does NOT touch Prompt 1–13 tables or security hardening.
-- =============================================================================

-- Restore master_provision_company to Prompt 10/13 signature (no plan args)
DROP FUNCTION IF EXISTS public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  UUID, public.billing_interval
);

DROP FUNCTION IF EXISTS public.master_upsert_plan(
  TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, INTEGER,
  BOOLEAN, BOOLEAN, INTEGER, JSONB, JSONB, UUID
);
DROP FUNCTION IF EXISTS public.master_set_plan_active(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.master_assign_company_subscription(
  UUID, UUID, public.subscription_status, public.billing_interval, TEXT
);
DROP FUNCTION IF EXISTS public.master_set_subscription_status(
  UUID, public.subscription_status
);
DROP FUNCTION IF EXISTS public.master_billing_stats();
DROP FUNCTION IF EXISTS public.get_company_usage_snapshot(UUID);
DROP FUNCTION IF EXISTS public.get_default_plan_id();
DROP FUNCTION IF EXISTS public.record_subscription_event(
  UUID, UUID, TEXT, JSONB, JSONB, JSONB
);

DROP TABLE IF EXISTS public.company_usage_periods CASCADE;
DROP TABLE IF EXISTS public.subscription_events CASCADE;
DROP TABLE IF EXISTS public.company_subscriptions CASCADE;
DROP TABLE IF EXISTS public.plan_features CASCADE;
DROP TABLE IF EXISTS public.plan_limits CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;

DROP TYPE IF EXISTS public.billing_interval;
DROP TYPE IF EXISTS public.subscription_status;

-- Recreate master_provision_company without billing (Prompt 10 signature)
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

REVOKE ALL ON FUNCTION public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_rollback_company_provision(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_rollback_company_provision(UUID) TO authenticated;
