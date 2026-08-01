-- =============================================================================
-- Manual Master Admin payments & subscriptions (Prompt 14 — manual model)
-- NO external payment provider. Master Admin records offline payments.
-- Plan/feature ENFORCEMENT is intentionally deferred.
-- =============================================================================

CREATE TYPE public.manual_subscription_status AS ENUM (
  'pending',
  'active',
  'expired',
  'cancelled',
  'complimentary'
);

CREATE TYPE public.manual_billing_interval AS ENUM (
  'monthly',
  'yearly'
);

CREATE TYPE public.manual_payment_method AS ENUM (
  'bank_transfer',
  'cash',
  'mobile_money',
  'other'
);

CREATE TYPE public.manual_payment_status AS ENUM (
  'recorded',
  'voided'
);

CREATE TYPE public.manual_account_type AS ENUM (
  'paid',
  'complimentary'
);

-- -----------------------------------------------------------------------------
-- plans
-- -----------------------------------------------------------------------------
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0
    CHECK (price_monthly_cents >= 0),
  price_yearly_cents INTEGER NOT NULL DEFAULT 0
    CHECK (price_yearly_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency ~ '^[A-Z]{3}$'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT plans_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT plans_slug_format CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND char_length(slug) BETWEEN 2 AND 64
  ),
  CONSTRAINT plans_description_length CHECK (
    description IS NULL OR char_length(description) <= 1000
  )
);

CREATE UNIQUE INDEX plans_slug_unique ON public.plans (slug);
CREATE UNIQUE INDEX plans_one_default ON public.plans (is_default) WHERE is_default;
CREATE INDEX plans_active_sort_idx ON public.plans (is_active, sort_order, name);

CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plan_limits (
  plan_id UUID NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
  limit_key TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  PRIMARY KEY (plan_id, limit_key),
  CONSTRAINT plan_limits_key_format CHECK (
    limit_key ~ '^[a-z][a-z0-9_]*$' AND char_length(limit_key) BETWEEN 2 AND 64
  ),
  CONSTRAINT plan_limits_value_check CHECK (limit_value = -1 OR limit_value >= 0)
);

CREATE TABLE public.plan_features (
  plan_id UUID NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (plan_id, feature_key),
  CONSTRAINT plan_features_key_format CHECK (
    feature_key ~ '^[a-z][a-z0-9_]*$' AND char_length(feature_key) BETWEEN 2 AND 64
  )
);

-- -----------------------------------------------------------------------------
-- company_subscriptions (1:1 current commercial state)
-- Distinct from companies.status (operational availability).
-- -----------------------------------------------------------------------------
CREATE TABLE public.company_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE
    REFERENCES public.companies (id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans (id),
  status public.manual_subscription_status NOT NULL DEFAULT 'pending',
  billing_interval public.manual_billing_interval NOT NULL DEFAULT 'monthly',
  account_type public.manual_account_type NOT NULL DEFAULT 'paid',
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT company_subscriptions_notes_length CHECK (
    internal_notes IS NULL OR char_length(internal_notes) <= 2000
  )
);

CREATE INDEX company_subscriptions_plan_idx ON public.company_subscriptions (plan_id);
CREATE INDEX company_subscriptions_status_idx ON public.company_subscriptions (status);
CREATE INDEX company_subscriptions_expires_idx ON public.company_subscriptions (expires_at);

CREATE TRIGGER company_subscriptions_set_updated_at
  BEFORE UPDATE ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payments (append-only history; void instead of delete)
-- -----------------------------------------------------------------------------
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method public.manual_payment_method NOT NULL,
  payment_date DATE NOT NULL DEFAULT (timezone('utc', now()))::date,
  reference TEXT,
  notes TEXT,
  status public.manual_payment_status NOT NULL DEFAULT 'recorded',
  recorded_by UUID,
  plan_id UUID REFERENCES public.plans (id),
  subscription_id UUID REFERENCES public.company_subscriptions (id)
    ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT payments_reference_length CHECK (
    reference IS NULL OR char_length(reference) <= 120
  ),
  CONSTRAINT payments_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  ),
  CONSTRAINT payments_void_reason_length CHECK (
    void_reason IS NULL OR char_length(void_reason) <= 500
  )
);

