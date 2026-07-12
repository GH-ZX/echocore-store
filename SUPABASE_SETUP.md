# ECHOCORE — Supabase Setup Guide

**Live site:** https://www.echocore412.com  
**App version:** 0.5.0

This guide configures Supabase for the ECHOCORE Store React app (auth, catalog, orders, balance, admin).

---

## Quick path (recommended)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. **Project Settings → API** — copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

3. Local `.env`:
   ```bash
   cp .env.example .env
   ```
   Paste the two values.

### 2. Run the database (one file)

Open **SQL Editor** and run the entire file:

👉 **[supabase_echocore_full.sql](./supabase_echocore_full.sql)**

It is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`). Safe for:

| Scenario | Action |
|----------|--------|
| **New project** | Run the full file once (sections §01–§15). |
| **Existing ECHOCORE DB** | Re-run to apply any missing migrations. |
| **Move to another Supabase** | New project + run full file + update secrets (see § Migrate below). |

Do **not** run the optional §A/§B blocks at the bottom in production (they wipe data).

### 3. Auth URL configuration

In **Authentication → URL configuration** (production):

| Field | Value |
|-------|--------|
| Site URL | `https://www.echocore412.com` |
| Redirect URLs | `https://www.echocore412.com/login` |
| | `https://www.echocore412.com/**` |
| | `http://localhost:5173/login` |

### 4. Storage

Confirm bucket **`product-images`** exists and is **public** (created by the SQL script).

### 5. First admin

1. Sign up on the live site or locally.
2. In **Table Editor → `profiles`**, set `role` to `admin` for your user.

### 6. Payments & recharge

**Admin → Payments:** upload ShamCash QR, enter pay code, save.  
**Admin → Recharges:** approve balance top-ups after verifying payment.

---

## GitHub Pages deploy secrets

In the repo **Settings → Secrets and variables → Actions**:

| Secret | Example |
|--------|---------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `VITE_SITE_DOMAIN` | `www.echocore412.com` |
| `VITE_BASE_PATH` | `/` |

The workflow (`.github/workflows/deploy.yml`) runs lint + build and writes `CNAME` when `VITE_SITE_DOMAIN` is set.

**Never** add `G2BULK_API_KEY`, `service_role`, or `VITE_MOCK_FULFILLMENT=true` to production build secrets.

---

## Migrate to another Supabase project

Use the **same** `supabase_echocore_full.sql` on the new project:

1. Create new Supabase project → run §01–§15 from the full SQL file.
2. Configure Auth URLs (table above).
3. Update GitHub Actions secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. **Edge Function secrets** (Dashboard → Edge Functions): re-enter `G2BULK_API_KEY`, cron secrets — not stored in the frontend.
5. **Storage:** re-upload or migrate `product-images` if you need existing assets.
6. **Users:** customers re-register, or restore from a Supabase backup (advanced).

Point DNS for `www.echocore412.com` to GitHub Pages (or keep hosting; only API URL changes).

---

## Security checklist (production)

Run before accepting real payments:

- [ ] `supabase_echocore_full.sql` applied (includes security + recharge locks)
- [ ] As a **non-admin** test user: `SELECT * FROM orders` returns only own rows
- [ ] `get_payment_methods` does not expose ShamCash API token
- [ ] `store_settings` readable only by admins (RLS)
- [ ] `VITE_MOCK_FULFILLMENT` is **not** set in production CI

See [SUPABASE_SETUP.ar.md](./SUPABASE_SETUP.ar.md) for the Arabic version.

---

## SQL file

| File | Purpose |
|------|---------|
| `supabase_echocore_full.sql` | **Only file to run** — complete merged schema (~5,000 lines) |
| Other `supabase_*.sql` | Deprecated stubs — do not run |
| `scripts/*.sql` | Debug / one-off ops (optional, not setup) |

---

## G2Bulk edge functions

After SQL is applied:

```bash
supabase secrets set G2BULK_API_KEY=your_key_here
supabase functions deploy g2bulk
supabase functions deploy g2bulk-sync-cron   # optional scheduled sync
```

**Existing DB missing charm pricing column?** Run [supabase_charm_pricing_migration.sql](./supabase_charm_pricing_migration.sql) in SQL Editor (already merged in the full file).

Admin → **G2Bulk**: test connection, set markup %, enable charm pricing if desired, sync catalog, then **Apply charm prices** once.

Full G2Bulk reference: [docs/g2bulk-api.md](./docs/g2bulk-api.md) · [ECHOCORE_STORE_GUIDE.md](./ECHOCORE_STORE_GUIDE.md)

---

## Optional next steps

- Sam API: `supabase functions deploy sam-api` + payment settings
- Custom domain already live at `www.echocore412.com`
- Notifications: included in full SQL (v1–v3)

You now have a real database-backed store; all catalog, auth, and orders live in Supabase.