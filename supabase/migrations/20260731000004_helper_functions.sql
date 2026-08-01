-- =============================================================================
-- Auth / tenancy helper functions (SECURITY DEFINER, locked search_path)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id IS NOT NULL
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
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'customer'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'master_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.same_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_company_id IS NOT NULL
    AND p_company_id = public.auth_company_id();
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
    WHERE d.id = p_delivery_id
      AND d.customer_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_owns_delivery(p_delivery_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries d
    WHERE d.id = p_delivery_id
      AND public.is_admin()
      AND d.company_id = public.auth_company_id()
  );
$$;

-- Force company_id from the authenticated admin; never trust client input
CREATE OR REPLACE FUNCTION public.deliveries_enforce_admin_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_master_admin() THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'company_id is required';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create or update deliveries';
  END IF;

  NEW.company_id := public.auth_company_id();
  RETURN NEW;
END;
$$;

CREATE TRIGGER deliveries_enforce_admin_company
  BEFORE INSERT OR UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.deliveries_enforce_admin_company();

-- Always generate tracking numbers server-side (ignore client-supplied values)
CREATE OR REPLACE FUNCTION public.deliveries_set_tracking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.tracking_number := public.generate_tracking_number();
  ELSIF TG_OP = 'UPDATE'
    AND NEW.tracking_number IS DISTINCT FROM OLD.tracking_number THEN
    RAISE EXCEPTION 'tracking_number cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.current_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_customer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_master_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.same_company(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_delivery(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_owns_delivery(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.same_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_delivery(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_owns_delivery(UUID) TO authenticated;
