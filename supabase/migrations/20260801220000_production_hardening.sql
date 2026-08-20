-- =============================================================================
-- Production hardening (Prompt 13)
-- - High-entropy tracking numbers (non-enumerable)
-- - Public tracking company scope + suspended company block
-- - create_delivery_with_stops customer company check
-- =============================================================================

-- Allow legacy sequential numbers AND new high-entropy format
ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_tracking_number_format;

ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_tracking_number_format CHECK (
    tracking_number ~ '^DLV-[0-9]{4}-[0-9]{6}$'
    OR tracking_number ~ '^DLV-[0-9A-F]{12}$'
  );

CREATE OR REPLACE FUNCTION public.generate_tracking_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate TEXT;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- 12 hex chars ≈ 48 bits entropy; not sequential
    v_candidate := 'DLV-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.deliveries WHERE tracking_number = v_candidate
    );

    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Unable to allocate a unique tracking number';
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Harden public tracking: block suspended companies; keep optional company scope
CREATE OR REPLACE FUNCTION public.get_public_tracking(
  p_tracking_number TEXT,
  p_company_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries;
  v_current public.delivery_stops;
  v_result JSONB;
  v_branding JSONB;
  v_company_status public.company_status;
BEGIN
  IF p_tracking_number IS NULL OR btrim(p_tracking_number) = '' THEN
    RAISE EXCEPTION 'Tracking number is required';
  END IF;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE tracking_number = upper(btrim(p_tracking_number));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No delivery found for this tracking number'
    );
  END IF;

  -- Tenant custom-domain tracking: never reveal cross-company deliveries
  IF p_company_id IS NOT NULL AND v_delivery.company_id <> p_company_id THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No delivery found for this tracking number'
    );
  END IF;

  SELECT status INTO v_company_status
  FROM public.companies
  WHERE id = v_delivery.company_id;

  -- Suspended tenants must not expose public tracking
  IF v_company_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No delivery found for this tracking number'
    );
  END IF;

  SELECT * INTO v_current
  FROM public.delivery_stops
  WHERE id = v_delivery.current_stop_id;

  v_branding := public.get_public_company_branding(v_delivery.company_id);

  SELECT jsonb_build_object(
    'found', true,
    'tracking_number', v_delivery.tracking_number,
    'status', v_delivery.status,
    'origin', jsonb_build_object(
      'name', v_delivery.origin_name,
      'latitude', v_delivery.origin_latitude,
      'longitude', v_delivery.origin_longitude
    ),
    'destination', jsonb_build_object(
      'name', v_delivery.destination_name,
      'latitude', v_delivery.destination_latitude,
      'longitude', v_delivery.destination_longitude
    ),
    'current_location', CASE
      WHEN v_current.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_current.name,
        'latitude', v_current.latitude,
        'longitude', v_current.longitude,
        'stop_order', v_current.stop_order,
        'status', v_current.status
      )
    END,
    'current_stop', CASE
      WHEN v_current.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_current.name,
        'stop_order', v_current.stop_order,
        'status', v_current.status,
        'arrived_at', v_current.arrived_at,
        'latitude', v_current.latitude,
        'longitude', v_current.longitude
      )
    END,
    'completed_stops', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', s.name,
          'stop_order', s.stop_order,
          'arrived_at', s.arrived_at,
          'completed_at', s.completed_at,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'status', s.status
        )
        ORDER BY s.stop_order
      )
      FROM public.delivery_stops s
      WHERE s.delivery_id = v_delivery.id
        AND s.status = 'completed'
    ), '[]'::jsonb),
    'upcoming_stops', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', s.name,
          'stop_order', s.stop_order,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'status', s.status
        )
        ORDER BY s.stop_order
      )
      FROM public.delivery_stops s
      WHERE s.delivery_id = v_delivery.id
        AND s.status = 'upcoming'
    ), '[]'::jsonb),
    'timeline', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'location_name', h.location_name,
          'event_type', h.event_type,
          'created_at', h.created_at
        )
        ORDER BY h.created_at
      )
      FROM public.delivery_location_history h
      WHERE h.delivery_id = v_delivery.id
    ), '[]'::jsonb),
    'estimated_delivery_at', v_delivery.estimated_delivery_at,
    'last_updated', v_delivery.updated_at,
    'branding', v_branding
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Defense in depth: customer must belong to admin's company before insert
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
  v_customer_company UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can create deliveries'
      USING ERRCODE = '42501';
  END IF;

  v_company_id := public.auth_company_id();

  SELECT company_id INTO v_customer_company
  FROM public.profiles
  WHERE id = p_customer_id
    AND role = 'customer';

  IF v_customer_company IS NULL OR v_customer_company <> v_company_id THEN
    RAISE EXCEPTION 'Customer not found'
      USING ERRCODE = '42501';
  END IF;

  IF p_stops IS NULL OR jsonb_typeof(p_stops) <> 'array' THEN
    RAISE EXCEPTION 'p_stops must be a non-empty JSON array';
  END IF;

  v_stop_count := jsonb_array_length(p_stops);
  IF v_stop_count < 2 THEN
    RAISE EXCEPTION 'A delivery requires at least 2 stops (origin and destination)';
  END IF;

  v_origin_name := p_stops->0->>'name';
  v_origin_lat := (p_stops->0->>'latitude')::NUMERIC;
  v_origin_lng := (p_stops->0->>'longitude')::NUMERIC;
  v_dest_name := p_stops->(v_stop_count - 1)->>'name';
  v_dest_lat := (p_stops->(v_stop_count - 1)->>'latitude')::NUMERIC;
  v_dest_lng := (p_stops->(v_stop_count - 1)->>'longitude')::NUMERIC;

  IF v_origin_name IS NULL OR v_dest_name IS NULL THEN
    RAISE EXCEPTION 'Each stop must include name, latitude, and longitude';
  END IF;

  IF v_origin_lat IS NULL OR v_origin_lng IS NULL
     OR v_dest_lat IS NULL OR v_dest_lng IS NULL THEN
    RAISE EXCEPTION 'Each stop must include valid latitude and longitude';
  END IF;

  IF v_origin_lat < -90 OR v_origin_lat > 90
     OR v_dest_lat < -90 OR v_dest_lat > 90 THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;

  IF v_origin_lng < -180 OR v_origin_lng > 180
     OR v_dest_lng < -180 OR v_dest_lng > 180 THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
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

    IF v_lat < -90 OR v_lat > 90 OR v_lng < -180 OR v_lng > 180 THEN
      RAISE EXCEPTION 'Stop coordinates are out of range';
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

COMMENT ON FUNCTION public.generate_tracking_number() IS
  'High-entropy tracking numbers (DLV- + 12 hex). Legacy DLV-YYYY-NNNNNN still valid.';

-- Public tracking RPC is server-only (Next.js /api/track uses service role + rate limit).
-- Prevents browsers from bypassing rate limits / tenant scoping via direct PostgREST.
REVOKE ALL ON FUNCTION public.get_public_tracking(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_tracking(TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_tracking(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.get_public_tracking(TEXT, UUID) IS
  'Public tracking (service_role only). Call via /api/track. Optional p_company_id scopes custom domains; suspended companies return not found.';
