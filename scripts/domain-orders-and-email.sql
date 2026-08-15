-- Domain purchase orders (Namecheap) + email inbox (Resend)
-- Extends company_domains for registrar metadata.

-- ---------------------------------------------------------------------------
-- company_domains: acquisition metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_domains
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS registrar_order_id TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.company_domains
  DROP CONSTRAINT IF EXISTS company_domains_acquisition_source_check;
ALTER TABLE public.company_domains
  ADD CONSTRAINT company_domains_acquisition_source_check
  CHECK (acquisition_source IN ('manual', 'namecheap'));

-- ---------------------------------------------------------------------------
-- domain_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domain_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_domain_id UUID REFERENCES public.company_domains(id) ON DELETE SET NULL,
  domain TEXT NOT NULL,
  normalized_domain TEXT NOT NULL,
  years INTEGER NOT NULL DEFAULT 1 CHECK (years >= 1 AND years <= 10),
  namecheap_order_id TEXT,
  cost_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'purchased', 'failed', 'cancelled')),
  contact_snapshot JSONB,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS domain_orders_company_id_idx
  ON public.domain_orders (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS domain_orders_normalized_domain_idx
  ON public.domain_orders (normalized_domain);

ALTER TABLE public.domain_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domain_orders_master_all ON public.domain_orders;
CREATE POLICY domain_orders_master_all ON public.domain_orders
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS domain_orders_tenant_select ON public.domain_orders;
CREATE POLICY domain_orders_tenant_select ON public.domain_orders
  FOR SELECT TO authenticated
  USING (
    public.same_company(company_id)
    OR public.is_master_admin()
  );

-- ---------------------------------------------------------------------------
-- Email (Resend)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  normalized_domain TEXT NOT NULL,
  resend_domain_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'failed')),
  last_error TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_email_domains_company_domain_unique
    UNIQUE (company_id, normalized_domain)
);

CREATE INDEX IF NOT EXISTS company_email_domains_company_id_idx
  ON public.company_email_domains (company_id);

ALTER TABLE public.company_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_email_domains_master_all ON public.company_email_domains;
CREATE POLICY company_email_domains_master_all ON public.company_email_domains
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS company_email_domains_tenant_select ON public.company_email_domains;
CREATE POLICY company_email_domains_tenant_select ON public.company_email_domains
  FOR SELECT TO authenticated
  USING (
    public.same_company(company_id)
    OR public.is_master_admin()
  );

CREATE TABLE IF NOT EXISTS public.company_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_domain_id UUID NOT NULL REFERENCES public.company_email_domains(id) ON DELETE CASCADE,
  local_part TEXT NOT NULL,
  full_address TEXT NOT NULL,
  mailbox_type TEXT NOT NULL DEFAULT 'app_inbox'
    CHECK (mailbox_type IN ('app_inbox')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_mailboxes_address_unique UNIQUE (full_address),
  CONSTRAINT company_mailboxes_local_part_format CHECK (
    local_part ~ '^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$'
  )
);

CREATE INDEX IF NOT EXISTS company_mailboxes_company_id_idx
  ON public.company_mailboxes (company_id);

ALTER TABLE public.company_mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_mailboxes_master_all ON public.company_mailboxes;
CREATE POLICY company_mailboxes_master_all ON public.company_mailboxes
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS company_mailboxes_tenant_select ON public.company_mailboxes;
CREATE POLICY company_mailboxes_tenant_select ON public.company_mailboxes
  FOR SELECT TO authenticated
  USING (
    public.same_company(company_id)
    OR public.is_master_admin()
  );

