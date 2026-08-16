-- =============================================================================
-- ONE-SHOT: create email tables + folders + customer mailbox
-- Run this entire file in Supabase SQL Editor (not mailbox-folders alone).
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Requires: public.companies, public.profiles, helpers is_master_admin/is_admin/
--           is_customer/same_company, and public.normalize_hostname
-- =============================================================================

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


REVOKE ALL ON FUNCTION public.master_upsert_company_email_domain(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_ensure_default_mailbox(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_upsert_company_email_domain(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_ensure_default_mailbox(UUID, TEXT) TO authenticated;

-- Folders
-- Manual apply: mailbox folders for tenant admin mail UI.
-- Prefer migration 20260816010000_mailbox_folders.sql when using db push.

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_threads_folder_check'
  ) THEN
    ALTER TABLE public.email_threads
      ADD CONSTRAINT email_threads_folder_check
      CHECK (folder IN ('inbox', 'sent', 'drafts', 'spam'));
  END IF;
END $$;

UPDATE public.email_threads t
SET folder = 'sent',
    is_read = true
WHERE t.folder = 'inbox'
  AND EXISTS (
    SELECT 1 FROM public.email_messages m
    WHERE m.thread_id = t.id AND m.direction = 'outbound'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.email_messages m
    WHERE m.thread_id = t.id AND m.direction = 'inbound'
  );

CREATE INDEX IF NOT EXISTS email_threads_company_folder_idx
  ON public.email_threads (company_id, folder, last_message_at DESC);

CREATE INDEX IF NOT EXISTS email_threads_company_unread_idx
  ON public.email_threads (company_id, is_read)
  WHERE is_read = false AND folder = 'inbox';

-- Customer mailbox
-- Manual apply: customer mailbox columns + RLS
-- Prefer migration 20260816020000_customer_mailbox.sql via db push.

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_folder TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS customer_is_read BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_threads_customer_folder_check'
  ) THEN
    ALTER TABLE public.email_threads
      ADD CONSTRAINT email_threads_customer_folder_check
      CHECK (customer_folder IN ('inbox', 'sent', 'drafts', 'spam'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_threads_customer_folder_idx
  ON public.email_threads (customer_id, customer_folder, last_message_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_threads_customer_unread_idx
  ON public.email_threads (customer_id, customer_is_read)
  WHERE customer_id IS NOT NULL
    AND customer_is_read = false
    AND customer_folder = 'inbox';

DROP POLICY IF EXISTS email_threads_tenant_customer ON public.email_threads;
CREATE POLICY email_threads_tenant_customer ON public.email_threads
  FOR ALL TO authenticated
  USING (
    public.is_customer()
    AND customer_id = auth.uid()
    AND public.same_company(company_id)
  )
  WITH CHECK (
    public.is_customer()
    AND customer_id = auth.uid()
    AND public.same_company(company_id)
  );

DROP POLICY IF EXISTS email_messages_tenant_customer ON public.email_messages;
CREATE POLICY email_messages_tenant_customer ON public.email_messages
  FOR ALL TO authenticated
  USING (
    public.is_customer()
    AND public.same_company(company_id)
    AND EXISTS (
      SELECT 1 FROM public.email_threads t
      WHERE t.id = thread_id
        AND t.customer_id = auth.uid()
        AND t.company_id = email_messages.company_id
    )
  )
  WITH CHECK (
    public.is_customer()
    AND public.same_company(company_id)
    AND EXISTS (
      SELECT 1 FROM public.email_threads t
      WHERE t.id = thread_id
        AND t.customer_id = auth.uid()
        AND t.company_id = email_messages.company_id
    )
  );
