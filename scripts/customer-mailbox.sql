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
