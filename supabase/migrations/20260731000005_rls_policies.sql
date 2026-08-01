-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_number_sequences ENABLE ROW LEVEL SECURITY;

-- Sequences are used only by SECURITY DEFINER / trigger paths
CREATE POLICY tracking_sequences_no_direct_access
  ON public.tracking_number_sequences
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- companies
-- -----------------------------------------------------------------------------
CREATE POLICY companies_select_own
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    public.same_company(id)
    OR public.is_master_admin()
  );

CREATE POLICY companies_update_admin
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (public.is_admin() AND public.same_company(id))
  WITH CHECK (public.is_admin() AND public.same_company(id));

-- Inserts for companies are reserved for future master_admin / service role
CREATE POLICY companies_insert_master_admin
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master_admin());

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
CREATE POLICY profiles_select_self_or_company
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (public.is_admin() AND public.same_company(company_id))
    OR public.is_master_admin()
  );

-- Users may update their own non-security fields only (role/company protected by trigger)
CREATE POLICY profiles_update_self
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins may update customers in their company (name/phone/email), not themselves' role
CREATE POLICY profiles_update_company_customers
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    AND role = 'customer'
    AND public.same_company(company_id)
  )
  WITH CHECK (
    public.is_admin()
    AND role = 'customer'
    AND public.same_company(company_id)
  );

-- Profile inserts are performed by service role / Edge Function (bypass RLS)
-- No authenticated INSERT policy on purpose.

-- -----------------------------------------------------------------------------
-- deliveries
-- -----------------------------------------------------------------------------
CREATE POLICY deliveries_select_admin_or_owner
  ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (
    (public.is_admin() AND public.same_company(company_id))
    OR customer_id = auth.uid()
    OR public.is_master_admin()
  );

CREATE POLICY deliveries_insert_admin
  ON public.deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    AND company_id = public.auth_company_id()
  );

CREATE POLICY deliveries_update_admin
  ON public.deliveries
  FOR UPDATE
  TO authenticated
  USING (public.is_admin() AND public.same_company(company_id))
  WITH CHECK (public.is_admin() AND public.same_company(company_id));

CREATE POLICY deliveries_delete_admin
  ON public.deliveries
  FOR DELETE
  TO authenticated
  USING (public.is_admin() AND public.same_company(company_id));

-- -----------------------------------------------------------------------------
-- delivery_stops
-- -----------------------------------------------------------------------------
CREATE POLICY delivery_stops_select_admin_or_owner
  ON public.delivery_stops
  FOR SELECT
  TO authenticated
  USING (
    public.admin_owns_delivery(delivery_id)
    OR public.owns_delivery(delivery_id)
    OR public.is_master_admin()
  );

CREATE POLICY delivery_stops_insert_admin
  ON public.delivery_stops
  FOR INSERT
  TO authenticated
  WITH CHECK (public.admin_owns_delivery(delivery_id));

CREATE POLICY delivery_stops_update_admin
  ON public.delivery_stops
  FOR UPDATE
  TO authenticated
  USING (public.admin_owns_delivery(delivery_id))
  WITH CHECK (public.admin_owns_delivery(delivery_id));

CREATE POLICY delivery_stops_delete_admin
  ON public.delivery_stops
  FOR DELETE
  TO authenticated
  USING (public.admin_owns_delivery(delivery_id));

-- -----------------------------------------------------------------------------
-- delivery_location_history
-- -----------------------------------------------------------------------------
CREATE POLICY delivery_history_select_admin_or_owner
  ON public.delivery_location_history
  FOR SELECT
  TO authenticated
  USING (
    public.admin_owns_delivery(delivery_id)
    OR public.owns_delivery(delivery_id)
    OR public.is_master_admin()
  );

CREATE POLICY delivery_history_insert_admin
  ON public.delivery_location_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.admin_owns_delivery(delivery_id));

-- History is append-only for clients (no update/delete policies)
