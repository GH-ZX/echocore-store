# ECHOCORE docs

**Live:** [www.echocore412.com](https://www.echocore412.com)

Pick one path — ignore the rest.

| I want… | Open |
|---------|------|
| **Owner, plain language** | [for-owners.md](./for-owners.md) · Arabic report: [تقرير المالك](../تقرير-تطوير-الموقع-للمالك.txt) |
| **Run / deploy** | [../RUNNING.md](../RUNNING.md) · [../README.md](../README.md) |
| **Database** | [../SUPABASE_SETUP.md](../SUPABASE_SETUP.md) · عربي [../SUPABASE_SETUP.ar.md](../SUPABASE_SETUP.ar.md) |
| **Pages & admin map** | [../PROJECT_MAP.md](../PROJECT_MAP.md) |
| **Domain / DNS** | [domain-dns.md](./domain-dns.md) |
| **API keys** | [edge-secrets.md](./edge-secrets.md) |
| **G2Bulk / IGDB APIs** | [g2bulk-api.md](./g2bulk-api.md) · [igdb-api.md](./igdb-api.md) |
| **Database (one SQL file)** | [../supabase_echocore_full.sql](../supabase_echocore_full.sql) · [../scripts/README.md](../scripts/README.md) |

### Leave alone (developers / AI tools)

`AGENTS.md`, `CLAUDE.md`, `src/`, `scripts/*.sql` (except when applying a known fix)

### How the store works (one picture)

```
Customer → Website (GitHub Pages)
              ↓
         Supabase (auth, balance, orders)
              ↓
    G2Bulk (delivery) · Sam (wallet pay)
```
