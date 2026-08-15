# Parcel Movement

Multi-tenant white-label delivery tracking platform (Next.js + Supabase + Netlify).

- Backend details: **[BACKEND.md](./BACKEND.md)**
- Frontend details: **[FRONTEND.md](./FRONTEND.md)**
- Security model & production checklist: **[SECURITY.md](./SECURITY.md)**
- Production deploy (Supabase + Netlify + wildcard tenant hosts): **[DEPLOYMENT.md](./DEPLOYMENT.md)**

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
Master Admin (platform — pm.webfinance.app)
  └── Companies (tenants)
        ├── Managed host: {slug}.apps.webfinance.app
        ├── Optional custom domains
        ├── Admins
        ├── Customers
        └── Deliveries → stops / history
```

- Tenant branding and company settings are Master Admin–managed
- **No plans, subscriptions, or in-app payment features**
- Automatic tenant hosts: `{slug}.apps.webfinance.app` (wildcard DNS + Netlify cert)
- Path preview `/t/{slug}` remains a local/testing fallback on the platform host
- Custom domains: add → Connect (DNS/hosting providers) → Check Status → **active**
- Isolation is enforced by **Postgres RLS**, RPCs, middleware, and server APIs (not only the UI)
- Suspended companies cannot use Admin/Customer portals, delivery mutations, or public tracking
- A hostname is a tenant-routing hint, not an authorization mechanism
- Public tracking goes through **`POST /api/track`** (rate-limited; RPC is service-role only)

## Main routes

| Route | Description |
|-------|-------------|
| `/` | Public landing / Application Hub on platform host |
| `/track` | Public tracking (`?number=DLV-…`) |
| `/login` | Shared admin/customer login |
| `/master-admin` | Master Admin platform hub |
| `/master-admin/companies` | Tenant list |
| `/master-admin/companies/new` | Create New App |
| `/master-admin/companies/[id]` | Company overview / branding / settings / domains / admins |
| `/admin` | Admin dashboard (live stats) |
| `/admin/deliveries` | Delivery list / create / details / proceed |
| `/admin/customers` | Customer list / create / details |
| `/dashboard` | Customer dashboard |
| `/dashboard/deliveries` | My Deliveries + live tracking |
| `/dashboard/profile` | Profile + password change |

## Tenant hosts

Production:

| Role | Host |
|------|------|
| Platform / Master Admin | `https://pm.webfinance.app` |
| Tenant app | `https://{slug}.apps.webfinance.app` |

Env:

```env
NEXT_PUBLIC_PLATFORM_HOSTS=pm.webfinance.app
NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE=apps.webfinance.app
NEXT_PUBLIC_SITE_URL=https://pm.webfinance.app
```

DNS / Netlify: see **[DEPLOYMENT.md](./DEPLOYMENT.md)** (wildcard `*.apps.webfinance.app`).

## Custom domains (optional)

Master Admin → **Company → Domains**:

1. **Add Domain**
2. **Connect Domain** — provisions hosting + DNS when providers are configured
3. **Check Status** — ownership TXT + DNS/hosting readiness → **Active**

TXT ownership record (always required):

```text
Type: TXT
Name: _parcelmovement
Value: parcelmovement-verification=<token>
```

Legacy `_routeledger` / `routeledger-verification=` records are still accepted during migration.

Also CNAME (or apex ALIAS) the hostname to `CUSTOM_DOMAIN_TARGET`.

Managed `*.apps.webfinance.app` hosts bypass per-tenant Netlify/DNS registration — the wildcard covers them.

| Env | Purpose |
|-----|---------|
| `DNS_PROVIDER` | `mock` (dev), `cloudflare`, or `none` (manual) |
| `CUSTOM_DOMAIN_TARGET` | App traffic target hostname |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` | Cloudflare DNS Edit |
| `HOSTING_PROVIDER` | `mock`, `vercel`, `netlify`, or `none` |
| `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` | Attach domain to Vercel project |
| `NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID` | Attach custom domains to Netlify |

Optional Namecheap purchase is Master Admin–assisted (registrar price kept for audit; no payment records).

## Admin / Master Admin notes

- Customer creation: `POST /api/admin/customers` (service role server-side)
- App provisioning: `POST /api/master-admin/companies` (Master Admin only; company + admin + branding + settings)
- Delivery creation uses RPC `create_delivery_with_stops` (company derived from admin)
- Tracking numbers are generated by the database
- Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` for Auth user provisioning APIs

## Maps (Mapbox)

Route visualization uses **Mapbox GL JS**. Set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`. Without a token, tracking still works with a map fallback.
