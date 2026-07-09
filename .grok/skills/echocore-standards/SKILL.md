---
name: echocore-standards
description: >
  ECHOCORE Store coding standards: centralized i18n via translations.js/pageContent.js,
  no inline bilingual strings, shared lib helpers, connected architecture.
  Use when implementing features, fixing UI copy, refactoring, or reviewing diffs in echocore-store.
  Triggers on: translation, i18n, hardcoded Arabic/English, t.key, pageContent, clean architecture.
---

# ECHOCORE Store Standards

Apply on **every** change in this repo. Prefer extending existing patterns over new one-offs.

## 1. Internationalization (mandatory)

### Single source of truth

| Layer | Path | Use for |
|-------|------|---------|
| UI strings (keys) | `src/data/translations.js` | Buttons, labels, toasts, nav, admin tabs |
| Page/legal copy (blocks) | `src/data/pageContent.js` | FAQ items, privacy/terms sections, footer, how-it-works steps |
| Helpers | `src/lib/i18n.js` | `getT(lang)`, `formatMessage()`, `followUsOnLabel()` |
| Runtime config | `src/lib/buildInfo.js` | Version, developer name, URLs — **not** UI sentences |

`translations.js` merges `pageContent` via spread. New page copy → add to **both** `ar` and `en` in `pageContent.js`.

### Rules

**Never** add user-visible copy as:
```js
isAr ? 'نص عربي' : 'English text'
lang === 'ar' ? '...' : '...'
t.someKey || (isAr ? '...' : '...')
```

**Always** use:
```js
// Component receives t from App (preferred)
{t.backToStore}

// Or when only lang is available
import { getT, formatMessage } from '../lib/i18n';
const t = getT(lang);
formatMessage(t.footerCopyright, { version: APP_VERSION })
```

### Adding new strings

1. Pick a **camelCase** key (`checkoutWalletNote`, not `checkout_wallet_note`).
2. Add **Arabic first**, then English (site default is `ar`).
3. Placeholders: `{count}`, `{operator}`, `{platform}` — resolve with `formatMessage`.
4. Structured content (FAQ, legal): use arrays in `pageContent.js` (`faqItems`, `privacySections`).
5. Pass `t` from `App.jsx` routes; child views should not re-derive language strings.

### Props convention

- `lang` — `'ar' | 'en'` for direction, dates, `getT` fallback
- `t` — `translations[lang]` object; required on all user-facing views
- Do not pass `isAr` booleans for copy; use `lang` only when needed for layout (`dir`, arrows)

## 2. Implementation (connected & lean)

### Before writing new code

1. **Search** for an existing helper/component (`grep` / glob).
2. **Reuse** `lib/*`, `components/ui/*`, `ConfirmDialog`, `LegalPageView`, `CatalogPageShell`.
3. **One path** for data: Supabase ops live in `App.jsx` or dedicated `lib/*.js`, not duplicated in views.
4. **One modal** per entity: e.g. `AdminGameEditModal` — do not rebuild forms inline in `AdminView`.

### File size guardrails

| File | ~lines | Action if growing |
|------|--------|-------------------|
| `App.jsx` | 1800 | Extract route config, data hooks to `lib/` or `hooks/` |
| `AdminView.jsx` | 1300 | Remove inline game form; delegate to modals only |
| `translations.js` | 1400 | New blocks → `pageContent.js`; avoid duplicate keys |
| `theme.js` | 1180 | Split presets vs runtime apply |

### Avoid purposeless growth

- No duplicate fallback strings (if key exists in `t`, use `t.key` only).
- No dead exports, unused `isAr` locals, or copy-pasted bilingual objects (`content = { ... }` in components).
- No second translation file for the same key (check `translations.js` + `pageContent.js` before adding).
- Prefer **one** confirm/delete pattern (`ConfirmDialog`), not `window.confirm`.
- Constants (URLs, handles) in `lib/`; sentences in `translations`/`pageContent`.

### Wiring checklist for new features

- [ ] Route in `App.jsx` with `t` and `lang` passed
- [ ] Keys in `translations.js` or `pageContent.js` (both languages)
- [ ] Footer/nav link if public page
- [ ] No inline `isAr ?` for UI text
- [ ] `npm run lint` && `npm run build` pass

## 3. When refactoring existing code

If you touch a file that still has `t.key || (isAr ?` or `isAr ? '...' : '...'`:

1. Move strings to `translations.js` / `pageContent.js`.
2. Replace with `t.key` or `formatMessage`.
3. Remove unused `isAr` / `lang` props if only used for copy.
4. Do **not** expand scope beyond the file's feature unless user asked for i18n sweep.

## 4. Audit reference

See `references/bloat-audit.md` for measured debt (fallback counts, large files, duplication hotspots) and cleanup priority order.