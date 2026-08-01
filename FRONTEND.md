# Frontend Architecture

Next.js (App Router) + TypeScript + Tailwind CSS, talking directly to the existing Supabase backend.

## Stack

- **Next.js 15** App Router
- **Supabase JS** via `@supabase/ssr` (cookie sessions)
- **Tailwind CSS v4** design tokens in `app/globals.css`
- Lightweight **shadcn-style** primitives in `components/ui`

## Route map

| Path | Access | Purpose |
|------|--------|---------|
| `/` | Public | Landing + track CTA |
| `/track` | Public | Tracking form + `POST /api/track` |
| `/login` | Public | Email/password sign-in |
| `/forgot-password` | Public | Password reset request |
| `/update-password` | Auth | Complete password reset |
| `/admin` | `admin` | Dashboard stats + recent deliveries |
| `/admin/deliveries` | `admin` | Delivery list, search, filters |
| `/admin/deliveries/new` | `admin` | Create delivery via RPC |
| `/admin/deliveries/[id]` | `admin` | Delivery details + route timeline |
| `/admin/customers` | `admin` | Customer list |
| `/admin/customers/new` | `admin` | Create customer (server API) |
| `/admin/customers/[id]` | `admin` | Customer detail + deliveries |
| `/admin/settings` | `admin` | Placeholder settings |
| `/dashboard` | `customer` | Customer stats + active deliveries |
| `/dashboard/deliveries` | `customer` | My Deliveries list |
| `/dashboard/deliveries/[id]` | `customer` | Read-only live tracking + Realtime |
| `/dashboard/profile` | `customer` | Profile + password change |
| `/coming-soon` | `master_admin` | Redirects to `/master-admin` |
| `/master-admin` | `master_admin` | Platform control center (app metrics) |
| `/master-admin/companies` | `master_admin` | Apps list |
| `/master-admin/companies/new` | `master_admin` | Create New App wizard |
| `/master-admin/companies/[id]` | `master_admin` | Company overview |
| `/master-admin/companies/[id]/branding` | `master_admin` | Branding editor |
| `/master-admin/companies/[id]/settings` | `master_admin` | App settings editor |
| `/master-admin/companies/[id]/domains` | `master_admin` | Custom domains + DNS verify |
| `/master-admin/companies/[id]/payments` | `master_admin` | Offline payment history |
| `/master-admin/billing` | `master_admin` | Payment records + totals |
| `/suspended` | Auth | Shown when a company is suspended |

## Auth flow

1. User submits `/login` → server action `signInAction`
2. Supabase Auth validates credentials
3. Profile row loaded from `profiles` (role + company_id)
4. Redirect by role: admin → `/admin`, customer → `/dashboard`, master_admin → `/coming-soon`
5. `middleware.ts` refreshes the session and enforces route protection on every request

There is **no** public signup page.

## Admin data operations

| Action | Mechanism |
|--------|-----------|
| Create customer | `POST /api/admin/customers` (server-only service role + `admin_register_customer_profile`) |
| Create delivery | RPC `create_delivery_with_stops` |
| Proceed to next stop | RPC `proceed_to_next_stop` |
| List/filter data | Supabase queries under RLS |

Delivery details (`/admin/deliveries/[id]`) subscribe to Realtime on that delivery only, then re-fetch authoritative state.

Customer tracking (`/dashboard/deliveries/[id]`) uses the same Realtime tables under RLS (read-only — no Proceed controls).

Public `/track` uses `POST /api/track` (rate-limited; company from hostname). Do not call `get_public_tracking` from the browser.

`SUPABASE_SERVICE_ROLE_KEY` is used only in Next.js API routes (`lib/supabase/service.ts`). Never expose it as `NEXT_PUBLIC_*`.

## Branding

Central brand config lives in `lib/branding.ts` (`resolveBrand`, `PLATFORM_DEFAULTS`).

Tenant branding is stored in `company_branding` (logo, colors, tagline, support email, website) and assets in the Supabase Storage bucket `branding/`.

Operational settings live in `company_settings` (`lib/company-settings.ts`): timezone, currency, support contacts.

Master Admin provisions a full app at `/master-admin/companies/new`  
(Company → Payment → Admin → Branding → Configuration → Review).  
Edit later at `/master-admin/companies/[id]/branding`, `/…/settings`, and `/…/payments`.

See **[BILLING.md](./BILLING.md)**. The platform does not use plans or subscriptions. The Master Admin manually receives payment from customers and may record those payments in the platform. The platform does not process online payments.

Admin/Customer shells and public `/track` apply resolved CSS variables (`--brand-primary`, `--primary`, …). Master Admin always uses platform defaults.

Landing, login, and `/track` use `force-dynamic` so tenant branding is not statically cached across hostnames.

### Custom domain resolution

Middleware resolves `request.nextUrl.hostname` via `resolveCompanyFromHostname` and sets trusted request headers (`x-tenant-company-id`, …) after clearing spoofed values.

- Platform hosts (`localhost`, configured `NEXT_PUBLIC_PLATFORM_HOSTS`, `*.vercel.app`) never resolve as tenants
- `/master-admin` and `/api/master-admin/*` are blocked on custom domains
- Admin/customer users must belong to the hostname company (hostname ≠ authorization)
- Login, landing, and `/track` apply tenant branding when a custom domain is active
- Tenant `/track` scopes lookups server-side so other companies’ tracking numbers are not revealed

Master Admin **Domains** UI: Add → Connect Domain (auto DNS/hosting when configured) → Check Status → Active. Manual DNS instructions always available.

Local testing: add `swift.localhost`, Connect Domain (mock providers), Check Status, visit `http://swift.localhost:3000`.

Domain purchasing and automatic registrar flows are **not** implemented. Offline payment records (no plans/subscriptions, no online gateway) — see **[BILLING.md](./BILLING.md)** and **[SECURITY.md](./SECURITY.md)**.

## Maps

Route visualization uses **Mapbox GL JS** (official web SDK v3.9.4, loaded client-side from Mapbox’s CDN).

| Concern | Approach |
|---------|----------|
| Token | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` |
| Component | `DeliveryMap` / `DeliveryMapDynamic` (`ssr: false`) |
| State | Parent pages own Realtime + fetches; map receives `DeliveryMapModel` |
| Layers | Completed solid line + remaining dashed line GeoJSON sources |
| Markers | Completed / current / upcoming / destination |
| Config isolation | Loader + style constant live under `lib/delivery/` — swappable later for white-label |

Without a Mapbox token the rest of Admin / Customer / Public tracking continues to work.

## Supabase clients

| File | Use |
|------|-----|
| `lib/supabase/client.ts` | Browser client |
| `lib/supabase/server.ts` | Server Components / actions |
| `lib/supabase/middleware.ts` | Cookie refresh in middleware |
| `lib/supabase/service.ts` | Service-role client (API routes only) |

## Key folders

```text
app/admin/            admin pages
app/api/admin/        secure admin API routes
components/admin/     dashboard, tables, forms, route UI
components/delivery/  shared tracking UI + Mapbox DeliveryMap
lib/admin/            queries + delivery actions
lib/delivery/         view-model, map geometry, mapbox loader
lib/auth/             session helpers + auth actions
lib/supabase/         clients
lib/types/            shared TS types
```

## Business RPCs

- `create_delivery_with_stops` ← used by admin create delivery
- `proceed_to_next_stop` ← next phase
- `update_delivery_status`
- `replace_delivery_stops`
- `get_public_tracking` ← called only by `/api/track` (service role)
