# Backend Architecture

Delivery tracking platform backend built on **Supabase** (PostgreSQL, Auth, Realtime, RLS).  
No custom Node/Express API is required for normal app operations. The frontend talks to Supabase directly.

This phase establishes the **data foundation only** — no admin/customer UI yet.

---

## Quick start (local)

```bash
npm install
npx supabase start
npx supabase db reset   # applies migrations + seed.sql
npx supabase status     # print URL + anon/service keys
```

Copy keys into `.env` from `.env.example`.

**Demo logins** (password for all: `DemoPass123!`):

| Role | Email |
|------|-------|
| Master Admin | `master@routeledger.demo` |
| Admin (Swift Logistics) | `admin@swift-logistics.demo` |
| Customer (Swift) | `chidi.customer@example.demo` |
| Customer (Swift) | `funke.customer@example.demo` |
| Admin (Prime Express) | `admin@prime-express.demo` |
| Customer (Prime) | `ada.customer@prime-express.demo` |

Companies: **Swift Logistics** (`swift-logistics`), **Prime Express** (`prime-express`)

---

## Multi-tenancy model

```text
Master Admin (company_id NULL)
  └── companies (status: active | suspended)
        ├── profiles (admin | customer)
        └── deliveries → stops / history
```

Tenant isolation is enforced by RLS + helpers (`is_admin`, `same_company`, `owns_delivery`).  
Suspended companies cannot perform admin/customer operations (`is_admin` / customer access require `status = active`).

Master Admin RPCs (authenticated, `SECURITY DEFINER`, role-checked):

- `master_platform_stats`
- `master_provision_company` (full tenant: company + admin + settings + optional branding)
- `master_register_company_with_admin` (legacy wrapper → provision)
- `master_register_company_admin`
- `master_set_company_status`
- `master_upsert_company_settings`
- `master_rollback_company_provision` (compensating cleanup)

Server-only APIs under `/api/master-admin/*` use the session to verify Master Admin, then the service role only for Auth user creation (never exposed to the browser).

Custom domains + DNS/hosting provisioning are supported via `/api/master-admin/.../domains` (see README / SECURITY.md).

Automatic tenant hosts use `{slug}.{NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE}` (e.g. `acme.apps.webfinance.app`) and do not require per-tenant domain rows.

There is **no** payment/billing subsystem. Historical payment RPCs/tables are dropped by migration `20260815230000_remove_payments_add_subdomains.sql`.

### Company branding

Table `company_branding` (1:1 with `companies`) stores:

- `logo_url`, `favicon_url`
- `primary_color`, `secondary_color`, `accent_color` (validated `#rrggbb`)
- `tagline`, `support_email`, `website_url`

Storage bucket: `branding` (public read; Master Admin write). Path: `{company_id}/logo.*`

RPCs: `master_upsert_company_branding`, `master_reset_company_branding`, `get_public_company_branding`.  
`get_public_tracking` includes a safe `branding` object (no PII).

### Company settings

Table `company_settings` (1:1 with `companies`) stores operational config:

- `timezone` (IANA)
- `currency` (ISO 4217)
- `support_email`, `support_phone`, `website_url`

Visual branding stays in `company_branding`. Company name/slug/status stay on `companies`.

### Custom domains

Table `company_domains` maps hostnames to companies.

| Status | Meaning |
|--------|---------|
| `pending` | Added; not provisioned |
| `provisioning` | Automatic DNS/hosting in progress |
| `verifying` | Waiting for DNS propagation / ownership TXT |
| `active` | Verified and eligible for tenant resolution |
| `failed` | Automatic provisioning failed (retry / manual) |
| `disabled` | Stopped; hostname freed for reclaim after fresh verify |

Infrastructure fields (safe metadata only — no API secrets): `dns_provider`, `hosting_provider`, `dns_status`, `hosting_status`, `ssl_status`, provider record IDs, `last_error`.

**DNS vs hosting:** DNS points traffic; the hosting provider (e.g. Vercel Domains API) must also accept the hostname. SSL is managed by the host — the app only tracks readiness.

Provider abstraction:

- `DNS_PROVIDER=mock|cloudflare|none`
- `HOSTING_PROVIDER=mock|vercel|netlify|none`
- `CUSTOM_DOMAIN_TARGET` — CNAME/ALIAS target for app traffic
- `NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE` — apex for automatic `{slug}.…` tenant hosts

Verification TXT remains required for **purchased/custom** domains:
`_parcelmovement.<domain>` = `parcelmovement-verification=<token>`
(legacy `_routeledger` / `routeledger-verification=` still accepted).

RPCs: `resolve_tenant_by_hostname`, `master_set_domain_lifecycle`, `master_mark_domain_verified`, …

APIs: `…/domains/[domainId]/provision`, `…/status`, existing verify/PATCH.

Managed platform subdomains under `NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE` bypass per-tenant Netlify/DNS registration. Optional Namecheap purchase remains available for custom domains (registrar price audited on `domain_orders`; no payment records).

