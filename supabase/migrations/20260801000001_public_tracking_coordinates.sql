-- Add coordinates to public tracking stops (route points only — no customer PII).
-- Safe for anonymous get_public_tracking consumers / public map rendering.

CREATE OR REPLACE FUNCTION public.get_public_tracking(p_tracking_number TEXT)
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

  SELECT * INTO v_current
  FROM public.delivery_stops
  WHERE id = v_delivery.current_stop_id;

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
    'last_updated', v_delivery.updated_at
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_tracking(TEXT) IS
  'Public tracking lookup. Returns limited safe fields only — never customer PII. '
  'Includes stop coordinates for public route visualization.';
