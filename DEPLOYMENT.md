# Production Deployment — Supabase + Netlify

This application deploys as a **Next.js site on Netlify** with **Supabase**
(PostgreSQL, Auth, RLS, Realtime, Storage, RPCs). There is **no** separate
backend (no Railway, Express, or custom Node server).

Do not put production secrets in this repository. Configure them in the
Supabase dashboard and Netlify environment variables.

---

## Architecture

```text
Next.js (Netlify)
   ↓
Supabase
   ├── PostgreSQL + RLS + RPCs
   ├── Auth
   ├── Realtime
   └── Storage (branding)
Mapbox (browser token) → map visualization
```

---

## Prerequisites

- Node.js **20+** (Netlify build uses `NODE_VERSION=20` via `netlify.toml`)
- A [Supabase](https://supabase.com) project
- A [Netlify](https://www.netlify.com) site linked to this Git repository
- A [Mapbox](https://account.mapbox.com/) **public** access token
- Supabase CLI (for linking and pushing migrations)

---

## 1. Create Supabase project

1. Create a new project in the Supabase dashboard.
2. Note **Project URL**, **anon key**, and **service_role key**
   (Project Settings → API).
3. Never expose `service_role` in the browser or as `NEXT_PUBLIC_*`.

---

## 2. Configure Supabase Auth

**Authentication → URL Configuration**

| Setting | Value |
|---------|--------|
| Site URL | `https://YOUR_SITE.netlify.app` (or your custom platform domain) |
| Additional Redirect URLs | `https://YOUR_SITE.netlify.app/**` |
| | `https://YOUR_PLATFORM_DOMAIN/**` (if used) |
| | `http://localhost:3000/**` (local only) |

Password reset redirects to:

```text
{NEXT_PUBLIC_SITE_URL}/update-password
```

Also allow redirects for any **active tenant custom domains** you add later:

```text
https://tenant-domain.example/** 
```

**Email templates** (optional): ensure the reset link uses the redirect URL
configured above.

---

## 3. Link repository to Supabase

From the project root (do **not** run `db reset` against production):

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF` is the subdomain of `https://YOUR_PROJECT_REF.supabase.co`.

---

## 4. Apply migrations

```bash
npx supabase db push
```

This applies every file under `supabase/migrations/` in chronological order.

**Expected final schema includes:**

- Tables: `companies`, `profiles`, `deliveries`, `delivery_stops`,
  `delivery_location_history`, `company_branding`, `company_settings`,
  `company_domains`
- No production use of: `plans`, `plan_limits`, `plan_features`,
  `company_subscriptions`, `subscription_events`, `company_usage_periods`,
  `payments`
  (historical migrations may create then drop these)

**Do not** run against production:

```bash
npx supabase db reset
```

`db reset` is for **local** development only (and uses `supabase/seed.sql`).

---

## 5. Configure Storage

Migrations create the **`branding`** bucket (public read for logos).

Verify in Supabase → Storage:

- Bucket `branding` exists
- Public read allowed for logo URLs
- Writes are restricted to Master Admin / server paths used by the app

No local filesystem storage is used for branding on Netlify.

---

## 6. Configure Realtime

Migrations publish Realtime for:

- `deliveries`
- `delivery_stops`
- `delivery_location_history`

Confirm in Supabase → Database → Replication / Realtime that these tables
are enabled. Do not publish unnecessary tables.

---

## 7. Create first Master Admin

**Dedicated Master / Application Hub URLs (after deploy):**

```text
https://YOUR_SITE.netlify.app/hub/login          ← Master Admin sign in
https://YOUR_SITE.netlify.app/hub                ← Application Hub (create apps)
https://YOUR_SITE.netlify.app/master-admin/login ← same login (alias)
https://YOUR_SITE.netlify.app/master-admin       ← same hub (alias)
```

Do not use `/login` for Master Admin — that page is for tenant admins and customers.

### Option A — Dashboard (recommended)

1. Supabase → Authentication → Users → Add user  
2. Email / password of your choice, **Auto Confirm User** ON  
3. Run SQL to set `profiles.role = 'master_admin'` and `company_id = null`  
   (see script below or `scripts/create-master-admin.sql`)

### Option B — First-time web setup (recommended on Netlify)

After env vars are set and the site is deployed:

1. Open `https://YOUR_SITE.netlify.app/hub/setup`
2. Enter email + password (do **not** use `*.local` emails)
3. Click **Create Master Admin**
4. Sign in at `/hub/login`

This uses the Auth Admin API. Do **not** rely on SQL `crypt()` password inserts for hosted Auth.

### Option C — Temporary bootstrap SQL (profile promote only)

`scripts/create-master-admin.sql` can promote an **existing** Auth user to
`master_admin`. It does **not** reliably set a login password on hosted Supabase.

Production should **not** rely on seed demo users (`DemoPass123!`, Swift/Prime).

Safest controlled procedure (manual):

1. In Supabase → Authentication → Users, create a user with a strong password
   (or invite via email).
2. Note the user's `id` (UUID).
3. In SQL Editor, insert a platform Master Admin profile (adjust email/name):

```sql
insert into public.profiles (
  id,
  email,
  full_name,
  role,
  company_id
) values (
  'AUTH_USER_UUID_HERE',
  'you@yourdomain.com',
  'Platform Owner',
  'master_admin',
  null
);
```

4. Confirm `role = 'master_admin'` and `company_id is null`.
5. Sign in at `/hub/login` on the **platform** hostname (Netlify domain or
   `NEXT_PUBLIC_PLATFORM_HOSTS` host). You land in the Application Hub to create
   tenant apps. Master Admin routes are blocked on tenant custom domains.

If your migrations already create a profile trigger on signup, update that
row’s `role` to `master_admin` instead of inserting a duplicate.

---

## 8. Create Netlify site

1. Netlify → Add new site → Import from Git (this repository).
2. Build settings (also in `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** leave empty / let Next.js runtime manage
     (do **not** set publish to `.next` alone)
3. Ensure the **Next.js** runtime / `@netlify/plugin-nextjs` is enabled
   (Netlify usually detects Next.js automatically).
4. Node version: `20` (`[build.environment] NODE_VERSION = "20"`).

---

## 9. Configure environment variables

**Netlify → Site configuration → Environment variables**

### Required

| Name | Scope |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Public (browser token) |

### Strongly recommended

| Name | Purpose |
|------|---------|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for password-reset links (e.g. `https://your-site.netlify.app`) |
| `NEXT_PUBLIC_PLATFORM_HOSTS` | Comma-separated platform hostnames that must never resolve as tenants |

### Optional (custom domain automation)

Leave unset for manual DNS (recommended for first production):

| Name | Notes |
|------|--------|
| `DNS_PROVIDER` | Default effectively manual (`none`) |
| `CUSTOM_DOMAIN_TARGET` | e.g. your `*.netlify.app` hostname |
| `CLOUDFLARE_*` / `HOSTING_PROVIDER` / `VERCEL_*` | Only if using automation helpers |

### Do not set

- Do not put service role in any `NEXT_PUBLIC_*` variable
- Do not rely on `DATABASE_URL` (app uses Supabase client APIs)
- Seed/demo passwords must not be production env vars

---

## 10. Deploy

Trigger a production deploy from Netlify (Git push to the production branch
or **Deploy site**).

Confirm build logs show `npm run build` succeeding.

---

## 11. Configure Mapbox

1. Create a **public** token (not a secret token).
2. Set URL restrictions to your Netlify domain and any custom domains.
3. Set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in Netlify and redeploy if needed.

---

## 12. Configure production domain (platform)

1. Netlify → Domain management → add primary domain (optional).
2. Set `NEXT_PUBLIC_SITE_URL` to `https://your-platform-domain`.
3. Add that hostname to `NEXT_PUBLIC_PLATFORM_HOSTS`.
4. Update Supabase Auth Site URL / redirect allow list.
5. `*.netlify.app` hosts are already treated as platform hosts in code.

---

## 12b. Tenant path preview (before custom domain)

Nested Netlify hosts like `tenant.yoursite.netlify.app` are **not** supported.
Before a custom domain is ready, open the tenant on the **platform** host:

```text
https://YOUR_SITE.netlify.app/t/{company-slug}
```

Example: `https://safeogistics.netlify.app/t/fasttrack`

Requires the SQL function `resolve_tenant_by_slug` (migration
`20260805120000_resolve_tenant_by_slug.sql`, or run
`scripts/resolve-tenant-by-slug.sql` in the Supabase SQL Editor).

Hub UI shows **Open preview** on the company page and after Create App.

---

## 13. Configure custom domains (tenants)

**Before a custom domain (path preview):**

On the platform Netlify host, open:

```text
https://YOUR_SITE.netlify.app/t/{company-slug}
```

Example: `https://safeogistics.netlify.app/t/fasttrack`

Requires `resolve_tenant_by_slug` in Supabase (migration
`20260805120000_resolve_tenant_by_slug.sql` or
`scripts/resolve-tenant-by-slug.sql`). Visiting `/master-admin` clears
preview context so the Application Hub stays available.

**Application (already implemented):**

- Master Admin adds / verifies / activates domains via `company_domains`
- **Buy domain** uses Namecheap (`REGISTRAR_PROVIDER=namecheap`) then attaches
  the hostname with Netlify (`HOSTING_PROVIDER=netlify`)
- Middleware resolves hostname → tenant; Master Admin blocked on tenant hosts
- `Vary: Host` / dynamic rendering used to avoid cross-host cache bleed

**Netlify / DNS (manual or automated):**

1. For purchases: Namecheap registers the domain and writes CNAME/TXT; Netlify
   Domains API adds the hostname (`NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID`).
2. For existing domains: customer points CNAME/A to `CUSTOM_DOMAIN_TARGET`, then
   Master Admin → Add existing domain → Connect → Check Status.
3. Add `https://tenant-domain/**` to Supabase Auth redirect URLs if users
   will log in / reset password on that host.

**Tenant email (Resend):**

1. Set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_PROVIDER=resend`.
2. Master Admin → Company → Email → Provision with Resend.
3. Point Resend inbound webhook to `https://YOUR_PLATFORM/api/webhooks/resend`.
4. Tenant admins use `/admin/inbox` for the shared `support@` mailbox.

This app does **not** call DNS provider APIs unless you configure optional
automation env vars.

---

## 14. Production smoke tests

After deploy:

```text
[ ] Landing page loads
[ ] Login works
[ ] Master Admin login works
[ ] Create company works
[ ] Payment record works
[ ] Admin login works
[ ] Customer creation works
[ ] Delivery creation works
[ ] Proceed works
[ ] Realtime works
[ ] Customer tracking works
[ ] Public tracking works
[ ] Map works
[ ] Branding works
[ ] Company isolation works
[ ] Custom domain works
[ ] Suspension works
[ ] Password reset works
```

---

## Local vs production seed

| | Local | Production |
|--|--------|------------|
| `npx supabase db reset` | OK — applies migrations + `seed.sql` | **Forbidden** |
| Demo users / companies | Seeded for QA | Do **not** seed |
| First Master Admin | From seed or manual | Manual Auth + profile (section 7) |

---

## Supabase CLI reference (safe)

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push          # apply migrations to linked project
npx supabase migration list   # inspect local vs remote
```

Unsafe on production:

```bash
npx supabase db reset         # wipes DB + reseeds — local only
```

---

## Wildcard tenant subdomains (Parcel Movement)

Platform host: **`pm.webfinance.app`**  
Tenant hosts: **`{slug}.apps.webfinance.app`**

### DNS

Create a wildcard CNAME (or ALIAS) for the apps apex:

```text
*.apps.webfinance.app  →  pm.webfinance.app
```

(Or point `*.apps.webfinance.app` at the same Netlify load balancer / site target you use for `pm.webfinance.app`.)

### Netlify

1. Domain management → add `apps.webfinance.app`
2. Configure wildcard `*.apps.webfinance.app` on the **same** site as `pm.webfinance.app`
3. Wait for Netlify to issue the **wildcard TLS certificate** before expecting tenant hosts to work

### Environment variables (production)

```text
NEXT_PUBLIC_PLATFORM_HOSTS=pm.webfinance.app
NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE=apps.webfinance.app
NEXT_PUBLIC_SITE_URL=https://pm.webfinance.app
```

Do **not** list `apps.webfinance.app` as a platform host. Only `pm.webfinance.app` is the Application Hub / Master Admin host.

### Smoke tests

1. Open `https://pm.webfinance.app/master-admin` — Master Admin only on platform host
2. Create an app with slug `acme` — deliverables should prefer `https://acme.apps.webfinance.app/...`
3. Visit `https://acme.apps.webfinance.app/login` and `/track` — tenant branding + isolation
4. Confirm `/t/acme` still works as a platform-host path preview fallback
5. Confirm there is no `/master-admin/billing` or company payments UI

Managed `*.apps.webfinance.app` hosts skip per-tenant Netlify domain registration. Purchased custom domains still use Namecheap + Netlify when configured.

---

## Webfinance distributor provision API

Server-to-server endpoint for the Webfinance master distributor control panel:

```text
POST https://pm.webfinance.app/api/v1/tenants/provision
```

### Netlify env

```text
TENANT_HMAC_SECRET=<shared-secret-with-webfinance>
SUPABASE_SERVICE_ROLE_KEY=<service-role>
NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE=apps.webfinance.app
NEXT_PUBLIC_SITE_URL=https://pm.webfinance.app
```

### Headers

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `X-Distributor-Signature` | HMAC-SHA256 hex of **raw body** using `TENANT_HMAC_SECRET` |
| `X-Distributor-Timestamp` | Epoch milliseconds (must be within ~5 minutes) |
| `X-Idempotency-Key` | Client UUID (same key + same body → replay; different body → 409) |

### Body

```json
{
  "client_id": "uuid",
  "distributor_id": "uuid",
  "product_sku": "PRODUCT_B",
  "display_name": "Acme Ltd",
  "slug": "acme",
  "custom_domain": "acme.example.com",
  "timestamp": "2026-08-16T21:00:00.000Z",
  "admin_email": "admin@acme.example.com",
  "admin_full_name": "Acme Admin"
}
```

`admin_email` and `admin_full_name` are required so Auth can create the tenant administrator.

### Success (200)

```json
{
  "tenant_id": "ten_<company-uuid>",
  "admin_email": "admin@acme.example.com",
  "temporary_password": "Tmp-...",
  "access_url": "https://acme.apps.webfinance.app/login"
}
```

Idempotent replays return the same payload with `temporary_password: null`.

### Database

Apply `scripts/distributor-tenant-provision.sql` (or migration `20260816100000_distributor_tenant_provision.sql`) so `service_provision_company` and `distributor_provision_requests` exist.

---

## Payments removed

Parcel Movement does **not** include payment or billing features. Historical
migrations may create a `payments` table; migration
`20260815230000_remove_payments_add_subdomains.sql` (also
`scripts/remove-payments.sql`) drops it and recreates payment-free
`master_provision_company`.

---

## Related docs

- [BACKEND.md](./BACKEND.md) — schema, RPCs, RLS
- [FRONTEND.md](./FRONTEND.md) — routes, tenancy UI
- [SECURITY.md](./SECURITY.md) — security checklist
- [.env.example](./.env.example) — variable names