### App provisioning

`POST /api/master-admin/companies` (JSON or multipart) creates:

1. Auth admin user (service role)
2. Company + admin profile + settings + optional branding (`master_provision_company`)
3. Optional logo/favicon upload
4. Compensating rollback on failure (Auth user + DB tenant + storage)

Slug uniqueness is enforced by the database. Duplicate admin emails fail cleanly without orphan companies.

---

## Tables

### `companies`
Tenant root. Company name/slug/status/description live here; visual branding lives in `company_branding`; operational config lives in `company_settings`.

### `company_settings`
1:1 with `companies`. Timezone, currency, and support contacts for the tenant.

### `profiles`
1:1 with `auth.users` (`id` = Auth UUID).

| Column       | Notes                                      |
|--------------|--------------------------------------------|
| `role`       | enum: `admin`, `customer`, `master_admin`  |
| `company_id` | required for admin/customer; null for future master_admin |

Triggers block clients from changing `role` or `company_id`.

### `deliveries`
Belongs to one company + one customer.  
`tracking_number` is **always generated server-side** (`DLV-YYYY-NNNNNN`) and cannot be changed.  
`current_stop_id` points at the active stop.

Statuses (enum): `pending`, `in_transit`, `at_stop`, `delivered`, `cancelled`, `delayed`.

### `delivery_stops`
Ordered route points (`stop_order`).  
Statuses (enum): `upcoming`, `current`, `completed`.  
Partial unique index: **only one `current` stop per delivery**.

### `delivery_location_history`
Append-only timeline of movement/status events.  
Event types: `created`, `origin`, `departed`, `arrived`, `at_stop`, `delivered`, `cancelled`, `delayed`, `status_change`.

### `tracking_number_sequences`
Internal per-year counter. Not client-accessible (RLS deny-all).

---

## Roles & permissions

### Admin
- Scoped to **their** `company_id` only
- Create customers (via Edge Function)
- Create/update deliveries & stops
- Call `proceed_to_next_stop`
- Update delivery status
- Read company customers, deliveries, history

### Customer
- Read own profile, deliveries, stops, history
- **Cannot** create/modify deliveries, stops, users, or roles
- No self-registration (`enable_signup = false`)

### Public (anon)
- Only `get_public_tracking(tracking_number)` — limited safe payload, no customer PII

### Master Admin (future)
- Enum + helper `is_master_admin()` ready; no dashboard yet

---

## Authentication

- Supabase Auth (email/password)
- Self-signup is **disabled** in `supabase/config.toml`
- Customers are created by admins only

### Create customer flow

```text
Admin (JWT)
  → Edge Function: create-customer
      1. Verify caller is admin (RPC is_admin)
      2. auth.admin.createUser (service role — server only)
      3. RPC admin_register_customer_profile (caller JWT → company_id)
  → Return credentials for admin to share securely
```

Service role key must **never** ship to the browser. Only the Edge Function uses it.

---

## RLS summary

| Table                         | Admin                         | Customer            | Anon |
|-------------------------------|-------------------------------|---------------------|------|
| `companies`                   | SELECT/UPDATE own            | SELECT own company  | —    |
| `profiles`                    | SELECT company; UPDATE customers | SELECT/UPDATE self | — |
| `deliveries`                  | full CRUD own company         | SELECT own          | —    |
| `delivery_stops`              | full CRUD via delivery        | SELECT own delivery | —    |
| `delivery_location_history`   | SELECT + INSERT               | SELECT own          | —    |
| `tracking_number_sequences`   | denied                        | denied              | denied |

`company_id` on new deliveries is forced from `auth_company_id()` (trigger) — clients cannot spoof tenancy.

---

## Core RPCs

### `create_delivery_with_stops(...)`
Creates delivery + ordered stops atomically. First stop becomes `current`, status `at_stop`, history event `created`.

```ts
const { data, error } = await supabase.rpc('create_delivery_with_stops', {
  p_customer_id: customerId,
  p_stops: [
    { name: 'Lagos', latitude: 6.5244, longitude: 3.3792 },
    { name: 'Benin City', latitude: 6.335, longitude: 5.6037 },
    { name: 'Onitsha', latitude: 6.1498, longitude: 6.7855 },
    { name: 'Enugu', latitude: 6.4584, longitude: 7.5464 },
  ],
  p_description: 'Electronics',
  p_weight: 12.5,
});
```

### `proceed_to_next_stop(p_delivery_id)`
**Central business action** — single transaction:

1. Verify admin + company ownership  
2. Lock delivery / current stop  
3. Reject if `delivered` or `cancelled`  
4. Mark current stop `completed` + history `departed`  
5. If a next stop exists → mark it `current`, set `current_stop_id`, history `arrived`, status `at_stop`  
6. If **no** next stop (already at final destination) → `status = delivered`  
7. **Stops after exactly one hop** — never auto-advances further  

