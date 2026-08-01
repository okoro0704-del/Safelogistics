-- =============================================================================
-- Internal helper: create a profile row (called by Edge Function via service role)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_register_customer_profile(
  p_user_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_profile public.profiles;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can register customer profiles'
      USING ERRCODE = '42501';
  END IF;

  v_company_id := public.auth_company_id();

  IF p_user_id IS NULL OR p_full_name IS NULL OR p_email IS NULL THEN
    RAISE EXCEPTION 'user_id, full_name, and email are required';
  END IF;

  INSERT INTO public.profiles (
    id,
    company_id,
    full_name,
    email,
    phone,
    role
  )
  VALUES (
    p_user_id,
    v_company_id,
    btrim(p_full_name),
    lower(btrim(p_email)),
    NULLIF(btrim(p_phone), ''),
    'customer'
  )
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_register_customer_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_register_customer_profile(UUID, TEXT, TEXT, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.admin_register_customer_profile IS
  'Links a newly created Auth user to a customer profile in the admin''s company. '
  'Auth user creation itself must be done via the create-customer Edge Function '
  '(service role). Never expose the service-role key to the browser.';
