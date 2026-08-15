-- =============================================================================
-- Development seed data (fake credentials only)
-- Password for all demo users: DemoPass123!
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_company_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_admin_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_customer1_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_customer2_id UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  v_delivery1 UUID := '11111111-1111-1111-1111-111111111111';
  v_delivery2 UUID := '22222222-2222-2222-2222-222222222222';
  v_delivery3 UUID := '33333333-3333-3333-3333-333333333333';
  v_delivery4 UUID := '44444444-4444-4444-4444-444444444444';

  v_d1_s1 UUID;
  v_d1_s2 UUID;
  v_d1_s3 UUID;
  v_d1_s4 UUID;
  v_d2_s1 UUID;
  v_d2_s2 UUID;
  v_d3_s1 UUID;
  v_d3_s2 UUID;
  v_d3_s3 UUID;
  v_d4_s1 UUID;
  v_d4_s2 UUID;

  -- bcrypt hash for: DemoPass123!
  v_password TEXT := crypt('DemoPass123!', gen_salt('bf'));
BEGIN
  -- -------------------------------------------------------------------------
  -- Company
  -- -------------------------------------------------------------------------
  INSERT INTO public.companies (
    id, name, slug, email, phone, logo_url, primary_color
  ) VALUES (
    v_company_id,
    'Swift Logistics',
    'swift-logistics',
    'ops@swift-logistics.demo',
    '+234-800-000-0001',
    NULL,
    '#0B6E4F'
  )
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- Auth users (local/dev only)
  -- -------------------------------------------------------------------------
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES
    (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@swift-logistics.demo',
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Amina Okoro"}'::jsonb,
      timezone('utc', now()),
      timezone('utc', now()),
      '',
      '',
      '',
      ''
    ),
    (
      v_customer1_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'chidi.customer@example.demo',
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Chidi Eze"}'::jsonb,
      timezone('utc', now()),
      timezone('utc', now()),
      '',
      '',
      '',
      ''
    ),
    (
      v_customer2_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'funke.customer@example.demo',
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Funke Adeyemi"}'::jsonb,
      timezone('utc', now()),
      timezone('utc', now()),
      '',
      '',
      '',
      ''
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    id,
    id,
    format(
      '{"sub":"%s","email":"%s","email_verified":true,"phone_verified":false}',
      id::text,
      email
    )::jsonb,
    'email',
    id::text,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  FROM auth.users
  WHERE id IN (v_admin_id, v_customer1_id, v_customer2_id)
  ON CONFLICT DO NOTHING;

  -- -------------------------------------------------------------------------
  -- Profiles
  -- -------------------------------------------------------------------------
  INSERT INTO public.profiles (id, company_id, full_name, email, phone, role)
  VALUES
    (
      v_admin_id,
      v_company_id,
      'Amina Okoro',
      'admin@swift-logistics.demo',
      '+234-800-111-0001',
      'admin'
    ),
    (
      v_customer1_id,
      v_company_id,
      'Chidi Eze',
      'chidi.customer@example.demo',
      '+234-800-222-0001',
      'customer'
    ),
    (
      v_customer2_id,
      v_company_id,
      'Funke Adeyemi',
      'funke.customer@example.demo',
      '+234-800-222-0002',
      'customer'
    )
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- Delivery 1: Lagos → Benin City → Onitsha → Enugu (in progress at Benin)
  -- -------------------------------------------------------------------------
  INSERT INTO public.deliveries (
    id, company_id, customer_id,
    origin_name, origin_latitude, origin_longitude,
    destination_name, destination_latitude, destination_longitude,
    status, description, weight, reference_number, estimated_delivery_at
  ) VALUES (
    v_delivery1,
    v_company_id,
    v_customer1_id,
    'Lagos', 6.5244000, 3.3792000,
    'Enugu', 6.4584000, 7.5464000,
    'at_stop',
    'Electronics parcel — multi-stop demo route',
    12.500,
    'REF-SWIFT-1001',
    timezone('utc', now()) + interval '2 days'
  );

  INSERT INTO public.delivery_stops (id, delivery_id, name, latitude, longitude, stop_order, status, arrived_at, completed_at)
  VALUES
    (gen_random_uuid(), v_delivery1, 'Lagos', 6.5244000, 3.3792000, 1, 'completed',
      timezone('utc', now()) - interval '8 hours', timezone('utc', now()) - interval '6 hours')
  RETURNING id INTO v_d1_s1;

  INSERT INTO public.delivery_stops (id, delivery_id, name, latitude, longitude, stop_order, status, arrived_at)
  VALUES
    (gen_random_uuid(), v_delivery1, 'Benin City', 6.3350000, 5.6037000, 2, 'current',
      timezone('utc', now()) - interval '2 hours')
  RETURNING id INTO v_d1_s2;

  INSERT INTO public.delivery_stops (id, delivery_id, name, latitude, longitude, stop_order, status)
  VALUES
    (gen_random_uuid(), v_delivery1, 'Onitsha', 6.1498000, 6.7855000, 3, 'upcoming')
  RETURNING id INTO v_d1_s3;

  INSERT INTO public.delivery_stops (id, delivery_id, name, latitude, longitude, stop_order, status)
  VALUES
    (gen_random_uuid(), v_delivery1, 'Enugu', 6.4584000, 7.5464000, 4, 'upcoming')
  RETURNING id INTO v_d1_s4;

  UPDATE public.deliveries SET current_stop_id = v_d1_s2 WHERE id = v_delivery1;

  INSERT INTO public.delivery_location_history
    (delivery_id, stop_id, location_name, latitude, longitude, event_type, notes, created_at)
  VALUES
    (v_delivery1, v_d1_s1, 'Lagos', 6.5244000, 3.3792000, 'created', 'Delivery created',
      timezone('utc', now()) - interval '8 hours'),
    (v_delivery1, v_d1_s1, 'Lagos', 6.5244000, 3.3792000, 'departed', 'Departed Lagos',
      timezone('utc', now()) - interval '6 hours'),
    (v_delivery1, v_d1_s2, 'Benin City', 6.3350000, 5.6037000, 'arrived', 'Arrived at Benin City',
      timezone('utc', now()) - interval '2 hours');

  -- -------------------------------------------------------------------------
  -- Delivery 2: Abuja → Kaduna (pending at origin)
  -- -------------------------------------------------------------------------
  INSERT INTO public.deliveries (
    id, company_id, customer_id,
    origin_name, origin_latitude, origin_longitude,
    destination_name, destination_latitude, destination_longitude,
    status, description, weight, reference_number
  ) VALUES (
    v_delivery2,
    v_company_id,
    v_customer1_id,
    'Abuja', 9.0765000, 7.3986000,
    'Kaduna', 10.5105000, 7.4165000,
    'at_stop',
    'Documents envelope',
    0.800,
    'REF-SWIFT-1002'
  );

  INSERT INTO public.delivery_stops (delivery_id, name, latitude, longitude, stop_order, status, arrived_at)
  VALUES (v_delivery2, 'Abuja', 9.0765000, 7.3986000, 1, 'current', timezone('utc', now()))
  RETURNING id INTO v_d2_s1;

  INSERT INTO public.delivery_stops (delivery_id, name, latitude, longitude, stop_order, status)
  VALUES (v_delivery2, 'Kaduna', 10.5105000, 7.4165000, 2, 'upcoming')
  RETURNING id INTO v_d2_s2;

  UPDATE public.deliveries SET current_stop_id = v_d2_s1 WHERE id = v_delivery2;

  INSERT INTO public.delivery_location_history
    (delivery_id, stop_id, location_name, latitude, longitude, event_type, notes)
  VALUES
    (v_delivery2, v_d2_s1, 'Abuja', 9.0765000, 7.3986000, 'created', 'Delivery created; waiting at origin');

  -- -------------------------------------------------------------------------
  -- Delivery 3: Port Harcourt → Owerri → Aba (customer 2, pending)
  -- -------------------------------------------------------------------------
  INSERT INTO public.deliveries (
    id, company_id, customer_id,
    origin_name, origin_latitude, origin_longitude,
    destination_name, destination_latitude, destination_longitude,
    status, description, weight, reference_number
  ) VALUES (
    v_delivery3,
    v_company_id,
    v_customer2_id,
    'Port Harcourt', 4.8156000, 7.0498000,
    'Aba', 5.1066000, 7.3667000,
    'at_stop',
    'Fashion samples',
    3.200,
    'REF-SWIFT-1003'
  );

  INSERT INTO public.delivery_stops (delivery_id, name, latitude, longitude, stop_order, status, arrived_at)
  VALUES (v_delivery3, 'Port Harcourt', 4.8156000, 7.0498000, 1, 'current', timezone('utc', now()))
  RETURNING id INTO v_d3_s1;

  INSERT INTO public.delivery_stops (delivery_id, name, latitude, longitude, stop_order, status)
  VALUES (v_delivery3, 'Owerri', 5.4840000, 7.0351000, 2, 'upcoming')
  RETURNING id INTO v_d3_s2;

  INSERT INTO public.delivery_stops (delivery_id, name, latitude, longitude, stop_order, status)
  VALUES (v_delivery3, 'Aba', 5.1066000, 7.3667000, 3, 'upcoming')
  RETURNING id INTO v_d3_s3;

  UPDATE public.deliveries SET current_stop_id = v_d3_s1 WHERE id = v_delivery3;

  INSERT INTO public.delivery_location_history
    (delivery_id, stop_id, location_name, latitude, longitude, event_type, notes)
  VALUES
    (v_delivery3, v_d3_s1, 'Port Harcourt', 4.8156000, 7.0498000, 'created', 'Delivery created');

  -- -------------------------------------------------------------------------
  -- Delivery 4: Ibadan → Ilorin (delivered)
  -- -------------------------------------------------------------------------
  INSERT INTO public.deliveries (
    id, company_id, customer_id,
    origin_name, origin_latitude, origin_longitude,
    destination_name, destination_latitude, destination_longitude,
    status, description, weight, reference_number
  ) VALUES (
    v_delivery4,
    v_company_id,
    v_customer2_id,
    'Ibadan', 7.3775000, 3.9470000,
    'Ilorin', 8.4966000, 4.5421000,
    'delivered',
    'Household goods — completed demo',
    25.000,
    'REF-SWIFT-1004'
  );

  INSERT INTO public.delivery_stops (delivery_id, name, latitude, longitude, stop_order, status, arrived_at, completed_at)
  VALUES (
    v_delivery4, 'Ibadan', 7.3775000, 3.9470000, 1, 'completed',
    timezone('utc', now()) - interval '2 days',
    timezone('utc', now()) - interval '1 day 12 hours'
  )
  RETURNING id INTO v_d4_s1;

  INSERT INTO public.delivery_stops (delivery_id, name, latitude, longitude, stop_order, status, arrived_at, completed_at)
  VALUES (
    v_delivery4, 'Ilorin', 8.4966000, 4.5421000, 2, 'completed',
    timezone('utc', now()) - interval '1 day',
    timezone('utc', now()) - interval '1 day'
  )
  RETURNING id INTO v_d4_s2;

  UPDATE public.deliveries SET current_stop_id = v_d4_s2 WHERE id = v_delivery4;

  INSERT INTO public.delivery_location_history
    (delivery_id, stop_id, location_name, latitude, longitude, event_type, notes, created_at)
  VALUES
    (v_delivery4, v_d4_s1, 'Ibadan', 7.3775000, 3.9470000, 'created', 'Delivery created',
      timezone('utc', now()) - interval '2 days'),
    (v_delivery4, v_d4_s1, 'Ibadan', 7.3775000, 3.9470000, 'departed', 'Departed Ibadan',
      timezone('utc', now()) - interval '1 day 12 hours'),
    (v_delivery4, v_d4_s2, 'Ilorin', 8.4966000, 4.5421000, 'arrived', 'Arrived at Ilorin',
      timezone('utc', now()) - interval '1 day'),
    (v_delivery4, v_d4_s2, 'Ilorin', 8.4966000, 4.5421000, 'delivered', 'Delivery completed',
      timezone('utc', now()) - interval '1 day');
END;
$$;

-- =============================================================================
-- Second DO block: Master Admin + Prime Express (tenant isolation demos)
-- Password: DemoPass123!
-- =============================================================================
DO $$
DECLARE
  v_master_id UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_company_b UUID := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_admin_b UUID := '99999999-9999-9999-9999-999999999999';
  v_customer_b UUID := '88888888-8888-8888-8888-888888888888';
  v_delivery_b UUID := '77777777-7777-7777-7777-777777777777';
  v_b_s1 UUID;
  v_b_s2 UUID;
  v_password TEXT := crypt('DemoPass123!', gen_salt('bf'));
BEGIN
  INSERT INTO public.companies (
    id, name, slug, email, phone, primary_color, status
  ) VALUES (
    v_company_b,
    'Prime Express',
    'prime-express',
    'ops@prime-express.demo',
    '+234-800-000-0002',
    '#1D4ED8',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Backfill status for Swift if column exists from migration
  UPDATE public.companies
  SET status = COALESCE(status, 'active')
  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES
    (
      v_master_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'master@routeledger.demo',
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Platform Master"}'::jsonb,
      timezone('utc', now()), timezone('utc', now()),
      '', '', '', ''
    ),
    (
      v_admin_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'admin@prime-express.demo',
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Bola Mensah"}'::jsonb,
      timezone('utc', now()), timezone('utc', now()),
      '', '', '', ''
    ),
    (
      v_customer_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'ada.customer@prime-express.demo',
      v_password,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Ada Nwosu"}'::jsonb,
      timezone('utc', now()), timezone('utc', now()),
      '', '', '', ''
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    id, id,
    format(
      '{"sub":"%s","email":"%s","email_verified":true,"phone_verified":false}',
      id::text, email
    )::jsonb,
    'email', id::text,
    timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
  FROM auth.users
  WHERE id IN (v_master_id, v_admin_b, v_customer_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, company_id, full_name, email, phone, role)
  VALUES
    (
      v_master_id, NULL, 'Platform Master',
      'master@routeledger.demo', NULL, 'master_admin'
    ),
    (
      v_admin_b, v_company_b, 'Bola Mensah',
      'admin@prime-express.demo', '+234-800-333-0001', 'admin'
    ),
    (
      v_customer_b, v_company_b, 'Ada Nwosu',
      'ada.customer@prime-express.demo', '+234-800-333-0002', 'customer'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.deliveries (
    id, company_id, customer_id,
    origin_name, origin_latitude, origin_longitude,
    destination_name, destination_latitude, destination_longitude,
    status, description, weight, reference_number
  ) VALUES (
    v_delivery_b,
    v_company_b,
    v_customer_b,
    'Abuja', 9.0765000, 7.3986000,
    'Kaduna', 10.5105000, 7.4165000,
    'in_transit',
    'Prime Express isolation demo parcel',
    8.000,
    'REF-PRIME-2001'
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_stops WHERE delivery_id = v_delivery_b
  ) THEN
    INSERT INTO public.delivery_stops
      (delivery_id, name, latitude, longitude, stop_order, status, arrived_at)
    VALUES
      (v_delivery_b, 'Abuja', 9.0765000, 7.3986000, 1, 'completed',
        timezone('utc', now()) - interval '4 hours')
    RETURNING id INTO v_b_s1;

    INSERT INTO public.delivery_stops
      (delivery_id, name, latitude, longitude, stop_order, status, arrived_at)
    VALUES
      (v_delivery_b, 'Kaduna', 10.5105000, 7.4165000, 2, 'current',
        timezone('utc', now()) - interval '1 hour')
    RETURNING id INTO v_b_s2;

    UPDATE public.deliveries
    SET current_stop_id = v_b_s2
    WHERE id = v_delivery_b;

    INSERT INTO public.delivery_location_history
      (delivery_id, stop_id, location_name, latitude, longitude, event_type, notes)
    VALUES
      (v_delivery_b, v_b_s1, 'Abuja', 9.0765000, 7.3986000, 'created', 'Delivery created'),
      (v_delivery_b, v_b_s2, 'Kaduna', 10.5105000, 7.4165000, 'arrived', 'Arrived Kaduna');
  END IF;

  INSERT INTO public.company_branding (
    company_id, primary_color, secondary_color, accent_color,
    tagline, support_email, website_url
  ) VALUES
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '#0b6e4f',
      '#d1fae5',
      '#064e3b',
      'Moving what matters across Nigeria.',
      'support@swift-logistics.demo',
      'https://swift-logistics.demo'
    ),
    (
      v_company_b,
      '#1d4ed8',
      '#dbeafe',
      '#1e3a8a',
      'Prime speed. Express care.',
      'hello@prime-express.demo',
      'https://prime-express.demo'
    )
  ON CONFLICT (company_id) DO UPDATE SET
    primary_color = EXCLUDED.primary_color,
    secondary_color = EXCLUDED.secondary_color,
    accent_color = EXCLUDED.accent_color,
    tagline = EXCLUDED.tagline,
    support_email = EXCLUDED.support_email,
    website_url = EXCLUDED.website_url;

  INSERT INTO public.company_settings (
    company_id, timezone, currency, support_email, support_phone, website_url
  ) VALUES
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'Africa/Lagos',
      'NGN',
      'support@swift-logistics.demo',
      '+234 800 111 2222',
      'https://swift-logistics.demo'
    ),
    (
      v_company_b,
      'Africa/Lagos',
      'NGN',
      'hello@prime-express.demo',
      '+234 800 333 4444',
      'https://prime-express.demo'
    )
  ON CONFLICT (company_id) DO UPDATE SET
    timezone = EXCLUDED.timezone,
    currency = EXCLUDED.currency,
    support_email = EXCLUDED.support_email,
    support_phone = EXCLUDED.support_phone,
    website_url = EXCLUDED.website_url;

  UPDATE public.companies
  SET
    primary_color = '#0b6e4f',
    description = 'Nationwide logistics for Swift demo tenants.'
  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  UPDATE public.companies
  SET
    primary_color = '#1d4ed8',
    description = 'Express parcel network for Prime demo tenants.'
  WHERE id = v_company_b;
END;
$$;

-- Payments removed — no demo payment records.

