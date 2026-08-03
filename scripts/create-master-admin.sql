-- =============================================================================
-- Create / reset a temporary Master Admin login (run in Supabase SQL Editor)
-- Email:    master@platform.local
-- Password: TempMaster123!
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_id uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  v_email text := 'master@platform.local';
  v_password text := 'TempMaster123!';
  v_hash text := crypt(v_password, gen_salt('bf'));
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_hash,
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Platform Master"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    '', '', '', ''
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = timezone('utc', now()),
    updated_at = timezone('utc', now());

  -- Also reset password if this email already exists under a different id
  UPDATE auth.users
  SET
    encrypted_password = v_hash,
    email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  WHERE lower(email) = lower(v_email);

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    u.id,
    u.id,
    format(
      '{"sub":"%s","email":"%s","email_verified":true,"phone_verified":false}',
      u.id::text, u.email
    )::jsonb,
    'email',
    u.id::text,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  FROM auth.users u
  WHERE lower(u.email) = lower(v_email)
  ON CONFLICT DO NOTHING;

  ALTER TABLE public.profiles DISABLE TRIGGER profiles_protect_security_fields;

  INSERT INTO public.profiles (id, email, full_name, role, company_id)
  SELECT
    u.id,
    u.email,
    'Platform Master',
    'master_admin',
    NULL
  FROM auth.users u
  WHERE lower(u.email) = lower(v_email)
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = 'master_admin',
    company_id = NULL;

  ALTER TABLE public.profiles ENABLE TRIGGER profiles_protect_security_fields;
END $$;

SELECT u.id, u.email, u.email_confirmed_at IS NOT NULL AS confirmed, p.role, p.company_id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = 'master@platform.local';
