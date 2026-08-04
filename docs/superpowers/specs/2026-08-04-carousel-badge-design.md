# Per-Slide Carousel Badge — Design

Date: 2026-08-04
Status: Approved

## Problem

Every carousel slide hardcodes a "Featured" / "مميز" badge (`ProductCarousel.jsx:274`). Admins cannot change the badge text per slide, and cannot hide it.

## Goals

- Badge text editable per slide (per-language, matching how names/descriptions already work).
- Badge can be hidden per slide.
- "Empty badge" = hidden badge (clear the field = hide it).
- No new translation strings.

## Data model

Add two nullable `text` columns to the `games` table:

- `carousel_badge_en`
- `carousel_badge_ar`

Update `supabase_echocore_full.sql` with the new columns.

**Live DB migration** (run in Supabase SQL Editor):

```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS carousel_badge_en text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS carousel_badge_ar text;
```

## Display rule (`ProductCarousel.jsx`)

Replace the hardcoded fallback badge at line ~274 with:

- AR view: `item.carousel_badge_ar || item.carousel_badge_en`
- EN view: `item.carousel_badge_en || item.carousel_badge_ar`
- Both empty → render no badge at all (hidden state).

## Data flow

1. `HomeView.carouselItems` (HomeView.jsx:215) already maps each game — add `carousel_badge_en` / `carousel_badge_ar` passthrough from the game row.
2. `ProductCarousel` reads the two fields from the item.

## Editing (`AdminGameEditModal`)

Add a "Carousel badge" section in the form:

- Text input: badge (English) → `form.carousel_badge_en`
- Text input: badge (Arabic) → `form.carousel_badge_ar`
- Button: **Hide badge** → clears both badge fields in the form.
- Both fields flow through the existing `onSave` → `updateGame` path in `App.jsx`.

### `updateGame` (App.jsx:1264)

Add the two fields to the patch object so they persist to Supabase:

- `carousel_badge_en: payload.carousel_badge_en || null`
- `carousel_badge_ar: payload.carousel_badge_ar || null`

### Form init (`AdminGameEditModal`)

- Existing game: seed from `game.carousel_badge_en` / `game.carousel_badge_ar`.
- New game (unused today): empty strings.

## Behavior notes

- Existing slides have no badge text → after this change, no badge shows until an admin sets one. This matches "empty = hidden".
- New UI strings follow AGENTS.md convention (add both ar + en in `translations.js`):
  - `carouselBadgeSection` — "Carousel badge" / "شارة الكاروسيل"
  - `carouselBadgeEnglish` — "Badge (English)" / "الشارة (إنجليزي)"
  - `carouselBadgeArabic` — "Badge (Arabic)" / "الشارة (عربي)"
  - `carouselBadgeHide` — "Hide badge" / "إخفاء الشارة"

## Out of scope

- Badge styling/colors (kept as-is).
- Global default badge setting.
- Badge on non-game carousel items (none exist today).
