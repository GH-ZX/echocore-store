# ECHOCORE — for the store owner (simple)

**Site:** https://www.echocore412.com  

This page is in plain language. No coding required to **understand** the store.

Arabic deep report (features & history):  
[تقرير-تطوير-الموقع-للمالك.txt](../تقرير-تطوير-الموقع-للمالك.txt)

---

## What is this store?

An online shop for **game top-ups** and **digital cards**:

1. Customer creates an account  
2. Loads wallet balance (ShamCash / Syriatel — manual or automatic)  
3. Buys a pack (UID top-up or redeem code)  
4. System tries to deliver automatically via the supplier (G2Bulk)  
5. Customer gets a receipt / invoice  

You manage everything from **`/dashboard`** (admin account).

---

## What you use day to day

| Need | Where |
|------|--------|
| Orders & delivery | Admin → Orders |
| Wallet recharges | Admin → Recharges |
| Products / prices | Admin → Products / Offers · G2Bulk |
| Payments (ShamCash, Sam API) | Admin → Payments |
| Homepage & theme | Admin → Home layout · Theme |
| Contact messages | Admin → Contact / inbox |
| Partners (when you launch) | Admin → Partners (tab hidden until launch) |

---

## Important links

| Topic | Doc |
|-------|-----|
| Run / deploy notes (Arabic) | [RUNNING.md](../RUNNING.md) |
| Domain & DNS (www) | [domain-dns.md](./domain-dns.md) |
| API keys must stay secret | [edge-secrets.md](./edge-secrets.md) |
| Full map of pages (technical) | [PROJECT_MAP.md](../PROJECT_MAP.md) |
| All docs index | [README.md](./README.md) |

---

## What you can ignore

| Folder / files | Why |
|----------------|-----|
| `src/` | Website source code |
| `scripts/` tooling | Build helpers only — DB is **one file**: `supabase_echocore_full.sql` |
| `AGENTS.md`, `CLAUDE.md` | For AI coding tools only |
| `docs/g2bulk-api.md`, `igdb-api.md` | Supplier API reference for developers |

| `node_modules/`, `dist/` | Build junk — not documentation |

---

## When something breaks

1. Check the live site on **https://www.echocore412.com** (use **www**)  
2. Admin → site logs / orders for failed deliveries  
3. If the whole catalog is empty: often a **database permission** issue — ask your developer; do **not** re-run random SQL files  
4. Fresh database setup uses **one** file only: `supabase_echocore_full.sql`  

---

## Partners

Partner / Super pricing exists. The **Partners admin tab stays hidden** until you decide to advertise and launch that program. Your account can still be marked partner for testing.