CREATE TABLE IF NOT EXISTS public.email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mailbox_id UUID REFERENCES public.company_mailboxes(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT '(no subject)',
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_threads_company_id_idx
  ON public.email_threads (company_id, last_message_at DESC);

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_threads_master_all ON public.email_threads;
CREATE POLICY email_threads_master_all ON public.email_threads
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS email_threads_tenant_admin ON public.email_threads;
CREATE POLICY email_threads_tenant_admin ON public.email_threads
  FOR ALL TO authenticated
  USING (
    public.is_master_admin()
    OR (public.same_company(company_id) AND public.is_admin())
  )
  WITH CHECK (
    public.is_master_admin()
    OR (public.same_company(company_id) AND public.is_admin())
  );

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  mailbox_id UUID REFERENCES public.company_mailboxes(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address TEXT NOT NULL,
  to_addresses TEXT[] NOT NULL DEFAULT '{}',
  cc_addresses TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '(no subject)',
  text_body TEXT,
  html_body TEXT,
  resend_email_id TEXT,
  resend_inbound_id TEXT,
  provider_message_id TEXT,
  raw_headers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_resend_inbound_id_key
  ON public.email_messages (resend_inbound_id)
  WHERE resend_inbound_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_messages_thread_id_idx
  ON public.email_messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS email_messages_company_id_idx
  ON public.email_messages (company_id, created_at DESC);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_messages_master_all ON public.email_messages;
CREATE POLICY email_messages_master_all ON public.email_messages
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS email_messages_tenant_admin ON public.email_messages;
CREATE POLICY email_messages_tenant_admin ON public.email_messages
  FOR ALL TO authenticated
  USING (
    public.is_master_admin()
    OR (public.same_company(company_id) AND public.is_admin())
  )
  WITH CHECK (
    public.is_master_admin()
    OR (public.same_company(company_id) AND public.is_admin())
  );

CREATE TABLE IF NOT EXISTS public.email_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_message_attachments_message_id_idx
  ON public.email_message_attachments (message_id);

ALTER TABLE public.email_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_message_attachments_tenant ON public.email_message_attachments;
CREATE POLICY email_message_attachments_tenant ON public.email_message_attachments
  FOR ALL TO authenticated
  USING (
    public.is_master_admin()
    OR (public.same_company(company_id) AND public.is_admin())
  )
  WITH CHECK (
    public.is_master_admin()
    OR (public.same_company(company_id) AND public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_create_domain_order(
  p_company_id UUID,
  p_domain TEXT,
  p_years INTEGER DEFAULT 1,
  p_cost_cents INTEGER DEFAULT NULL,
  p_currency TEXT DEFAULT 'USD',
  p_contact_snapshot JSONB DEFAULT NULL
)
RETURNS public.domain_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host TEXT;
  v_row public.domain_orders;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can create domain orders';
  END IF;

  v_host := public.normalize_hostname(p_domain);
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'Invalid domain hostname';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  INSERT INTO public.domain_orders (
    company_id, domain, normalized_domain, years, cost_cents, currency,
    status, contact_snapshot, created_by
  ) VALUES (
    p_company_id,
    lower(btrim(p_domain)),
    v_host,
    GREATEST(1, LEAST(COALESCE(p_years, 1), 10)),
    p_cost_cents,
    upper(COALESCE(NULLIF(btrim(p_currency), ''), 'USD')),
    'pending',
    p_contact_snapshot,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.master_upsert_company_email_domain(
  p_company_id UUID,
  p_domain TEXT,
  p_resend_domain_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'pending',
  p_last_error TEXT DEFAULT NULL
)
RETURNS public.company_email_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host TEXT;
  v_row public.company_email_domains;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can manage email domains';
  END IF;

  v_host := public.normalize_hostname(p_domain);
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'Invalid email domain';
  END IF;

  IF p_status NOT IN ('pending', 'verified', 'failed') THEN
    RAISE EXCEPTION 'Invalid email domain status';
  END IF;

  INSERT INTO public.company_email_domains (
    company_id, domain, normalized_domain, resend_domain_id, status, last_error,
    verified_at
  ) VALUES (
    p_company_id,
    lower(btrim(p_domain)),
    v_host,
    p_resend_domain_id,
    p_status,
    p_last_error,
    CASE WHEN p_status = 'verified' THEN now() ELSE NULL END
  )
  ON CONFLICT (company_id, normalized_domain) DO UPDATE
  SET
    resend_domain_id = COALESCE(EXCLUDED.resend_domain_id, company_email_domains.resend_domain_id),
    status = EXCLUDED.status,
    last_error = EXCLUDED.last_error,
    verified_at = CASE
      WHEN EXCLUDED.status = 'verified' THEN COALESCE(company_email_domains.verified_at, now())
      ELSE company_email_domains.verified_at
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_ensure_default_mailbox(
  p_email_domain_id UUID,
  p_local_part TEXT DEFAULT 'support'
)
RETURNS public.company_mailboxes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain public.company_email_domains;
  v_local TEXT;
  v_row public.company_mailboxes;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can manage mailboxes';
  END IF;

  SELECT * INTO v_domain FROM public.company_email_domains WHERE id = p_email_domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email domain not found';
  END IF;

  v_local := lower(btrim(COALESCE(p_local_part, 'support')));
  IF v_local = '' THEN
    v_local := 'support';
  END IF;

  INSERT INTO public.company_mailboxes (
    company_id, email_domain_id, local_part, full_address, mailbox_type, is_default
  ) VALUES (
    v_domain.company_id,
    v_domain.id,
    v_local,
    v_local || '@' || v_domain.normalized_domain,
    'app_inbox',
    true
  )
  ON CONFLICT (full_address) DO UPDATE
  SET
    is_default = true,
    updated_at = now()
  RETURNING * INTO v_row;

  UPDATE public.company_mailboxes
  SET is_default = false, updated_at = now()
  WHERE company_id = v_domain.company_id
    AND id <> v_row.id
    AND is_default = true;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.master_create_domain_order(UUID, TEXT, INTEGER, INTEGER, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_complete_domain_order(UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_upsert_company_email_domain(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_ensure_default_mailbox(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.master_create_domain_order(UUID, TEXT, INTEGER, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_complete_domain_order(UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_upsert_company_email_domain(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_ensure_default_mailbox(UUID, TEXT) TO authenticated;
