# ECHOCORE Store — Code bloat & cohesion audit

*Generated: July 2026. Re-run grep counts after major refactors.*

## Summary

The codebase is **functional but vertically tall**: large god-files, duplicated UI copy patterns, and parallel implementations of the same feature inflate line count without adding capability.

| Issue | Severity | Est. wasted lines |
|-------|----------|-------------------|
| Inline i18n fallbacks (`t.x \|\| (isAr ?`) | High | ~400+ across 50 files |
| `App.jsx` monolith | High | Hard to navigate; should split |
| `AdminView` inline game form + modal | Medium | ~200 duplicate vs `AdminGameEditModal` |
| `translations.js` size + overlap with `pageContent` | Medium | Some keys duplicated/unused |
| `t.key \|\|` defensive fallbacks | Medium | ~300 instances — hide missing keys |
| Unused translation keys | Low | e.g. `developerPageLabel`, `developerPageVersion` |
| `window.confirm` in admin | Low | 1 file — should use `ConfirmDialog` |

---

## 1. Hardcoded / fallback translations (biggest noise)

Patterns still in `src/` (approximate counts):

| Pattern | Files | Instances |
|---------|-------|-----------|
| `t.* \|\|` fallback chains | 45+ | ~300 |
| `isAr ? '…' : '…'` | 40+ | ~350 |
| `lang === 'ar' ?` for copy | 15+ | ~50 |

### Worst offenders (fix next)

1. **`ProfileView.jsx`** — ~75 `isAr` / `t ||` patterns; largest UI debt
2. **`AdminG2BulkSettings.jsx`** — ~67 inline strings + `window.confirm`
3. **`BuyView.jsx`** — ~28 `isAr` patterns
4. **`LoginView.jsx`** — ~29 hardcoded auth strings
5. **`AdminView.jsx`** — ~69 `t ||` + inline game CRUD form
6. **`AdminPaymentsSettings.jsx`** — ~27 admin fallbacks
7. **`AdminHomeLayoutSettings.jsx`** — ~38 fallbacks
8. **`GameDetail.jsx`** — ~17 fallbacks

### Already cleaned (reference)

Footer, Terms, Privacy, FAQ, HowItWorks, Contact, NotFound, ErrorBoundary, Links, Developer, LegalPageView, SocialLinkTree, HomeView (partial).

---

## 2. Oversized files (tall without necessity)

| File | Lines | Why it grew |
|------|-------|-------------|
| `translations.js` | ~1400 | All keys in one object; some overlap with `pageContent.js` |
| `App.jsx` | ~1800 | Routes + auth + cart + admin CRUD + notifications + theme |
| `AdminView.jsx` | ~1320 | Full admin dashboard + **duplicate** game add/edit form |
| `AdminThemeSettings.jsx` | ~1288 | Many theme fields inline |
| `theme.js` | ~1180 | Presets + CSS variable mapping |
| `ProfileView.jsx` | ~820 | Form + details + orders + inline copy |
| `G2bulkPullPanel.jsx` | ~620 | Self-contained admin panel |

**Recommendation:** Extract `useStoreData`, `useAuth`, route table from `App.jsx`. Remove inline game form from `AdminView` (use `AdminGameEditModal` only).

---

## 3. Duplication (same job, two implementations)

| Feature | Implementation A | Implementation B |
|---------|------------------|------------------|
| Game edit/create | `AdminGameEditModal` | `AdminView` `newGame` form + `startEditGame` |
| Delete confirm | `ConfirmDialog` | `window.confirm` in `AdminG2BulkSettings` |
| Social labels | `t.followUsOn` + `i18n.js` | (removed) `socialLinks.js` text helpers |
| Developer proud text | `t.developerPageProud` with `{operator}` | Was hardcoded EN/AR in component |

---

## 4. Translation file hygiene

- **`pageContent.js`** — footer, legal, FAQ, how-it-works, error strings (~336 lines)
- **`translations.js`** — keys + spread of `pageContent` (~1400 lines total)
- **Risk:** Adding a key in both places; later spread order wins silently
- **Unused keys:** `developerPageLabel`, `developerPageVersion` (removed from UI, still in translations)

**Rule:** Page-sized copy → `pageContent.js`. Short labels → `translations.js` only. Grep before adding.

---

## 5. `const isAr = lang === 'ar'` noise

~35 files still declare `isAr` — often **only** for copy that should be `t.*`, or unused after refactor.

Legitimate uses: `dir="rtl"`, arrow direction (`navArrowBack`), date locale.

---

## 6. Cleanup priority (recommended order)

### Phase A — User-facing copy (high visibility)
1. `LoginView.jsx`, `BuyView.jsx`, `ProfileView.jsx`
2. `GameDetail.jsx`, `OfferDetail.jsx`, `Header.jsx`
3. `CartView.jsx`, `CheckoutView.jsx`, `RechargeView.jsx`

### Phase B — Admin
4. `AdminView.jsx` — remove inline game form; i18n only
5. `AdminG2BulkSettings.jsx`, `AdminPaymentsSettings.jsx`
6. Replace last `window.confirm`

### Phase C — Structure
7. Split `App.jsx` (routes + providers)
8. Deduplicate `translations.js` / audit unused keys
9. ESLint rule: warn on `isAr ?` string literals in `src/` (optional)

---

## 7. Commands to re-audit

```powershell
# Inline bilingual strings
rg "isAr \? ['\"]" src --count-matches
rg "t\.\w+ \|\|" src --count-matches

# Large files
Get-ChildItem src -Recurse -Include *.jsx,*.js | Sort-Object Length -Descending | Select -First 15 Name, Length
```