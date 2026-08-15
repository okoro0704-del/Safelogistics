# Security model & production checklist

Parcel Movement is a multi-tenant white-label delivery platform. This document is the source of truth for the security model.

Related docs: [README.md](./README.md) · [BACKEND.md](./BACKEND.md) · [FRONTEND.md](./FRONTEND.md)

---

## Security model (concise)

### Tenant resolution

```text
Host / nextUrl.hostname
  → normalize (lowercase, strip port/trailing dot)
  → company_domains where status = active
     OR {slug}.{TENANT_SUBDOMAIN_BASE} via company slug
     OR platform path preview /t/{slug}
  → company (must be active for portals)
```

- Middleware sets `x-tenant-*` request headers **after clearing any client-spoofed values**.
- Hostname is a **routing hint**, not authorization. RLS + authenticated `company_id` still bind writes.
- Only **active** domains resolve. `pending` / `provisioning` / `verifying` / `failed` / `disabled` do not.
- Custom domains and managed tenant subdomains block `/master-admin` and `/api/master-admin/*`.
- Platform host (`NEXT_PUBLIC_PLATFORM_HOSTS`, e.g. `pm.webfinance.app`) is the only Master Admin surface.

### Host / proxy expectations (production)

| Prefer | Avoid |
|--------|--------|
| Platform `Host` / Next.js `nextUrl.hostname` | Blind trust of arbitrary `X-Forwarded-Host` from the client |
| Edge that strips/forges forwarded headers | Passing untrusted forwarded headers to tenant resolution |

Configure the reverse proxy (Vercel, Cloudflare, nginx) so the app receives the **real public hostname** the user hit. Do not let end users set tenant identity via headers.

### Roles & RLS

| Role | Scope |
|------|--------|
| `master_admin` | Platform only (`company_id` NULL). Manage companies, branding, settings, domains, admins. |
| `admin` | Own company only. Customers, deliveries, proceed, stops. |
| `customer` | Own profile + own deliveries. |
| `anonymous` | Public tracking via `/api/track` only (safe fields). |

RLS helpers (`is_admin`, `same_company`, `owns_delivery`, `company_is_active`) and `SECURITY DEFINER` RPCs enforce ownership. Never trust client `company_id`.

### Authorization matrix (UI ≈ API ≈ DB)

| Resource | master_admin | admin | customer | anonymous |
|----------|:------------:|:-----:|:--------:|:---------:|
| Companies | CRUD / suspend | — | — | — |
| Company settings / branding / domains | Yes | — | — | public branding subset on track |
| Admins | Create | — | — | — |
| Customers | — | own company | own profile | — |
| Deliveries / stops / history | — | own company | own deliveries (read) | public track subset |
| Proceed / replace stops | — | own company | — | — |
| Master Admin APIs | Yes | No | No | No |
| Public tracking | — | — | — | rate-limited API |

### Public tracking

- Browser calls **`POST /api/track`** only (rate-limited).
- `get_public_tracking` is **`service_role` only** — not callable with the anon key.
- Company scope derived from **hostname**, never from body/`company_id`.
- Suspended companies return “not found”.
- Payload excludes customer email/phone/address, auth data, and secrets.
- Tracking numbers: high-entropy `DLV-` + 12 hex (legacy sequential format still accepted for old rows).

### Service role

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only** (`lib/supabase/service.ts`).
- Used for Auth user creation and the public tracking RPC.
- Never use `NEXT_PUBLIC_` for secrets.

### Storage

- Bucket `branding/{company_id}/…` — public read of intentional logos; writes Master Admin only.
- Uploads validated by **magic bytes** (PNG/JPEG/WebP/ICO). SVG rejected.

### DNS / hosting credentials

- `CLOUDFLARE_*`, `VERCEL_*`, DNS tokens: server-only, least privilege, rotatable.
- Provisioning APIs are Master Admin–gated and scoped by `company_id` + `domain_id`.

### CSRF / XSS / redirects

- Cookie sessions via `@supabase/ssr`; privileged mutations use same-origin cookies (browser CSRF model).
- React escaping for user text; no `dangerouslySetInnerHTML` for tenant content.
- Password reset `redirectTo` uses configured site origin only.

---

## Environment classification

| Variable | Class |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (RLS-enforced) |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Public (browser-scoped Mapbox token) |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_PLATFORM_HOSTS` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret / server-only** |
| `SUPABASE_URL` | Server-only |
| `DNS_PROVIDER`, `CUSTOM_DOMAIN_TARGET` | Server config |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | **Secret** |
| `HOSTING_PROVIDER`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | **Secret** / server |

Rotate DNS/hosting tokens in the provider console, update env, redeploy. Prefer zone-scoped Cloudflare tokens (Zone → DNS → Edit).

---

## Before production checklist

```text
[ ] npm run lint
[ ] npm run build
[ ] Fresh database migration (`npx supabase db reset` or migrate chain)
[ ] Seed / demo accounts smoke test
[ ] RLS audit (cross-company table access denied)
[ ] API authorization audit (admin vs master-admin vs customer)
[ ] Cross-tenant test (Swift ̸= Prime deliveries / branding / domains)
[ ] Domain isolation test (active only; disabled does not resolve)
[ ] Storage isolation test (branding paths)
[ ] Auth test (roles, logout, password reset messaging)
[ ] Suspension test (portals + tracking + reactivate)
[ ] Public tracking test (rate limit, tenant scope, no PII)
[ ] Realtime test (customer cannot subscribe to foreign delivery_id)
[ ] DNS provisioning test (idempotent Connect / Check Status)
[ ] Error leakage test (no stack traces / keys in API JSON)
[ ] Environment variable audit (no secrets in NEXT_PUBLIC_*)
[ ] Health check `/api/health` returns `{ ok: true }`
[ ] Mapbox missing-token fallback still usable
```

---

## Health

`GET /api/health` — liveness only (`{ ok: true, service: "parcel-movement" }`). No DB credentials or diagnostics.
