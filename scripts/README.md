# Scripts folder

## Database

**One file only for the database:**

👉 **[`../supabase_echocore_full.sql`](../supabase_echocore_full.sql)**

- New Supabase project → run this entire file once in the SQL Editor  
- Existing live project → already applied; only re-run if moving to a **new** empty project  
- All previous `scripts/*-migration.sql` files were **merged into** the full file (2026-07-24) and removed  

## Tooling (not SQL)

| File | Purpose |
|------|---------|
| `gh-pages-spa.mjs` | GitHub Pages SPA helper after `npm run build` |
| `upload-game-logos.mjs` | Upload logos to Supabase storage |
| `merge-supabase-sql.mjs` / `finalize-full-sql.mjs` / `dedupe-full-sql.mjs` | Legacy helpers to build the full SQL (optional) |
| `run-*.ps1` | Optional Windows helpers |
| `game-logos.manifest.json` | Logo upload manifest |

## Archive

`archive/` — empty placeholder / old recover tools only. Do not run random files from there.

Docs: [../docs/README.md](../docs/README.md)
