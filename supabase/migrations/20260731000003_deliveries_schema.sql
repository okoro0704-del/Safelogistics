-- =============================================================================
-- Deliveries, stops, location history, tracking numbers
-- =============================================================================

-- Per-year sequence for human-readable tracking numbers (DLV-YYYY-NNNNNN)
CREATE TABLE public.tracking_number_sequences (
  year INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT tracking_number_sequences_last_value_nonneg CHECK (last_value >= 0)
);

CREATE OR REPLACE FUNCTION public.generate_tracking_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM timezone('utc', now()))::INTEGER;
  v_next INTEGER;
BEGIN
  INSERT INTO public.tracking_number_sequences AS t (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_value = t.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN format('DLV-%s-%s', v_year, lpad(v_next::TEXT, 6, '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.generate_tracking_number() FROM PUBLIC;

CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  tracking_number TEXT NOT NULL,
  reference_number TEXT,
  description TEXT,
  weight NUMERIC(12, 3),

  origin_name TEXT NOT NULL,
  origin_latitude NUMERIC(10, 7) NOT NULL,
  origin_longitude NUMERIC(10, 7) NOT NULL,

  destination_name TEXT NOT NULL,
  destination_latitude NUMERIC(10, 7) NOT NULL,
  destination_longitude NUMERIC(10, 7) NOT NULL,

  current_stop_id UUID, -- FK added after delivery_stops exists

  status public.delivery_status NOT NULL DEFAULT 'pending',
  estimated_delivery_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT deliveries_tracking_number_format CHECK (
    tracking_number ~ '^DLV-[0-9]{4}-[0-9]{6}$'
  ),
  CONSTRAINT deliveries_weight_nonneg CHECK (weight IS NULL OR weight >= 0),
  CONSTRAINT deliveries_origin_name_not_blank CHECK (length(trim(origin_name)) > 0),
  CONSTRAINT deliveries_destination_name_not_blank CHECK (length(trim(destination_name)) > 0)
);

CREATE UNIQUE INDEX deliveries_tracking_number_key ON public.deliveries (tracking_number);
CREATE INDEX deliveries_company_id_idx ON public.deliveries (company_id);
CREATE INDEX deliveries_customer_id_idx ON public.deliveries (customer_id);
CREATE INDEX deliveries_status_idx ON public.deliveries (status);
CREATE INDEX deliveries_company_status_idx ON public.deliveries (company_id, status);

CREATE TRIGGER deliveries_set_updated_at
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Auto-assign tracking number if omitted
CREATE OR REPLACE FUNCTION public.deliveries_set_tracking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tracking_number IS NULL OR btrim(NEW.tracking_number) = '' THEN
    NEW.tracking_number := public.generate_tracking_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deliveries_assign_tracking_number
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.deliveries_set_tracking_number();

CREATE TABLE public.delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  stop_order INTEGER NOT NULL,
  status public.stop_status NOT NULL DEFAULT 'upcoming',
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT delivery_stops_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT delivery_stops_order_positive CHECK (stop_order >= 1),
  CONSTRAINT delivery_stops_completed_requires_arrived CHECK (
    completed_at IS NULL OR arrived_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX delivery_stops_delivery_order_key
  ON public.delivery_stops (delivery_id, stop_order);

-- Only one current stop per delivery
CREATE UNIQUE INDEX delivery_stops_one_current_per_delivery
  ON public.delivery_stops (delivery_id)
  WHERE status = 'current';

CREATE INDEX delivery_stops_delivery_id_idx ON public.delivery_stops (delivery_id);
CREATE INDEX delivery_stops_status_idx ON public.delivery_stops (status);

CREATE TRIGGER delivery_stops_set_updated_at
  BEFORE UPDATE ON public.delivery_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Circular FK: delivery -> current stop
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_current_stop_id_fkey
  FOREIGN KEY (current_stop_id)
  REFERENCES public.delivery_stops (id)
  ON DELETE SET NULL;

CREATE TABLE public.delivery_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries (id) ON DELETE CASCADE,
  stop_id UUID REFERENCES public.delivery_stops (id) ON DELETE SET NULL,
  location_name TEXT NOT NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  event_type public.location_event_type NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT delivery_location_history_name_not_blank CHECK (
    length(trim(location_name)) > 0
  )
);

CREATE INDEX delivery_location_history_delivery_id_idx
  ON public.delivery_location_history (delivery_id);
CREATE INDEX delivery_location_history_delivery_created_idx
  ON public.delivery_location_history (delivery_id, created_at);
CREATE INDEX delivery_location_history_stop_id_idx
  ON public.delivery_location_history (stop_id);

-- Ensure customer belongs to the same company as the delivery
CREATE OR REPLACE FUNCTION public.validate_delivery_customer_company()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_company UUID;
  v_customer_role public.user_role;
BEGIN
  SELECT company_id, role
  INTO v_customer_company, v_customer_role
  FROM public.profiles
  WHERE id = NEW.customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  IF v_customer_role <> 'customer' THEN
    RAISE EXCEPTION 'delivery.customer_id must reference a customer profile';
  END IF;

  IF v_customer_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Customer does not belong to the delivery company';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER deliveries_validate_customer_company
  BEFORE INSERT OR UPDATE OF customer_id, company_id ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_delivery_customer_company();