CREATE INDEX payments_company_created_idx
  ON public.payments (company_id, created_at DESC);
CREATE INDEX payments_status_idx ON public.payments (status);
CREATE INDEX payments_payment_date_idx ON public.payments (payment_date DESC);

-- -----------------------------------------------------------------------------
-- subscription_events (audit / history)
-- -----------------------------------------------------------------------------
CREATE TABLE public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.company_subscriptions (id)
    ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  old_values JSONB,
  new_values JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT subscription_events_type_format CHECK (
    event_type ~ '^[a-z][a-z0-9_]*$' AND char_length(event_type) BETWEEN 2 AND 64
  ),
  CONSTRAINT subscription_events_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 1000
  )
);

CREATE INDEX subscription_events_company_idx
  ON public.subscription_events (company_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Seed catalog
-- -----------------------------------------------------------------------------
INSERT INTO public.plans (
  id, name, slug, description,
  price_monthly_cents, price_yearly_cents, currency,
  is_active, is_default, sort_order
) VALUES
  (
    'b1111111-1111-1111-1111-111111111111',
    'Starter', 'starter',
    'Small teams getting started with delivery tracking.',
    2900, 29000, 'USD', TRUE, FALSE, 10
  ),
  (
    'b2222222-2222-2222-2222-222222222222',
    'Professional', 'professional',
    'Growing operators needing branding, domains, and higher volume.',
    7900, 79000, 'USD', TRUE, TRUE, 20
  ),
  (
    'b3333333-3333-3333-3333-333333333333',
    'Business', 'business',
    'Multi-admin fleets with higher limits and advanced tools.',
    19900, 199000, 'USD', TRUE, FALSE, 30
  ),
  (
    'b4444444-4444-4444-4444-444444444444',
    'Enterprise', 'enterprise',
    'Custom-scale white-label deployments. Pricing negotiated offline.',
    0, 0, 'USD', TRUE, FALSE, 40
  );

INSERT INTO public.plan_limits (plan_id, limit_key, limit_value) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'customers', 100),
  ('b1111111-1111-1111-1111-111111111111', 'deliveries_per_month', 250),
  ('b1111111-1111-1111-1111-111111111111', 'admins', 2),
  ('b1111111-1111-1111-1111-111111111111', 'custom_domains', 1),
  ('b2222222-2222-2222-2222-222222222222', 'customers', 1000),
  ('b2222222-2222-2222-2222-222222222222', 'deliveries_per_month', 2000),
  ('b2222222-2222-2222-2222-222222222222', 'admins', 5),
  ('b2222222-2222-2222-2222-222222222222', 'custom_domains', 3),
  ('b3333333-3333-3333-3333-333333333333', 'customers', 5000),
  ('b3333333-3333-3333-3333-333333333333', 'deliveries_per_month', 10000),
  ('b3333333-3333-3333-3333-333333333333', 'admins', 20),
  ('b3333333-3333-3333-3333-333333333333', 'custom_domains', 10),
  ('b4444444-4444-4444-4444-444444444444', 'customers', -1),
  ('b4444444-4444-4444-4444-444444444444', 'deliveries_per_month', -1),
  ('b4444444-4444-4444-4444-444444444444', 'admins', -1),
  ('b4444444-4444-4444-4444-444444444444', 'custom_domains', -1);

