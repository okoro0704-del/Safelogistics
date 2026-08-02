# Delivery Tracking App

Supabase-backed delivery tracking platform with a Next.js frontend.

- Backend details: **[BACKEND.md](./BACKEND.md)**
- Frontend details: **[FRONTEND.md](./FRONTEND.md)**
- Security model & production checklist: **[SECURITY.md](./SECURITY.md)**
- Manual payment records: **[BILLING.md](./BILLING.md)**
- Production deploy (Supabase + Netlify): **[DEPLOYMENT.md](./DEPLOYMENT.md)**

## Prerequisites

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Supabase)
2. Node.js 20+
3. Supabase CLI (local or global) — the npm `supabase` package may not ship a Windows binary; install the [official CLI](https://supabase.com/docs/guides/cli) if needed

## Setup

```bash
npm install
cp .env.example .env.local
```

Start Supabase (when Docker + CLI are available):

```bash
npx supabase start
npx supabase db reset
npx supabase status
```

Copy the **Project URL** and **anon key** into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-status>
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=<your-mapbox-public-token>
```

Get a Mapbox public access token from [Mapbox Account](https://account.mapbox.com/).  
If the token is missing, tracking pages still work — the map shows a graceful “Map unavailable” fallback.

Do **not** put the service-role key in any `NEXT_PUBLIC_*` variable.

## Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo accounts

Password for all: `DemoPass123!`

| Role | Email | Lands on |
|------|-------|----------|
| Master Admin | `master@routeledger.demo` | `/master-admin` |
| Admin (Swift Logistics) | `admin@swift-logistics.demo` | `/admin` |
| Customer (Swift) | `chidi.customer@example.demo` | `/dashboard` |
| Customer (Swift) | `funke.customer@example.demo` | `/dashboard` |
| Admin (Prime Express) | `admin@prime-express.demo` | `/admin` |
| Customer (Prime) | `ada.customer@prime-express.demo` | `/dashboard` |

Use Swift vs Prime accounts to verify **tenant isolation** (Company A must not see Company B data).

These credentials are for local testing only and are not shown in the UI.

## Multi-tenant architecture

```text
Master Admin (platform)
  ├── Manual payment records
  └── Companies (tenants)
        ├── Admins
        ├── Customers
        └── Deliveries → stops / history
```

- Tenant branding and company settings are Master Admin–managed
- **The platform does not use plans or subscriptions.** The Master Admin manually receives payment from customers and may record those payments in the platform.
- **The platform does not process online payments.**
- Custom domains: add → Connect (DNS/hosting providers) → Check Status → **active**
- Isolation is enforced by **Postgres RLS**, RPCs, middleware, and server APIs (not only the UI)
- Suspended companies cannot use Admin/Customer portals, delivery mutations, or public tracking
- A hostname is a tenant-routing hint, not an authorization mechanism
- Public tracking goes through **`POST /api/track`** (rate-limited; RPC is service-role only)

## Main routes

| Route | Description |
|-------|-------------|
| `/` | Public landing |
| `/track` | Public tracking (`?number=DLV-…`) |
| `/login` | Shared admin/customer login |
| `/master-admin` | Master Admin platform hub |
| `/master-admin/companies` | Tenant list |
| `/master-admin/companies/new` | Create New App (optional payment step) |
| `/master-admin/companies/[id]` | Company overview / branding / settings / domains / payments / admins |
| `/master-admin/companies/[id]/payments` | Record / void offline payments |
| `/master-admin/billing` | Payment records + totals |
| `/admin` | Admin dashboard (live stats) |
| `/admin/deliveries` | Delivery list / create / details / proceed |
| `/admin/customers` | Customer list / create / details |
| `/dashboard` | Customer dashboard |
| `/dashboard/deliveries` | My Deliveries + live tracking |
| `/dashboard/profile` | Profile + password change |

## Custom domains (automatic + manual DNS)

Master Admin → **Company → Domains**:

1. **Add Domain**
2. **Connect Domain** — provisions hosting + DNS when providers are configured
3. **Check Status** — ownership TXT + DNS/hosting readiness → **Active**

TXT ownership record (always required):

```text
Type: TXT
Name: _routeledger
Value: routeledger-verification=<token>
```

Also CNAME (or apex ALIAS) the hostname to `CUSTOM_DOMAIN_TARGET`.

| Env | Purpose |
|-----|---------|
| `DNS_PROVIDER` | `mock` (dev), `cloudflare`, or `none` (manual) |
| `CUSTOM_DOMAIN_TARGET` | App traffic target hostname |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` | Cloudflare DNS Edit |
| `HOSTING_PROVIDER` | `mock`, `vercel`, or `none` |
| `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` | Attach domain to Vercel project |

Local demo without real DNS: `DNS_PROVIDER=mock`, add `swift.localhost`, Connect → Check Status → open `http://swift.localhost:3000`.

Domain purchasing and registrar automation are **not** implemented. SaaS billing uses **manual Master Admin payment records** — see **[BILLING.md](./BILLING.md)**. There is no online payment provider.

## Admin / Master Admin notes

- Customer creation: `POST /api/admin/customers` (service role server-side)
- App provisioning: `POST /api/master-admin/companies` (Master Admin only; company + admin + branding + settings + optional payment)
- Payment RPCs: `master_record_payment`, `master_void_payment`, `master_payment_stats` (see BILLING.md)
- Delivery creation uses RPC `create_delivery_with_stops` (company derived from admin)
- Tracking numbers are generated by the database
- Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` for Auth user provisioning APIs

## Maps (Mapbox)

Interactive route maps use the official **Mapbox GL JS** SDK (v3.9.4, loaded client-side from Mapbox’s CDN via `lib/delivery/mapbox-loader.ts`). Map configuration stays isolated from delivery RPCs so a future white-label layer can swap provider/style later.

| Item | Detail |
|------|--------|
| Env var | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (public token only) |
| Component | `components/delivery/delivery-map.tsx` via `DeliveryMapDynamic` |
| Data | Props from parent (`DeliveryMapModel`) — no DB fetch inside the map |
| Movement | Visualization only; Admin still advances via `proceed_to_next_stop` |

Fallback behavior:

- Missing token → “Map unavailable” (tracking UI continues)
- Init failure → “Unable to load map” (route timeline still shown)
- Missing stop coordinates → skip those points; notice if any were skipped

Public `/track` renders the map only from coordinates already returned by public tracking (no private customer fields). See **[SECURITY.md](./SECURITY.md)** for the full security model, authorization matrix, and production checklist.