Example: Lagos → Benin → Onitsha → Enugu requires three Proceed clicks to reach Enugu, then one more Proceed (or “Mark delivered”) while on Enugu to finish.

```ts
const { data, error } = await supabase.rpc('proceed_to_next_stop', {
  p_delivery_id: deliveryId,
});
```

### `update_delivery_status(p_delivery_id, p_status, p_notes?)`
Admin status changes (`delayed`, `cancelled`, `in_transit`, …) with history row.

### `replace_delivery_stops(p_delivery_id, p_stops)`
Replace/reorder stops while preserving progress where possible.

### `get_public_tracking(p_tracking_number)`
Anon-safe tracking payload:

```ts
const { data } = await supabase.rpc('get_public_tracking', {
  p_tracking_number: 'DLV-2026-000001',
});
```

Returns: `tracking_number`, `status`, origin/destination names+coords, current/upcoming/completed stops (including stop coordinates for public map rendering), timeline, `last_updated`.  
Does **not** return customer email, phone, auth IDs, or internal notes beyond safe event labels.

### `admin_register_customer_profile(...)`
Used by the Edge Function after Auth user creation.

---

## Realtime

Publication `supabase_realtime` includes:

- `deliveries`
- `delivery_stops`
- `delivery_location_history`

`REPLICA IDENTITY FULL` is set for filtered UPDATE payloads.

Frontend (later):

```ts
supabase
  .channel(`delivery:${id}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `id=eq.${id}` }, handler)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_stops', filter: `delivery_id=eq.${id}` }, handler)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_location_history', filter: `delivery_id=eq.${id}` }, handler)
  .subscribe();
```

Realtime still respects RLS — customers only receive rows they’re allowed to read.

---

## Frontend integration guide

1. Create a browser Supabase client with **anon key** only.  
2. Sign in via `supabase.auth.signInWithPassword`.  
3. Load `profiles` for `auth.uid()` to learn `role` / `company_id`.  
4. Admins: query company-scoped tables; call RPCs above for writes that need transactions.  
5. Customers: query own deliveries; subscribe to realtime.  
6. Public track page: call `POST /api/track` (never call `get_public_tracking` with the anon key — it is service_role only).  
7. Create customers: `POST /api/admin/customers` (session admin + service role for Auth).

Never put the service role key in frontend env (`NEXT_PUBLIC_*` / `VITE_*`).

Full security model: **[SECURITY.md](./SECURITY.md)**.

---

## Migrations

| File | Purpose |
|------|---------|
| `20260731000001_extensions_and_enums.sql` | Extensions, enums, `set_updated_at` |
| `20260731000002_companies_and_profiles.sql` | Companies, profiles, security triggers |
| `20260731000003_deliveries_schema.sql` | Deliveries, stops, history, tracking numbers |
| `20260731000004_helper_functions.sql` | Auth helpers, company enforcement |
| `20260731000005_rls_policies.sql` | RLS policies |
| `20260731000006_delivery_functions.sql` | Create / proceed / status / replace stops |
| `20260731000007_public_tracking.sql` | Public tracking RPC |
| `20260731000008_realtime.sql` | Realtime publication |
| `20260731000009_admin_customer_profile.sql` | Admin profile registration RPC |

| `20260801220000_production_hardening.sql` | High-entropy tracking #s; tracking/RPC hardening; service_role-only public track |
| `20260802010000_rollback_prompt14_billing.sql` | Removes rolled-back external-style Prompt 14 billing if present |
| `20260802120000_manual_payments_subscriptions.sql` | Prompt 14 plans/subscriptions/payments (superseded) |
| `20260803120000_remove_plans_keep_payments.sql` | Removes plans/subscriptions; keeps simple payments |
| `20260815230000_remove_payments_add_subdomains.sql` | Drops payments; payment-free provision; domain_orders unlink |

Edge Function: `supabase/functions/create-customer` (legacy; prefer Next.js `/api/admin/customers`)

---

## Seed snapshot

- 1 company: Swift Logistics  
- 1 admin, 2 customers  
- 4 deliveries, including **Lagos → Benin City → Onitsha → Enugu** currently at **Benin City** (ideal for testing Proceed)

---

## Security checklist

See **[SECURITY.md](./SECURITY.md)** for the production checklist. Core guarantees:

- [x] RLS enabled on all app tables  
- [x] Role / company_id not client-writable  
- [x] Delivery `company_id` forced from JWT profile  
- [x] Tracking numbers generated server-side (high entropy)  
- [x] Proceed is transactional RPC with `FOR UPDATE`  
- [x] Public tracking via rate-limited API; RPC not anon-callable  
- [x] Service role only on the server  
- [x] Customer signup disabled  
- [x] Cross-company access blocked by RLS helpers  

---

## Intentionally not built

Billing, domain purchasing, registrar automation, notifications, driver/GPS auto-movement.
