# Per-Slide Carousel Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins set a per-slide carousel badge (AR + EN text) and hide it by clearing both fields, replacing the hardcoded "Featured" badge.

**Architecture:** Badge text is stored on the `games` table as two nullable columns (`carousel_badge_en`, `carousel_badge_ar`). A pure helper `resolveCarouselBadge(item, lang)` computes the displayed badge (language-aware, empty → hidden), used by both the carousel renderer and unit tests. `HomeView` forwards the fields into carousel items; `AdminGameEditModal` edits them through the existing `onSave` → `updateGame` path.

**Tech Stack:** React 19, Vite, Vitest, Supabase, Tailwind v4, lucide-react.

## Global Constraints

- No inline `isAr ? '…' : '…'` — use `t.key` / existing helpers (AGENTS.md).
- New UI strings must be added in BOTH `ar` and `en` in `translations.js`.
- Empty badge fields = badge hidden (no fallback to "Featured").
- AR view prefers `carousel_badge_ar`, falls back to `carousel_badge_en`; EN view the reverse.
- Live DB columns already added by the user; `supabase_echocore_full.sql` is the schema source of truth and must be updated to match.
- `npm run build`, `npm run lint`, `npm test` must stay green.

---

### Task 1: Add `resolveCarouselBadge` helper with tests

**Files:**
- Modify: `src/lib/carouselUtils.js`
- Test: `src/lib/carouselUtils.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolveCarouselBadge(item = {}, lang = 'en')` → string. `item.carousel_badge_en` / `item.carousel_badge_ar` may be null/undefined/''. Returns `''` when no usable text. For `lang === 'ar'` returns `badge_ar || badge_en || ''`, else `badge_en || badge_ar || ''`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/carouselUtils.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveCarouselBadge } from './carouselUtils';

