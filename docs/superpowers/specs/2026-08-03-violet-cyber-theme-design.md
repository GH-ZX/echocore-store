# Violet-Magenta Cyber Theme — Design

**Date:** 2026-08-03
**Status:** Approved by user (direction B + C: evolve + full reinvention of surfaces)
**App:** ECHOCORE Store — mobile-first, Arabic-first (RTL), React 19 + Vite + Tailwind v4

## 1. Vision

One flagship theme: **Violet-Magenta Cyber**. Deep violet-black backgrounds, violet/magenta
as the interactive accent family, and **cyan reserved exclusively for prices/links** so the eye
instantly distinguishes "this is a price" from "this is clickable". Rebuilt typography rhythm,
calmer default background, reinvented hero carousel, and fixed RTL/contrast/micro-copy issues.

## 2. Color system

### Dark (flagship)

| Token | Current | New | Purpose |
|---|---|---|---|
| `--bg-primary` | `#040812` | `#07030f` | page base (violet-black) |
| `--bg-surface` | `#0a1329` | `#120b26` | cards |
| `--bg-elevated` | `#111c36` | `#1d1333` | dropdowns, nav |
| `--bg-header` | rgba(6,11,25,.92) | rgba(12,7,26,.92) | header |
| `--accent` | `#22d3ee` | `#a855f7` | CTAs, interactive |
| `--accent-hover` | `#67e8f9` | `#c084fc` | hover |
| `--accent-2` (new) | — | `#e879f9` | magenta gradient partner |
| `--price` (new) | — | `#22d3ee` | **prices only** |
| `--text-primary` | `#f0f4f8` | `#f5f1fb` | body |
| `--text-secondary` | `#a8b4c4` | `#b7aed0` | secondary |
| `--text-muted` | `#6e7d92` | `#8b82a3` | raised contrast |
| `--border` | `#1e293b` | `#2a2142` | violet-tinted borders |
| `--border-strong` | `#334155` | `#3d3159` | strong borders |
| `--gradient-accent` | cyan→blue | violet→magenta (`#a855f7`→`#e879f9`) | primary gradient |

- Voucher purple `#8b5cf6` merges into the accent family (no orphan color).
- Status colors (success/error/warning) stay but rebalanced slightly to fit violet-adjacent palette.
- `--shadow-glow` violet-tinted.

### Light mode

Warm off-white surfaces (`#faf7ff` family), same violet/magenta accent story, cyan for prices.
Light mode contrast rules applied to all components via existing `[data-color-mode='light']` hooks.

## 3. Typography

- Keep **Cairo** as the single font family (Arabic + Latin) to avoid a second font load on mobile.
  - Differentiate via **weight + tracking + size scale**, not a second font.
- Prices/amounts: `--font-mono` tabular numerals with `dir="ltr"` already in place — extend to
  sale cards + purchase panel price line.
- Strip `text-transform: uppercase` + `letter-spacing` from Arabic (`[dir='rtl']`) contexts.
- Micro-copy floor: `text-[10px]` → `text-[11px]`/`12px` on cards; `--text-muted` raised.

## 4. Backgrounds

- **Remove Aurora** (WebGL default) and the weakest/noisy backgrounds.
  - Keep: `starfield`, `circuit`, `hexgrid`, `grid3d*` (opt-in, admin selectable).
  - Default becomes **`starfield`** (calmer, still on-brand) — or `none` for pure solid.
- Film grain opacity stays low. `[data-glows-enabled='false']` unchanged.

## 5. Carousel reinvention

- Hero slide: taller, layered gradient, accent glow behind active slide, cleaner typography.
- Add slide index / progress indicator; keep autoplay + ken-burns (reduced-motion aware).
- Thumbnail strip: active thumb gets violet glow + logo accent line (kept).
- Colors refit to new palette (violet/magenta, cyan reserved for price accents).

## 6. Component updates

- Buttons: primary = violet→magenta gradient (cyan demoted); secondary/ghost refit.
- Prices: `var(--price)` cyan everywhere (SaleOfferCard, OfferPurchasePanel, cart, checkout).
- Sale badge: localize "SALE" via `t` (Arabic: تخفيضات), avoid double-badge redundancy.
- Mobile buy: sticky price+CTA bar visible pre-fold on `/buy`; BuyView panel buttons stay for lg+.
- BorderGlow: keep on sale-offer + home-game cards only (drop uniform glow).
- Bottom nav: refit pill to violet accent.

## 7. Accessibility

- Contrast floors met (text-muted ≥ 4.5:1 on bg-primary).
- Focus-visible rings on icon-only buttons (nav arrows, edit buttons).
- `prefers-reduced-motion` respected (existing infra preserved).

## 8. Non-goals (this pass)

- No new route/pages. No data/schema changes. No i18n string additions beyond SALE badge label.
- Keep light-mode toggle working (refit, not remove).