INSERT INTO public.plan_features (plan_id, feature_key, enabled) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'custom_branding', TRUE),
  ('b1111111-1111-1111-1111-111111111111', 'custom_domain', TRUE),
  ('b1111111-1111-1111-1111-111111111111', 'map_tracking', TRUE),
  ('b1111111-1111-1111-1111-111111111111', 'realtime_tracking', TRUE),
  ('b1111111-1111-1111-1111-111111111111', 'advanced_delivery_management', FALSE),
  ('b1111111-1111-1111-1111-111111111111', 'multiple_admins', TRUE),
  ('b1111111-1111-1111-1111-111111111111', 'public_tracking', TRUE),
  ('b2222222-2222-2222-2222-222222222222', 'custom_branding', TRUE),
  ('b2222222-2222-2222-2222-222222222222', 'custom_domain', TRUE),
  ('b2222222-2222-2222-2222-222222222222', 'map_tracking', TRUE),
  ('b2222222-2222-2222-2222-222222222222', 'realtime_tracking', TRUE),
  ('b2222222-2222-2222-2222-222222222222', 'advanced_delivery_management', TRUE),
  ('b2222222-2222-2222-2222-222222222222', 'multiple_admins', TRUE),
  ('b2222222-2222-2222-2222-222222222222', 'public_tracking', TRUE),
  ('b3333333-3333-3333-3333-333333333333', 'custom_branding', TRUE),
  ('b3333333-3333-3333-3333-333333333333', 'custom_domain', TRUE),
  ('b3333333-3333-3333-3333-333333333333', 'map_tracking', TRUE),
  ('b3333333-3333-3333-3333-333333333333', 'realtime_tracking', TRUE),
  ('b3333333-3333-3333-3333-333333333333', 'advanced_delivery_management', TRUE),
  ('b3333333-3333-3333-3333-333333333333', 'multiple_admins', TRUE),
  ('b3333333-3333-3333-3333-333333333333', 'public_tracking', TRUE),
  ('b4444444-4444-4444-4444-444444444444', 'custom_branding', TRUE),
  ('b4444444-4444-4444-4444-444444444444', 'custom_domain', TRUE),
  ('b4444444-4444-4444-4444-444444444444', 'map_tracking', TRUE),
  ('b4444444-4444-4444-4444-444444444444', 'realtime_tracking', TRUE),
  ('b4444444-4444-4444-4444-444444444444', 'advanced_delivery_management', TRUE),
  ('b4444444-4444-4444-4444-444444444444', 'multiple_admins', TRUE),
  ('b4444444-4444-4444-4444-444444444444', 'public_tracking', TRUE);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select_auth ON public.plans FOR SELECT TO authenticated
  USING (public.is_master_admin() OR is_active = TRUE);
CREATE POLICY plans_write_master ON public.plans FOR ALL TO authenticated
  USING (public.is_master_admin()) WITH CHECK (public.is_master_admin());

CREATE POLICY plan_limits_select_auth ON public.plan_limits FOR SELECT TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.is_active)
  );
CREATE POLICY plan_limits_write_master ON public.plan_limits FOR ALL TO authenticated
  USING (public.is_master_admin()) WITH CHECK (public.is_master_admin());

CREATE POLICY plan_features_select_auth ON public.plan_features FOR SELECT TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.is_active)
  );
CREATE POLICY plan_features_write_master ON public.plan_features FOR ALL TO authenticated
  USING (public.is_master_admin()) WITH CHECK (public.is_master_admin());

-- Tenant admin: own subscription (no internal_notes via view/RPC preferred;
-- column-level not available — strip notes in API for tenants)
CREATE POLICY company_subscriptions_select ON public.company_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin()
    OR (
      company_id = public.auth_company_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );
CREATE POLICY company_subscriptions_write_master ON public.company_subscriptions
  FOR ALL TO authenticated
  USING (public.is_master_admin()) WITH CHECK (public.is_master_admin());

-- Payments: Master Admin only
CREATE POLICY payments_master_all ON public.payments FOR ALL TO authenticated
  USING (public.is_master_admin()) WITH CHECK (public.is_master_admin());

-- Events: master all; tenant admin can read own company events (safe types)
CREATE POLICY subscription_events_select ON public.subscription_events
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin()
    OR (
      company_id = public.auth_company_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );
CREATE POLICY subscription_events_insert_master ON public.subscription_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin());

