-- Customer portal dashboard templates on company_branding.

alter table public.company_branding
  add column if not exists dashboard_template text,
  add column if not exists dashboard_style text,
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

comment on column public.company_branding.dashboard_template is
  'Preset id e.g. shipper_classic, tracker_only, marketplace_seller, fleet_field, enterprise_ops';
comment on column public.company_branding.dashboard_style is
  'Layout chrome key e.g. classic, tracker, seller, fleet, enterprise';
comment on column public.company_branding.feature_flags is
  'Customer portal feature toggles (create_shipment, tracking, mailbox, …)';
