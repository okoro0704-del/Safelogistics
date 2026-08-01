-- =============================================================================
-- Extensions and enums
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Application roles (master_admin reserved for future multi-tenant platform)
CREATE TYPE public.user_role AS ENUM (
  'admin',
  'customer',
  'master_admin'
);

CREATE TYPE public.delivery_status AS ENUM (
  'pending',
  'in_transit',
  'at_stop',
  'delivered',
  'cancelled',
  'delayed'
);

CREATE TYPE public.stop_status AS ENUM (
  'upcoming',
  'current',
  'completed'
);

CREATE TYPE public.location_event_type AS ENUM (
  'created',
  'origin',
  'departed',
  'arrived',
  'at_stop',
  'delivered',
  'cancelled',
  'delayed',
  'status_change'
);

-- Shared updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;
