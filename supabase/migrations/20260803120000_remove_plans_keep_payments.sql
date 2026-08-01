-- =============================================================================
-- Prompt 15: Remove plans & subscriptions; keep simple Master Admin payments
-- Does NOT modify historical Prompt 13 or Prompt 14 migrations.
-- Preserves public.payments (drops plan/subscription FKs).
-- =============================================================================

-- Drop extended provision signature (with plan/subscription args)
DROP FUNCTION IF EXISTS public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  UUID, public.manual_billing_interval, public.manual_account_type,
  BOOLEAN, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT
);

-- Drop plan/subscription RPCs
DROP FUNCTION IF EXISTS public.record_subscription_event(
  UUID, UUID, TEXT, JSONB, JSONB, TEXT
);
DROP FUNCTION IF EXISTS public.get_default_plan_id();
DROP FUNCTION IF EXISTS public.master_upsert_plan(
  TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BOOLEAN, BOOLEAN, INTEGER,
  JSONB, JSONB, UUID
);
DROP FUNCTION IF EXISTS public.master_set_plan_active(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.master_set_company_subscription(
  UUID, UUID, public.manual_subscription_status,
  public.manual_billing_interval, public.manual_account_type,
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.master_extend_subscription(
  UUID, INTEGER, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS public.master_record_payment(
  UUID, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT, UUID
);
DROP FUNCTION IF EXISTS public.master_void_payment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.master_billing_stats();

-- Detach payments from plans/subscriptions before dropping those tables
ALTER TABLE IF EXISTS public.payments
  DROP COLUMN IF EXISTS plan_id,
  DROP COLUMN IF EXISTS subscription_id;

-- Drop plan/subscription tables (CASCADE removes policies/indexes)
DROP TABLE IF EXISTS public.subscription_events CASCADE;
DROP TABLE IF EXISTS public.company_subscriptions CASCADE;
DROP TABLE IF EXISTS public.plan_features CASCADE;
DROP TABLE IF EXISTS public.plan_limits CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;

DROP TYPE IF EXISTS public.manual_subscription_status;
DROP TYPE IF EXISTS public.manual_billing_interval;
DROP TYPE IF EXISTS public.manual_account_type;

-- Ensure payments RLS remains Master Admin only
DROP POLICY IF EXISTS payments_master_all ON public.payments;
CREATE POLICY payments_master_all ON public.payments
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- -----------------------------------------------------------------------------
-- Simplified payment RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_record_payment(
  p_company_id UUID,
  p_amount_cents INTEGER,
  p_currency TEXT,
  p_payment_method public.manual_payment_method,
  p_payment_date DATE DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_cur TEXT;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can record payments';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN
    RAISE EXCEPTION 'Amount must be a non-negative integer (cents)';
  END IF;

  v_cur := upper(btrim(COALESCE(p_currency, 'USD')));
  IF v_cur !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid currency';
  END IF;

  INSERT INTO public.payments (
    company_id, amount_cents, currency, payment_method, payment_date,
    reference, notes, status, recorded_by
  ) VALUES (
    p_company_id,
    p_amount_cents,
    v_cur,
    p_payment_method,
    COALESCE(p_payment_date, (timezone('utc', now()))::date),
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'recorded',
    auth.uid()
  )
  RETURNING * INTO v_pay;

  RETURN v_pay;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_void_payment(
  p_payment_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can void payments';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_pay.status = 'voided' THEN RAISE EXCEPTION 'Payment already voided'; END IF;

  UPDATE public.payments SET
    status = 'voided',
    voided_at = timezone('utc', now()),
    voided_by = auth.uid(),
    void_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_payment_id
  RETURNING * INTO v_pay;

  RETURN v_pay;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_payment_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start DATE;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can view payment stats';
  END IF;

  v_month_start := date_trunc('month', timezone('utc', now()))::date;

  RETURN jsonb_build_object(
    'total_payments', (
      SELECT count(*)::int FROM public.payments WHERE status = 'recorded'
    ),
    'total_received_cents', (
      SELECT COALESCE(sum(amount_cents), 0)::bigint FROM public.payments
      WHERE status = 'recorded'
    ),
    'received_month_cents', (
      SELECT COALESCE(sum(amount_cents), 0)::bigint FROM public.payments
      WHERE status = 'recorded' AND payment_date >= v_month_start
    ),
    'voided_payments', (
      SELECT count(*)::int FROM public.payments WHERE status = 'voided'
    )
  );
END;
$$;

-- Alias for existing API callers during transition
CREATE OR REPLACE FUNCTION public.master_billing_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.master_payment_stats();
$$;

-- -----------------------------------------------------------------------------
-- Provision with optional payment only (no plans/subscriptions)
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
  p_tagline TEXT DEFAULT NULL,
  p_payment_received BOOLEAN DEFAULT FALSE,
  p_payment_amount_cents INTEGER DEFAULT NULL,
  p_payment_currency TEXT DEFAULT NULL,
  p_payment_method public.manual_payment_method DEFAULT NULL,
  p_payment_date DATE DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
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
  v_pay public.payments;
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

  IF COALESCE(p_payment_received, FALSE) THEN
    IF p_payment_amount_cents IS NULL OR p_payment_method IS NULL THEN
      RAISE EXCEPTION 'Payment amount and method are required when payment is received';
    END IF;
    v_pay := public.master_record_payment(
      v_company.id,
      p_payment_amount_cents,
      COALESCE(p_payment_currency, 'USD'),
      p_payment_method,
      p_payment_date,
      p_payment_reference,
      p_payment_notes
    );
  END IF;

  RETURN jsonb_build_object(
    'company', to_jsonb(v_company),
    'admin', to_jsonb(v_profile),
    'settings', to_jsonb(v_settings),
    'branding', to_jsonb(v_branding),
    'payment', to_jsonb(v_pay)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.master_rollback_company_provision(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can roll back provisioning';
  END IF;
  IF p_company_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.payments WHERE company_id = p_company_id;
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
    p_company_name, p_company_slug, p_admin_user_id,
    p_admin_full_name, p_admin_email, p_admin_phone,
    NULL, p_company_email, p_company_phone,
    'Africa/Lagos', 'NGN', p_company_email, p_company_phone,
    NULL, NULL, NULL, NULL, NULL,
    FALSE, NULL, NULL, NULL, NULL, NULL, NULL
  );
  RETURN jsonb_build_object(
    'company', v_result->'company',
    'admin', v_result->'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.master_record_payment(
  UUID, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_void_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_payment_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_billing_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.master_record_payment(
  UUID, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_void_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_payment_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_billing_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_rollback_company_provision(UUID) TO authenticated;

COMMENT ON TABLE public.payments IS
  'Manual offline payment records. No plans, subscriptions, or card data. Master Admin only.';
COMMENT ON FUNCTION public.master_payment_stats() IS
  'Simple totals of non-voided manually recorded payments.';
