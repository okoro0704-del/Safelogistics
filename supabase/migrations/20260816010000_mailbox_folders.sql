-- Tenant mailbox folders: inbox / sent / drafts / spam
-- Apply via supabase db push or run in SQL Editor.

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

-- Existing threads with only outbound messages → sent
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

COMMENT ON COLUMN public.email_threads.folder IS
  'Mailbox folder: inbox | sent | drafts | spam';
COMMENT ON COLUMN public.email_threads.is_read IS
  'Unread state for inbox (and spam) threads';
