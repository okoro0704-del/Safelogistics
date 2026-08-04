-- Run in Supabase SQL Editor if Create App fails with:
-- company_branding_support_email check constraint

ALTER TABLE public.company_branding
  DROP CONSTRAINT IF EXISTS company_branding_support_email;

ALTER TABLE public.company_branding
  ADD CONSTRAINT company_branding_support_email CHECK (
    support_email IS NULL
    OR support_email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  );
