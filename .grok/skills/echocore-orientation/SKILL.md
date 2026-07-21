---
name: echocore-orientation
description: >
  Compact project playmap for ECHOCORE Store so agents open only the files
  needed for a task instead of scanning the whole repo. Use at the start of
  any echocore-store task, when exploring unfamiliar areas, when the user
  asks "where is X", or when running /echocore-orientation /playmap /orient.
  Triggers on: echocore, store work, new feature, fix bug, where is, find file,
  orientation, playmap.
---

# ECHOCORE Orientation

## Goal

Minimize discovery cost. **Never** re-read the entire project. Route via the playmap, open 2–8 files, then act.

## Before any exploration

1. Read `references/playmap.md` in this skill (task → files index).
2. Match the user request to **one primary domain** (and optionally one secondary).
3. Open only the listed paths. Use `grep` only inside those paths unless the hit proves another file is needed.
4. Load a domain skill when the table says so (`g2bulk-api`, `sam-api-wallet`, `echocore-standards`).

## Hard rules

| Do | Don't |
|----|--------|
| Start from playmap rows | `list_dir` on `src/` or repo root “to get a feel” |
| `grep` path-scoped to `src/lib`, one view, or one admin folder | Recursive search from repo root without a domain guess |
| Read `PROJECT_MAP.md` only if playmap + 2 greps fail | Re-read `CLAUDE.md` / full SQL dump every session |
| Extend existing `lib/*` helpers | Invent parallel modules for the same concern |

## Session checklist

- [ ] Domain identified from playmap
- [ ] Domain skill loaded if required
- [ ] Only playmap files opened first
- [ ] i18n path known if UI copy changes (`translations.js` / `pageContent.js`)
- [ ] Edge function path known if server logic changes (`supabase/functions/`)

## Quick stack reminder

- SPA: React 19 + Vite 8 + Tailwind v4 + react-router v7
- Backend: Supabase (auth, Postgres, storage, edge functions)
- Global state: `src/App.jsx` (no Redux/Zustand)
- Routes: `src/components/routing/AppRoutes.jsx`
- i18n: `t.key` only — never inline bilingual ternaries
- Live site: `www.echocore412.com` via GitHub Pages

## When the map is wrong or incomplete

1. Fix the gap in `references/playmap.md` in the same change set (one row).
2. Keep rows short: **domain | open these | skills | notes**.
3. Do not grow this SKILL.md into a second PROJECT_MAP — the reference file owns detail.

## Related always-on files

- `AGENTS.md` (repo root) — injected every session
- `CLAUDE.md` — architecture + commands
- `PROJECT_MAP.md` — human-readable map + routes table
