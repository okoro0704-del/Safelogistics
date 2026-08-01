-- =============================================================================
-- Supabase Realtime publication for live tracking updates
-- =============================================================================

-- Ensure tables are in the supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deliveries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'delivery_stops'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_stops;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'delivery_location_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_location_history;
  END IF;
END;
$$;

-- Replica identity FULL so UPDATE/DELETE payloads include old row data for filters
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_stops REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_location_history REPLICA IDENTITY FULL;
