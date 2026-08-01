-- =============================================================================
-- Delivery lifecycle RPCs (atomic, SECURITY DEFINER)
-- =============================================================================

-- Soften company enforcement so migrations/seed/service-role paths work
CREATE OR REPLACE FUNCTION public.deliveries_enforce_admin_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No JWT: trusted server path (migrations, seed, service role without user context)
  IF auth.uid() IS NULL THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'company_id is required';
    END IF;
    RETURN NEW;
  END IF;

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

-- -----------------------------------------------------------------------------
-- Create a delivery with ordered stops in one transaction
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_delivery_with_stops(
  p_customer_id UUID,
  p_stops JSONB,
  p_reference_number TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_weight NUMERIC DEFAULT NULL,
  p_estimated_delivery_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_delivery public.deliveries;
  v_stop JSONB;
  v_stop_id UUID;
  v_first_stop_id UUID;
  v_order INTEGER := 0;
  v_lat NUMERIC;
  v_lng NUMERIC;
  v_name TEXT;
  v_origin_name TEXT;
  v_origin_lat NUMERIC;
  v_origin_lng NUMERIC;
  v_dest_name TEXT;
  v_dest_lat NUMERIC;
  v_dest_lng NUMERIC;
  v_stop_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can create deliveries'
      USING ERRCODE = '42501';
  END IF;

  v_company_id := public.auth_company_id();

  IF p_stops IS NULL OR jsonb_typeof(p_stops) <> 'array' THEN
    RAISE EXCEPTION 'p_stops must be a non-empty JSON array';
  END IF;

  v_stop_count := jsonb_array_length(p_stops);
  IF v_stop_count < 2 THEN
    RAISE EXCEPTION 'A delivery requires at least 2 stops (origin and destination)';
  END IF;

  -- Origin = first stop, destination = last stop
  v_origin_name := p_stops->0->>'name';
  v_origin_lat := (p_stops->0->>'latitude')::NUMERIC;
  v_origin_lng := (p_stops->0->>'longitude')::NUMERIC;
  v_dest_name := p_stops->(v_stop_count - 1)->>'name';
  v_dest_lat := (p_stops->(v_stop_count - 1)->>'latitude')::NUMERIC;
  v_dest_lng := (p_stops->(v_stop_count - 1)->>'longitude')::NUMERIC;

  IF v_origin_name IS NULL OR v_dest_name IS NULL THEN
    RAISE EXCEPTION 'Each stop must include name, latitude, and longitude';
  END IF;

  INSERT INTO public.deliveries (
    company_id,
    customer_id,
    reference_number,
    description,
    weight,
    origin_name,
    origin_latitude,
    origin_longitude,
    destination_name,
    destination_latitude,
    destination_longitude,
    status,
    estimated_delivery_at
  )
  VALUES (
    v_company_id,
    p_customer_id,
    p_reference_number,
    p_description,
    p_weight,
    v_origin_name,
    v_origin_lat,
    v_origin_lng,
    v_dest_name,
    v_dest_lat,
    v_dest_lng,
    'pending',
    p_estimated_delivery_at
  )
  RETURNING * INTO v_delivery;

  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops)
  LOOP
    v_order := v_order + 1;
    v_name := v_stop->>'name';
    v_lat := (v_stop->>'latitude')::NUMERIC;
    v_lng := (v_stop->>'longitude')::NUMERIC;

    IF v_name IS NULL OR v_lat IS NULL OR v_lng IS NULL THEN
      RAISE EXCEPTION 'Stop % is missing name/latitude/longitude', v_order;
    END IF;

    INSERT INTO public.delivery_stops (
      delivery_id,
      name,
      latitude,
      longitude,
      stop_order,
      status,
      arrived_at
    )
    VALUES (
      v_delivery.id,
      v_name,
      v_lat,
      v_lng,
      v_order,
      CASE WHEN v_order = 1 THEN 'current'::public.stop_status ELSE 'upcoming'::public.stop_status END,
      CASE WHEN v_order = 1 THEN timezone('utc', now()) ELSE NULL END
    )
    RETURNING id INTO v_stop_id;

    IF v_order = 1 THEN
      v_first_stop_id := v_stop_id;
    END IF;
  END LOOP;

  UPDATE public.deliveries
  SET
    current_stop_id = v_first_stop_id,
    status = 'at_stop',
    updated_at = timezone('utc', now())
  WHERE id = v_delivery.id
  RETURNING * INTO v_delivery;

  INSERT INTO public.delivery_location_history (
    delivery_id,
    stop_id,
    location_name,
    latitude,
    longitude,
    event_type,
    notes
  )
  VALUES (
    v_delivery.id,
    v_first_stop_id,
    v_origin_name,
    v_origin_lat,
    v_origin_lng,
    'created',
    'Delivery created; origin set as current stop'
  );

  RETURN v_delivery;
