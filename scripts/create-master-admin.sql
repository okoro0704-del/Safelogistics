-- =============================================================================
-- DEPRECATED for hosted Supabase Auth password login.
-- Raw SQL password hashes (crypt/bf) are often REJECTED by GoTrue sign-in.
--
-- Use instead (after deploy):
--   https://YOUR_SITE.netlify.app/hub/setup
--
-- That page calls the Auth Admin API with SUPABASE_SERVICE_ROLE_KEY and creates
-- a real login + master_admin profile.
--
-- If you only need to promote an EXISTING Auth user (created in Dashboard):
-- =============================================================================

ALTER TABLE public.profiles DISABLE TRIGGER profiles_protect_security_fields;

UPDATE public.profiles
SET role = 'master_admin', company_id = NULL
WHERE lower(email) = lower('YOUR_LOGIN_EMAIL@example.com');

-- If no profile row exists yet for that Auth user:
INSERT INTO public.profiles (id, email, full_name, role, company_id)
SELECT u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', 'Platform Master'),
       'master_admin', NULL
FROM auth.users u
WHERE lower(u.email) = lower('YOUR_LOGIN_EMAIL@example.com')
ON CONFLICT (id) DO UPDATE
SET role = 'master_admin', company_id = NULL, email = EXCLUDED.email;

ALTER TABLE public.profiles ENABLE TRIGGER profiles_protect_security_fields;

SELECT id, email, role, company_id FROM public.profiles WHERE role = 'master_admin';
