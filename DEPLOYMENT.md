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
  `company_domains`, `payments`
- No production use of: `plans`, `plan_limits`, `plan_features`,
  `company_subscriptions`, `subscription_events`, `company_usage_periods`
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

Production should **not** use seed demo users (`DemoPass123!`, Swift/Prime).

Safest controlled procedure:

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
5. Sign in at `/login` on the **platform** hostname (Netlify domain or
   `NEXT_PUBLIC_PLATFORM_HOSTS` host). Master Admin routes are blocked on
   tenant custom domains.

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

## 13. Configure custom domains (tenants)

**Application (already implemented):**

- Master Admin adds / verifies / activates domains via `company_domains`
- Middleware resolves hostname → tenant; Master Admin blocked on tenant hosts
- `Vary: Host` / dynamic rendering used to avoid cross-host cache bleed

**Netlify / DNS (manual):**

1. Customer points domain (CNAME/A) to your Netlify site per Netlify docs.
2. Add the domain in Netlify Domain management (or Netlify DNS).
3. Complete TXT verification + activation in Master Admin UI.
4. Add `https://tenant-domain/**` to Supabase Auth redirect URLs if users
   will log in / reset password on that host.

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

## Payments (unchanged product model)

Master Admin records offline payments only. No Stripe / Paystack /
Flutterwave / plans / subscriptions / checkout.

See [BILLING.md](./BILLING.md).

---

## Related docs

- [BACKEND.md](./BACKEND.md) — schema, RPCs, RLS
- [FRONTEND.md](./FRONTEND.md) — routes, tenancy UI
- [SECURITY.md](./SECURITY.md) — security checklist
- [BILLING.md](./BILLING.md) — manual payments
- [.env.example](./.env.example) — variable names
