-- Mirror of live PM timed-movement feature (also applied via scripts/pm-schedule-movement.sql on CP).

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS movement_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS movement_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS movement_from_stop_id UUID REFERENCES public.delivery_stops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movement_to_stop_id UUID REFERENCES public.delivery_stops(id) ON DELETE SET NULL;

ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_movement_duration_minutes_check;

ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_movement_duration_minutes_check
  CHECK (
    movement_duration_minutes IS NULL
    OR movement_duration_minutes BETWEEN 1 AND 10080
  );