END;
$$;

-- -----------------------------------------------------------------------------
-- Proceed to the next stop (core business action — atomic)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proceed_to_next_stop(p_delivery_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries;
  v_current public.delivery_stops;
  v_next public.delivery_stops;
  v_is_final BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can proceed a delivery'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_delivery.company_id IS DISTINCT FROM public.auth_company_id() THEN
    RAISE EXCEPTION 'Delivery does not belong to your company'
      USING ERRCODE = '42501';
  END IF;

  IF v_delivery.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot proceed a delivery with status %', v_delivery.status;
  END IF;

  SELECT *
  INTO v_current
  FROM public.delivery_stops
  WHERE delivery_id = p_delivery_id
    AND status = 'current'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery has no current stop';
  END IF;

  SELECT *
  INTO v_next
  FROM public.delivery_stops
  WHERE delivery_id = p_delivery_id
    AND stop_order = v_current.stop_order + 1
  FOR UPDATE;

  v_is_final := NOT FOUND;

  IF v_is_final THEN
    -- Already at the final destination: complete the delivery (no further stop)
    UPDATE public.delivery_stops
    SET
      status = 'completed',
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    WHERE id = v_current.id;

    UPDATE public.deliveries
    SET
      status = 'delivered',
      current_stop_id = v_current.id,
      updated_at = timezone('utc', now())
    WHERE id = p_delivery_id
    RETURNING * INTO v_delivery;

    INSERT INTO public.delivery_location_history (
      delivery_id,
      stop_id,
      location_name,
      latitude,
      longitude,
      event_type,
      notes
    )
    VALUES (
      p_delivery_id,
      v_current.id,
      v_current.name,
      v_current.latitude,
      v_current.longitude,
      'delivered',
      'Delivery completed at final destination'
    );
  ELSE
    -- Depart current stop
    UPDATE public.delivery_stops
    SET
      status = 'completed',
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    WHERE id = v_current.id;

    INSERT INTO public.delivery_location_history (
      delivery_id,
      stop_id,
      location_name,
      latitude,
      longitude,
      event_type,
      notes
    )
    VALUES (
      p_delivery_id,
      v_current.id,
      v_current.name,
      v_current.latitude,
      v_current.longitude,
      'departed',
      format('Departed %s', v_current.name)
    );

    -- Arrive at exactly the next stop, then stop (no auto-advance)
    UPDATE public.delivery_stops
    SET
      status = 'current',
      arrived_at = COALESCE(arrived_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
    WHERE id = v_next.id;

    UPDATE public.deliveries
    SET
      current_stop_id = v_next.id,
      status = 'at_stop',
      updated_at = timezone('utc', now())
    WHERE id = p_delivery_id
    RETURNING * INTO v_delivery;

    INSERT INTO public.delivery_location_history (
      delivery_id,
      stop_id,
      location_name,
      latitude,
      longitude,
      event_type,
      notes
    )
    VALUES (
      p_delivery_id,
      v_next.id,
      v_next.name,
      v_next.latitude,
      v_next.longitude,
      'arrived',
      format('Arrived at %s', v_next.name)
    );
  END IF;

  RETURN jsonb_build_object(
    'delivery', to_jsonb(v_delivery),
    'previous_stop_id', v_current.id,
    'current_stop_id', v_delivery.current_stop_id,
    'is_delivered', v_delivery.status = 'delivered',
    'status', v_delivery.status
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Admin: set delivery status (delayed / cancelled / in_transit) with history
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_delivery_status(
  p_delivery_id UUID,
  p_status public.delivery_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can update delivery status'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending', 'in_transit', 'at_stop', 'delivered', 'cancelled', 'delayed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF v_delivery.company_id IS DISTINCT FROM public.auth_company_id() THEN
    RAISE EXCEPTION 'Delivery does not belong to your company'
      USING ERRCODE = '42501';
  END IF;

  -- Delivered/cancelled transitions should go through proceed or explicit cancel
  IF v_delivery.status = 'delivered' AND p_status <> 'delivered' THEN
    RAISE EXCEPTION 'Cannot change status of a delivered shipment';
  END IF;

  UPDATE public.deliveries
  SET
    status = p_status,
    updated_at = timezone('utc', now())
  WHERE id = p_delivery_id
  RETURNING * INTO v_delivery;

  INSERT INTO public.delivery_location_history (
    delivery_id,
    stop_id,
    location_name,
    latitude,
    longitude,
    event_type,
    notes
  )
  SELECT
    v_delivery.id,
    v_delivery.current_stop_id,
    COALESCE(s.name, v_delivery.origin_name),
    COALESCE(s.latitude, v_delivery.origin_latitude),
    COALESCE(s.longitude, v_delivery.origin_longitude),
    CASE p_status
      WHEN 'cancelled' THEN 'cancelled'::public.location_event_type
      WHEN 'delayed' THEN 'delayed'::public.location_event_type
      WHEN 'delivered' THEN 'delivered'::public.location_event_type
      WHEN 'in_transit' THEN 'departed'::public.location_event_type
      WHEN 'at_stop' THEN 'at_stop'::public.location_event_type
      ELSE 'status_change'::public.location_event_type
    END,
    COALESCE(p_notes, format('Status changed to %s', p_status))
  FROM (SELECT 1) AS _
  LEFT JOIN public.delivery_stops s ON s.id = v_delivery.current_stop_id;

  RETURN v_delivery;
END;
$$;

-- -----------------------------------------------------------------------------
-- Reorder / replace stops for a non-delivered delivery (admin)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_delivery_stops(
  p_delivery_id UUID,
  p_stops JSONB
)
RETURNS SETOF public.delivery_stops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries;
  v_stop JSONB;
  v_order INTEGER := 0;
  v_current_order INTEGER;
  v_new_current_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can modify stops'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF v_delivery.company_id IS DISTINCT FROM public.auth_company_id() THEN
    RAISE EXCEPTION 'Delivery does not belong to your company'
      USING ERRCODE = '42501';
  END IF;

  IF v_delivery.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot modify stops on a % delivery', v_delivery.status;
  END IF;

  IF p_stops IS NULL OR jsonb_array_length(p_stops) < 2 THEN
    RAISE EXCEPTION 'At least 2 stops are required';
  END IF;

  -- Preserve progress: keep current stop_order if possible
  SELECT stop_order INTO v_current_order
  FROM public.delivery_stops
  WHERE id = v_delivery.current_stop_id;

  IF v_current_order IS NULL THEN
    v_current_order := 1;
  END IF;

  IF v_current_order > jsonb_array_length(p_stops) THEN
    RAISE EXCEPTION 'Cannot remove stops that have already been passed';
  END IF;

  -- Clear FK then replace stops
  UPDATE public.deliveries
  SET current_stop_id = NULL
  WHERE id = p_delivery_id;

  DELETE FROM public.delivery_stops
  WHERE delivery_id = p_delivery_id;

  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops)
  LOOP
    v_order := v_order + 1;

    INSERT INTO public.delivery_stops (
      delivery_id,
      name,
      latitude,
      longitude,
      stop_order,
      status,
      arrived_at,
      completed_at
    )
    VALUES (
      p_delivery_id,
      v_stop->>'name',
      (v_stop->>'latitude')::NUMERIC,
      (v_stop->>'longitude')::NUMERIC,
      v_order,
      CASE
        WHEN v_order < v_current_order THEN 'completed'::public.stop_status
        WHEN v_order = v_current_order THEN 'current'::public.stop_status
        ELSE 'upcoming'::public.stop_status
      END,
      CASE WHEN v_order <= v_current_order THEN timezone('utc', now()) ELSE NULL END,
      CASE WHEN v_order < v_current_order THEN timezone('utc', now()) ELSE NULL END
    )
    RETURNING id INTO v_new_current_id;

    IF v_order = v_current_order THEN
      UPDATE public.deliveries
      SET
        current_stop_id = v_new_current_id,
        origin_name = p_stops->0->>'name',
        origin_latitude = (p_stops->0->>'latitude')::NUMERIC,
        origin_longitude = (p_stops->0->>'longitude')::NUMERIC,
        destination_name = p_stops->(jsonb_array_length(p_stops) - 1)->>'name',
        destination_latitude = (p_stops->(jsonb_array_length(p_stops) - 1)->>'latitude')::NUMERIC,
        destination_longitude = (p_stops->(jsonb_array_length(p_stops) - 1)->>'longitude')::NUMERIC,
        updated_at = timezone('utc', now())
      WHERE id = p_delivery_id;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT *
  FROM public.delivery_stops
  WHERE delivery_id = p_delivery_id
  ORDER BY stop_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery_with_stops(UUID, JSONB, TEXT, TEXT, NUMERIC, TIMESTAMPTZ)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.proceed_to_next_stop(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(UUID, public.delivery_status, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_delivery_stops(UUID, JSONB) TO authenticated;