-- -----------------------------------------------------------------------------
-- Helpers + RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_subscription_event(
  p_company_id UUID,
  p_subscription_id UUID,
  p_event_type TEXT,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscription_events (
    company_id, subscription_id, event_type, actor_user_id,
    old_values, new_values, notes
  ) VALUES (
    p_company_id, p_subscription_id, p_event_type, auth.uid(),
    p_old_values, p_new_values, NULLIF(btrim(COALESCE(p_notes, '')), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_default_plan_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.plans
  WHERE is_default AND is_active
  ORDER BY sort_order LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.master_upsert_plan(
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT DEFAULT NULL,
  p_price_monthly_cents INTEGER DEFAULT 0,
  p_price_yearly_cents INTEGER DEFAULT 0,
  p_currency TEXT DEFAULT 'USD',
  p_is_active BOOLEAN DEFAULT TRUE,
  p_is_default BOOLEAN DEFAULT FALSE,
  p_sort_order INTEGER DEFAULT 0,
  p_limits JSONB DEFAULT '{}'::jsonb,
  p_features JSONB DEFAULT '{}'::jsonb,
  p_plan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plans;
  v_slug TEXT;
  v_cur TEXT;
  v_key TEXT;
  v_val INTEGER;
  v_enabled BOOLEAN;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can manage plans';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Plan name is required';
  END IF;

  v_slug := lower(btrim(COALESCE(p_slug, '')));
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid plan slug';
  END IF;

  IF p_price_monthly_cents < 0 OR p_price_yearly_cents < 0 THEN
    RAISE EXCEPTION 'Prices must be non-negative integer cents';
  END IF;

  v_cur := upper(btrim(COALESCE(p_currency, 'USD')));
  IF v_cur !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code';
  END IF;

  IF COALESCE(p_is_default, FALSE) THEN
    UPDATE public.plans SET is_default = FALSE
    WHERE is_default AND (p_plan_id IS NULL OR id <> p_plan_id);
  END IF;

  IF p_plan_id IS NULL THEN
    INSERT INTO public.plans (
      name, slug, description, price_monthly_cents, price_yearly_cents,
      currency, is_active, is_default, sort_order
    ) VALUES (
      btrim(p_name), v_slug, NULLIF(btrim(COALESCE(p_description, '')), ''),
      p_price_monthly_cents, p_price_yearly_cents, v_cur,
      COALESCE(p_is_active, TRUE), COALESCE(p_is_default, FALSE),
      COALESCE(p_sort_order, 0)
    ) RETURNING * INTO v_plan;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
      RAISE EXCEPTION 'Plan not found';
    END IF;
    UPDATE public.plans SET
      name = btrim(p_name),
      slug = v_slug,
      description = NULLIF(btrim(COALESCE(p_description, '')), ''),
      price_monthly_cents = p_price_monthly_cents,
      price_yearly_cents = p_price_yearly_cents,
      currency = v_cur,
      is_active = COALESCE(p_is_active, TRUE),
      is_default = COALESCE(p_is_default, FALSE),
      sort_order = COALESCE(p_sort_order, 0),
      updated_at = timezone('utc', now())
    WHERE id = p_plan_id
    RETURNING * INTO v_plan;
  END IF;

  DELETE FROM public.plan_limits WHERE plan_id = v_plan.id;
  IF p_limits IS NOT NULL AND jsonb_typeof(p_limits) = 'object' THEN
    FOR v_key, v_val IN SELECT key, (value #>> '{}')::integer FROM jsonb_each(p_limits)
    LOOP
      IF v_key !~ '^[a-z][a-z0-9_]*$' OR v_val IS NULL OR (v_val <> -1 AND v_val < 0) THEN
        RAISE EXCEPTION 'Invalid limit %', v_key;
      END IF;
      INSERT INTO public.plan_limits VALUES (v_plan.id, v_key, v_val);
    END LOOP;
  END IF;

  DELETE FROM public.plan_features WHERE plan_id = v_plan.id;
  IF p_features IS NOT NULL AND jsonb_typeof(p_features) = 'object' THEN
    FOR v_key, v_enabled IN SELECT key, (value #>> '{}')::boolean FROM jsonb_each(p_features)
    LOOP
      IF v_key !~ '^[a-z][a-z0-9_]*$' THEN
        RAISE EXCEPTION 'Invalid feature %', v_key;
      END IF;
      INSERT INTO public.plan_features VALUES (v_plan.id, v_key, COALESCE(v_enabled, FALSE));
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'limits', COALESCE((
      SELECT jsonb_object_agg(limit_key, limit_value) FROM public.plan_limits WHERE plan_id = v_plan.id
    ), '{}'::jsonb),
    'features', COALESCE((
      SELECT jsonb_object_agg(feature_key, enabled) FROM public.plan_features WHERE plan_id = v_plan.id
    ), '{}'::jsonb)
  );
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Plan slug already exists';
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_plan_active(
  p_plan_id UUID,
  p_is_active BOOLEAN
)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plans;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can change plan status';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;

  IF NOT COALESCE(p_is_active, FALSE) AND v_plan.is_default THEN
    RAISE EXCEPTION 'Cannot deactivate the default plan. Assign another default first.';
  END IF;

  UPDATE public.plans SET
    is_active = COALESCE(p_is_active, FALSE),
    updated_at = timezone('utc', now())
  WHERE id = p_plan_id
  RETURNING * INTO v_plan;

  RETURN v_plan;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_record_payment(
  p_company_id UUID,
  p_amount_cents INTEGER,
  p_currency TEXT,
  p_payment_method public.manual_payment_method,
  p_payment_date DATE DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_plan_id UUID DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_sub_id UUID;
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

  SELECT id INTO v_sub_id FROM public.company_subscriptions WHERE company_id = p_company_id;

  INSERT INTO public.payments (
    company_id, amount_cents, currency, payment_method, payment_date,
    reference, notes, status, recorded_by, plan_id, subscription_id
  ) VALUES (
    p_company_id,
    p_amount_cents,
    v_cur,
    p_payment_method,
    COALESCE(p_payment_date, (timezone('utc', now()))::date),
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'recorded',
    auth.uid(),
    p_plan_id,
    v_sub_id
  )
  RETURNING * INTO v_pay;

  PERFORM public.record_subscription_event(
    p_company_id, v_sub_id, 'payment_recorded',
    NULL, to_jsonb(v_pay), NULL
  );

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
  v_old JSONB;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can void payments';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_pay.status = 'voided' THEN RAISE EXCEPTION 'Payment already voided'; END IF;

  v_old := to_jsonb(v_pay);

  UPDATE public.payments SET
    status = 'voided',
    voided_at = timezone('utc', now()),
    voided_by = auth.uid(),
    void_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_payment_id
  RETURNING * INTO v_pay;

  PERFORM public.record_subscription_event(
    v_pay.company_id, v_pay.subscription_id, 'payment_voided',
    v_old, to_jsonb(v_pay), p_reason
  );

  RETURN v_pay;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_company_subscription(
  p_company_id UUID,
  p_plan_id UUID,
  p_status public.manual_subscription_status,
  p_billing_interval public.manual_billing_interval DEFAULT 'monthly',
  p_account_type public.manual_account_type DEFAULT 'paid',
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_internal_notes TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT 'subscription_updated'
)
RETURNS public.company_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.company_subscriptions;
  v_old JSONB;
  v_plan public.plans;
  v_event TEXT;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can manage subscriptions';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;

  SELECT to_jsonb(s) INTO v_old
  FROM public.company_subscriptions s WHERE s.company_id = p_company_id;

  INSERT INTO public.company_subscriptions (
    company_id, plan_id, status, billing_interval, account_type,
    starts_at, expires_at, internal_notes
  ) VALUES (
    p_company_id, p_plan_id, p_status, p_billing_interval, p_account_type,
    p_starts_at, p_expires_at,
    NULLIF(btrim(COALESCE(p_internal_notes, '')), '')
  )
  ON CONFLICT (company_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    billing_interval = EXCLUDED.billing_interval,
    account_type = EXCLUDED.account_type,
    starts_at = EXCLUDED.starts_at,
    expires_at = EXCLUDED.expires_at,
    internal_notes = COALESCE(
      EXCLUDED.internal_notes,
      public.company_subscriptions.internal_notes
    ),
    updated_at = timezone('utc', now())
  RETURNING * INTO v_sub;

  v_event := COALESCE(NULLIF(btrim(p_event_type), ''), 'subscription_updated');
  IF v_old IS NULL THEN
    v_event := CASE
      WHEN p_status = 'active' THEN 'subscription_activated'
      WHEN p_status = 'complimentary' THEN 'subscription_activated'
      WHEN p_status = 'pending' THEN 'subscription_pending'
      ELSE v_event
    END;
  ELSIF (v_old->>'plan_id')::uuid IS DISTINCT FROM p_plan_id THEN
    v_event := 'plan_changed';
  ELSIF (v_old->>'status') IS DISTINCT FROM p_status::text THEN
    IF p_status = 'active' THEN v_event := 'subscription_activated';
    ELSIF p_status = 'cancelled' THEN v_event := 'subscription_cancelled';
    ELSIF p_status = 'expired' THEN v_event := 'subscription_expired';
    ELSE v_event := 'subscription_status_changed';
    END IF;
  ELSIF (v_old->>'expires_at') IS DISTINCT FROM COALESCE(p_expires_at::text, '') THEN
    v_event := 'subscription_extended';
  END IF;

  PERFORM public.record_subscription_event(
    p_company_id, v_sub.id, v_event, v_old, to_jsonb(v_sub), NULL
  );

  RETURN v_sub;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_extend_subscription(
  p_company_id UUID,
  p_extend_days INTEGER DEFAULT NULL,
  p_new_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.company_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.company_subscriptions;
  v_old JSONB;
  v_base TIMESTAMPTZ;
  v_new TIMESTAMPTZ;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can extend subscriptions';
  END IF;

  SELECT * INTO v_sub FROM public.company_subscriptions WHERE company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;

  v_old := to_jsonb(v_sub);

  IF p_new_expires_at IS NOT NULL THEN
    v_new := p_new_expires_at;
  ELSE
    IF p_extend_days IS NULL OR p_extend_days <= 0 THEN
      RAISE EXCEPTION 'Provide extend_days or new_expires_at';
    END IF;
    v_base := COALESCE(
      GREATEST(v_sub.expires_at, timezone('utc', now())),
      timezone('utc', now())
    );
    v_new := v_base + make_interval(days => p_extend_days);
  END IF;

  UPDATE public.company_subscriptions SET
    expires_at = v_new,
    status = CASE
      WHEN status IN ('expired', 'pending') THEN 'active'::public.manual_subscription_status
      WHEN status = 'complimentary' THEN status
      ELSE 'active'::public.manual_subscription_status
    END,
    starts_at = COALESCE(starts_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  WHERE company_id = p_company_id
  RETURNING * INTO v_sub;

  PERFORM public.record_subscription_event(
    p_company_id, v_sub.id, 'subscription_renewed', v_old, to_jsonb(v_sub), NULL
  );

  RETURN v_sub;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_billing_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start DATE;
  v_year_start DATE;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can view billing stats';
  END IF;

  v_month_start := date_trunc('month', timezone('utc', now()))::date;
  v_year_start := date_trunc('year', timezone('utc', now()))::date;

  RETURN jsonb_build_object(
    'total_companies', (SELECT count(*)::int FROM public.companies),
    'active_subscriptions', (
      SELECT count(*)::int FROM public.company_subscriptions
      WHERE status IN ('active', 'complimentary')
    ),
    'expired_subscriptions', (
      SELECT count(*)::int FROM public.company_subscriptions WHERE status = 'expired'
    ),
    'pending_subscriptions', (
      SELECT count(*)::int FROM public.company_subscriptions WHERE status = 'pending'
    ),
    'revenue_total_cents', (
      SELECT COALESCE(sum(amount_cents), 0)::bigint FROM public.payments
      WHERE status = 'recorded'
    ),
    'revenue_month_cents', (
      SELECT COALESCE(sum(amount_cents), 0)::bigint FROM public.payments
      WHERE status = 'recorded' AND payment_date >= v_month_start
    ),
    'revenue_year_cents', (
      SELECT COALESCE(sum(amount_cents), 0)::bigint FROM public.payments
      WHERE status = 'recorded' AND payment_date >= v_year_start
    ),
    'by_plan', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_order)
      FROM (
        SELECT p.id, p.name, p.slug, p.sort_order, count(cs.id)::int AS companies
        FROM public.plans p
        LEFT JOIN public.company_subscriptions cs ON cs.plan_id = p.id
        GROUP BY p.id
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

-- Extend provision with manual billing fields
DROP FUNCTION IF EXISTS public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

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
  p_plan_id UUID DEFAULT NULL,
  p_billing_interval public.manual_billing_interval DEFAULT 'monthly',
  p_account_type public.manual_account_type DEFAULT 'paid',
  p_payment_received BOOLEAN DEFAULT FALSE,
  p_payment_amount_cents INTEGER DEFAULT NULL,
  p_payment_currency TEXT DEFAULT NULL,
  p_payment_method public.manual_payment_method DEFAULT NULL,
  p_payment_date DATE DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL,
  p_subscription_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_subscription_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_subscription_notes TEXT DEFAULT NULL
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
  v_plan_id UUID;
  v_sub public.company_subscriptions;
  v_pay public.payments;
  v_status public.manual_subscription_status;
  v_starts TIMESTAMPTZ;
  v_expires TIMESTAMPTZ;
  v_now TIMESTAMPTZ := timezone('utc', now());
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

  v_plan_id := COALESCE(p_plan_id, public.get_default_plan_id());
  IF v_plan_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.plans WHERE id = v_plan_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Selected plan is not available';
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

  v_starts := COALESCE(p_subscription_starts_at, v_now);
  IF p_subscription_expires_at IS NOT NULL THEN
    v_expires := p_subscription_expires_at;
  ELSIF p_billing_interval = 'yearly' THEN
    v_expires := v_starts + interval '1 year';
  ELSE
    v_expires := v_starts + interval '1 month';
  END IF;

  IF p_account_type = 'complimentary' THEN
    v_status := 'complimentary';
  ELSIF COALESCE(p_payment_received, FALSE) THEN
    v_status := 'active';
  ELSE
    v_status := 'pending';
  END IF;

  v_sub := public.master_set_company_subscription(
    v_company.id,
    v_plan_id,
    v_status,
    COALESCE(p_billing_interval, 'monthly'),
    COALESCE(p_account_type, 'paid'),
    v_starts,
    v_expires,
    p_subscription_notes,
    CASE
      WHEN v_status = 'pending' THEN 'subscription_pending'
      ELSE 'subscription_activated'
    END
  );

  IF COALESCE(p_payment_received, FALSE)
     AND p_account_type IS DISTINCT FROM 'complimentary' THEN
    IF p_payment_amount_cents IS NULL OR p_payment_method IS NULL THEN
      RAISE EXCEPTION 'Payment amount and method are required when payment is received';
    END IF;
    v_pay := public.master_record_payment(
      v_company.id,
      p_payment_amount_cents,
      COALESCE(p_payment_currency, (SELECT currency FROM public.plans WHERE id = v_plan_id)),
      p_payment_method,
      p_payment_date,
      p_payment_reference,
      p_payment_notes,
      v_plan_id
    );
  END IF;

  RETURN jsonb_build_object(
    'company', to_jsonb(v_company),
    'admin', to_jsonb(v_profile),
    'settings', to_jsonb(v_settings),
    'branding', to_jsonb(v_branding),
    'subscription', to_jsonb(v_sub),
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

  DELETE FROM public.subscription_events WHERE company_id = p_company_id;
  DELETE FROM public.payments WHERE company_id = p_company_id;
  DELETE FROM public.company_subscriptions WHERE company_id = p_company_id;
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
    NULL, NULL, NULL, NULL, NULL
  );
  RETURN jsonb_build_object(
    'company', v_result->'company',
    'admin', v_result->'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_event(UUID, UUID, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_default_plan_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_upsert_plan(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BOOLEAN, BOOLEAN, INTEGER, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_set_plan_active(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_record_payment(UUID, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_void_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_set_company_subscription(UUID, UUID, public.manual_subscription_status, public.manual_billing_interval, public.manual_account_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_extend_subscription(UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_billing_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_default_plan_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_upsert_plan(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BOOLEAN, BOOLEAN, INTEGER, JSONB, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_set_plan_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_record_payment(UUID, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_void_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_set_company_subscription(UUID, UUID, public.manual_subscription_status, public.manual_billing_interval, public.manual_account_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_extend_subscription(UUID, INTEGER, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_billing_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_provision_company(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  UUID, public.manual_billing_interval, public.manual_account_type,
  BOOLEAN, INTEGER, TEXT, public.manual_payment_method, DATE, TEXT, TEXT,
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_rollback_company_provision(UUID) TO authenticated;

COMMENT ON TABLE public.payments IS
  'Manual offline payment records. No card data. Master Admin only.';
COMMENT ON TABLE public.company_subscriptions IS
  'Commercial subscription state. Independent of companies.status. No auto-suspend.';
