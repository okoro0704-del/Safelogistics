-- =============================================================================
-- Multi-tenant foundation: company status + Master Admin RPCs
-- =============================================================================

CREATE TYPE public.company_status AS ENUM (
  'active',
  'suspended'
);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status public.company_status NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.companies.status IS
  'Administrative lifecycle. suspended blocks company admin/customer operations.';

CREATE INDEX IF NOT EXISTS companies_status_idx ON public.companies (status);

-- Backfill (safe for existing tenants)
UPDATE public.companies
SET status = 'active'
WHERE status IS NULL;

-- -----------------------------------------------------------------------------
-- Active-company helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_is_active(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_company_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.company_is_active(public.auth_company_id());
$$;

-- Admins of suspended companies lose operational privileges
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    INNER JOIN public.companies c ON c.id = p.company_id
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id IS NOT NULL
      AND c.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_customer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    INNER JOIN public.companies c ON c.id = p.company_id
    WHERE p.id = auth.uid()
      AND p.role = 'customer'
      AND p.company_id IS NOT NULL
      AND c.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_delivery(p_delivery_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries d
    INNER JOIN public.companies c ON c.id = d.company_id
    WHERE d.id = p_delivery_id
      AND d.customer_id = auth.uid()
      AND c.status = 'active'
  );
$$;

-- Customer delivery select must also respect suspension
DROP POLICY IF EXISTS deliveries_select_admin_or_owner ON public.deliveries;
CREATE POLICY deliveries_select_admin_or_owner
  ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (
    (public.is_admin() AND public.same_company(company_id))
    OR (
      customer_id = auth.uid()
      AND public.company_is_active(company_id)
    )
    OR public.is_master_admin()
  );

-- Master Admin may update any company (status, metadata)
DROP POLICY IF EXISTS companies_update_master_admin ON public.companies;
CREATE POLICY companies_update_master_admin
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- Company admins must not change status via direct update
CREATE OR REPLACE FUNCTION public.protect_company_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status
    AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can change company status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_protect_status ON public.companies;
CREATE TRIGGER companies_protect_status
  BEFORE UPDATE OF status ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_status();

-- -----------------------------------------------------------------------------
-- Master Admin: create company + first admin profile (auth user created by API)
-- -----------------------------------------------------------------------------
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
  v_slug TEXT;
  v_company public.companies;
  v_profile public.profiles;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can create companies';
  END IF;

  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  v_slug := lower(btrim(COALESCE(p_company_slug, '')));
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Company slug must be lowercase letters, numbers, and hyphens';
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

  IF EXISTS (SELECT 1 FROM public.companies WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Company slug already exists';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_user_id) THEN
    RAISE EXCEPTION 'Admin profile already exists for this user';
  END IF;

  INSERT INTO public.companies (
    name, slug, email, phone, status
  ) VALUES (
    btrim(p_company_name),
    v_slug,
    NULLIF(btrim(COALESCE(p_company_email, '')), ''),
    NULLIF(btrim(COALESCE(p_company_phone, '')), ''),
    'active'
  )
  RETURNING * INTO v_company;

  INSERT INTO public.profiles (
    id, company_id, full_name, email, phone, role
  ) VALUES (
    p_admin_user_id,
    v_company.id,
    btrim(p_admin_full_name),
    lower(btrim(p_admin_email)),
    NULLIF(btrim(COALESCE(p_admin_phone, '')), ''),
    'admin'
  )
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'company', to_jsonb(v_company),
    'admin', to_jsonb(v_profile)
  );
END;
$$;

-- Additional admin for an existing company
CREATE OR REPLACE FUNCTION public.master_register_company_admin(
  p_company_id UUID,
  p_admin_user_id UUID,
  p_admin_full_name TEXT,
  p_admin_email TEXT,
  p_admin_phone TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can create company admins';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  IF p_admin_user_id IS NULL
    OR p_admin_full_name IS NULL OR btrim(p_admin_full_name) = ''
    OR p_admin_email IS NULL OR btrim(p_admin_email) = '' THEN
    RAISE EXCEPTION 'Admin name, email, and user id are required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  INSERT INTO public.profiles (
    id, company_id, full_name, email, phone, role
  ) VALUES (
    p_admin_user_id,
    p_company_id,
    btrim(p_admin_full_name),
    lower(btrim(p_admin_email)),
    NULLIF(btrim(COALESCE(p_admin_phone, '')), ''),
    'admin'
  )
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_company_status(
  p_company_id UUID,
  p_status public.company_status
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company public.companies;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can change company status';
  END IF;

  UPDATE public.companies
  SET status = p_status
  WHERE id = p_company_id
  RETURNING * INTO v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_platform_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Only the platform Master Admin can view platform stats';
  END IF;

  SELECT jsonb_build_object(
    'companies', (SELECT COUNT(*)::INT FROM public.companies),
    'active_companies', (
      SELECT COUNT(*)::INT FROM public.companies WHERE status = 'active'
    ),
    'suspended_companies', (
      SELECT COUNT(*)::INT FROM public.companies WHERE status = 'suspended'
    ),
    'total_deliveries', (SELECT COUNT(*)::INT FROM public.deliveries),
    'active_deliveries', (
      SELECT COUNT(*)::INT
      FROM public.deliveries
      WHERE status IN ('pending', 'in_transit', 'at_stop', 'delayed')
    ),
    'total_admins', (
      SELECT COUNT(*)::INT FROM public.profiles WHERE role = 'admin'
    ),
    'total_customers', (
      SELECT COUNT(*)::INT FROM public.profiles WHERE role = 'customer'
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.company_is_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_company_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_register_company_with_admin(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_register_company_admin(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_set_company_status(UUID, public.company_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_platform_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.company_is_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_company_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_register_company_with_admin(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_register_company_admin(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_set_company_status(UUID, public.company_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_platform_stats() TO authenticated;