describe('resolveCarouselBadge', () => {
  it('shows EN badge in EN view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: 'HOT', carousel_badge_ar: 'ساخن' }, 'en')).toBe('HOT');
  });

  it('shows AR badge in AR view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: 'HOT', carousel_badge_ar: 'ساخن' }, 'ar')).toBe('ساخن');
  });

  it('falls back to EN badge when AR empty in AR view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: 'HOT', carousel_badge_ar: null }, 'ar')).toBe('HOT');
  });

  it('falls back to AR badge when EN empty in EN view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: '', carousel_badge_ar: 'ساخن' }, 'en')).toBe('ساخن');
  });

  it('returns empty string when both badges empty (hidden state)', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: null, carousel_badge_ar: '' }, 'en')).toBe('');
    expect(resolveCarouselBadge({}, 'ar')).toBe('');
    expect(resolveCarouselBadge(null, 'en')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/carouselUtils.test.js`
Expected: FAIL with `resolveCarouselBadge is not a function` / "Cannot find name".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/carouselUtils.js`:

```js
export function resolveCarouselBadge(item = {}, lang = 'en') {
  if (!item) return '';
  const en = String(item.carousel_badge_en || '').trim();
  const ar = String(item.carousel_badge_ar || '').trim();
  if (lang === 'ar') return ar || en;
  return en || ar;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/carouselUtils.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/carouselUtils.js src/lib/carouselUtils.test.js
git commit -m "feat: resolveCarouselBadge helper for per-slide carousel badge"
```

---

### Task 2: Render per-slide badge in the carousel

**Files:**
- Modify: `src/views/home/ProductCarousel.jsx:274` (badge span)
- Modify: `src/views/home/HomeView.jsx:215-230` (carouselItems map)
- Test: `src/lib/carouselUtils.test.js` (no change — helper already tested)

**Interfaces:**
- Consumes: `resolveCarouselBadge` from Task 1.
- Produces: carousel items carrying `carousel_badge_en` / `carousel_badge_ar`.

- [ ] **Step 1: Forward badge fields in HomeView**

In `src/views/home/HomeView.jsx`, inside the `carouselItems` map (`return {` block at line ~217), add:

```js
carousel_badge_en: g.carousel_badge_en || null,
carousel_badge_ar: g.carousel_badge_ar || null,
```

- [ ] **Step 2: Conditionally render badge in ProductCarousel**

Add the import to the imports section at the top of `ProductCarousel.jsx`:

```js
import { resolveCarouselBadge } from '../../lib/carouselUtils';
```

Then replace the always-rendered badge block (currently lines ~259-275) with a conditional render. Keep the exact same badge styling. Change:

```jsx
<div
  className={`inline-flex items-center gap-1.5 mb-3 rounded-full border px-3 py-1 text-[10px] sm:text-[11px] font-bold tracking-wide ${
    lang === 'ar' ? 'text-right' : 'text-left'
  }`}
  style={{
    color: '#e879f9',
    borderColor: 'color-mix(in srgb, #e879f9 35%, transparent)',
    background: 'rgba(232, 121, 249, 0.08)',
  }}
>
  <span
    className="inline-block w-1.5 h-1.5 rounded-full"
    style={{ background: 'linear-gradient(135deg, #a855f7, #e879f9)' }}
    aria-hidden="true"
  />
  {t.carouselFeaturedBadge || (lang === 'ar' ? 'مميز' : 'Featured')}
</div>
```

to:

```jsx
{(() => {
  const badgeText = resolveCarouselBadge(item, lang);
  if (!badgeText) return null;
  return (
    <div
      className={`inline-flex items-center gap-1.5 mb-3 rounded-full border px-3 py-1 text-[10px] sm:text-[11px] font-bold tracking-wide ${
        lang === 'ar' ? 'text-right' : 'text-left'
      }`}
      style={{
        color: '#e879f9',
        borderColor: 'color-mix(in srgb, #e879f9 35%, transparent)',
        background: 'rgba(232, 121, 249, 0.08)',
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: 'linear-gradient(135deg, #a855f7, #e879f9)' }}
        aria-hidden="true"
      />
      {badgeText}
    </div>
  );
})()}
```

Note: this leaves `t.carouselFeaturedBadge` unused in `ProductCarousel.jsx`. Do NOT delete the key from `translations.js` — it remains valid (see Task 5). If lint flags the now-unused `t` usage, it won't — `t` is used elsewhere in the file.

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual sanity check (dev server)**

Run: `npm run dev`, open the homepage. Confirm:
- Slides with no badge fields show no badge.
- After setting badge text via Task 4, the badge shows per-language.

- [ ] **Step 5: Commit**

```bash
git add src/views/home/ProductCarousel.jsx src/views/home/HomeView.jsx
git commit -m "feat: render per-slide carousel badge from game fields"
```

---

### Task 3: Add carousel badge translation keys

**Files:**
- Modify: `src/data/translations.js` (ar block near line ~1421, en block near line ~3762)

**Interfaces:**
- Produces: `t.carouselBadgeSection`, `t.carouselBadgeEnglish`, `t.carouselBadgeArabic`, `t.carouselBadgeHide`.

- [ ] **Step 1: Add AR keys**

In the `ar` object, adjacent to `carouselFeaturedBadge` (line ~1421), add:

```js
carouselBadgeSection: "شارة الكاروسيل",
carouselBadgeEnglish: "الشارة (إنجليزي)",
carouselBadgeArabic: "الشارة (عربي)",
carouselBadgeHide: "إخفاء الشارة",
```

- [ ] **Step 2: Add EN keys**

In the `en` object, adjacent to `carouselFeaturedBadge` (line ~3762), add:

```js
carouselBadgeSection: "Carousel badge",
carouselBadgeEnglish: "Badge (English)",
carouselBadgeArabic: "Badge (Arabic)",
carouselBadgeHide: "Hide badge",
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: no errors. Confirm both blocks have matching keys.

- [ ] **Step 4: Commit**

```bash
git add src/data/translations.js
git commit -m "feat(i18n): carousel badge edit labels (ar + en)"
```

---

### Task 4: Edit badge in AdminGameEditModal

**Files:**
- Modify: `src/components/admin/AdminGameEditModal.jsx`

**Interfaces:**
- Consumes: `t.carouselBadgeSection`, `t.carouselBadgeEnglish`, `t.carouselBadgeArabic`, `t.carouselBadgeHide` from Task 3.
- Produces: `onSave` payload with `carousel_badge_en` / `carousel_badge_ar` (consumed by `updateGame` in Task 5).

- [ ] **Step 1: Extend form state**

In the `useState({...})` initial form (line ~28-40), add:

```js
carousel_badge_en: '',
carousel_badge_ar: '',
```

- [ ] **Step 2: Seed form for existing games**

In the `isNew` branch of the `useEffect` that resets the form (line ~76-89), add to the object:

```js
carousel_badge_en: '',
carousel_badge_ar: '',
```

In the `else` branch (line ~90-103), add:

```js
carousel_badge_en: game.carousel_badge_en || '',
carousel_badge_ar: game.carousel_badge_ar || '',
```

- [ ] **Step 3: Include fields in submit payload**

In `handleSubmit`'s `onSave({...})` object (line ~174-192), add:

```js
carousel_badge_en: form.carousel_badge_en?.trim() || null,
carousel_badge_ar: form.carousel_badge_ar?.trim() || null,
```

- [ ] **Step 4: Add the badge UI section**

Insert a new section in the form markup, directly after the "Redemption method" block (which ends at line ~286) and before the "Catalog game code" block (line ~288). Add:

```jsx
<div>
  <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">
    {t.carouselBadgeSection}
  </label>
  <input
    placeholder={t.carouselBadgeEnglish}
    value={form.carousel_badge_en}
    onChange={(e) => setForm({ ...form, carousel_badge_en: e.target.value })}
    className="input"
  />
  <input
    placeholder={t.carouselBadgeArabic}
    value={form.carousel_badge_ar}
    onChange={(e) => setForm({ ...form, carousel_badge_ar: e.target.value })}
    className="input mt-2"
  />
  <button
    type="button"
    onClick={() => setForm((prev) => ({ ...prev, carousel_badge_en: '', carousel_badge_ar: '' }))}
    className="btn btn-secondary text-sm mt-2 inline-flex items-center gap-1.5"
  >
    <EyeOff className="w-3.5 h-3.5" />
    {t.carouselBadgeHide}
  </button>
</div>
```

Add `EyeOff` to the existing lucide import at line 2:

```js
import { X, Percent, Lock, RefreshCw, Loader2, EyeOff } from 'lucide-react';
```

- [ ] **Step 5: Verify**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/AdminGameEditModal.jsx
git commit -m "feat(admin): edit and hide carousel badge per game"
```

---

### Task 5: Persist badge fields in updateGame

**Files:**
- Modify: `src/App.jsx:1264-1282` (updateGame patch)

**Interfaces:**
- Consumes: `carousel_badge_en` / `carousel_badge_ar` from the AdminGameEditModal `onSave` payload (Task 4).
- Produces: rows with `carousel_badge_en` / `carousel_badge_ar` persisted in the `games` table (flows to HomeView/Task 2).

- [ ] **Step 1: Add badge fields to the patch**

In `updateGame` (line ~1268-1282), inside the `patch` object, add after the `carousel_focus_y` line:

```js
carousel_badge_en: payload.carousel_badge_en || null,
carousel_badge_ar: payload.carousel_badge_ar || null,
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: persist carousel badge fields in updateGame"
```

---

### Task 6: Update schema file + full verification

**Files:**
- Modify: `supabase_echocore_full.sql:79-82` (games table columns)

**Interfaces:**
- Consumes: nothing.
- Produces: schema parity for fresh DB builds.

- [ ] **Step 1: Add columns to the games table**

In `supabase_echocore_full.sql`, in the `CREATE TABLE public.games` block, after the `show_in_carousel` line (line ~82), add:

```sql
carousel_badge_en text,                 -- Per-slide carousel badge (EN)
carousel_badge_ar text,                 -- Per-slide carousel badge (AR)
```

- [ ] **Step 2: Full verification**

Run:

```bash
npm run build && npm run lint && npm test
```

Expected: build ✓, lint 0 errors, all 74+ existing tests pass (plus the 5 new carouselUtils tests → 79 total).

- [ ] **Step 3: Commit**

```bash
git add supabase_echocore_full.sql
git commit -m "chore(schema): add carousel_badge_en/ar to games table"
```
