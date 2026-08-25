# DOCMAN design QA

Side-by-side review of dark vs light across every screen built so far. Live captures were not available in this pass; this checklist is from token math, layout code, and a theme-by-theme walk of each surface.

Motion tokens used everywhere below: `--duration-fast` (180ms, hover/press), `--duration-med` (300ms, theme / modal / page), `--ease-sv` (cubic-bezier(0.2, 0.8, 0.2, 1)).

---

## Login

| Check | Dark | Light | Notes |
|---|---|---|---|
| Split hero vs card | Pass | Pass | Hero from `lg` (1024px); card is the screen below |
| Gradient headline | Pass | Pass | Uses `--accent-primary` → `--accent-2` |
| Feature cards | Pass | Pass | Surface on `--bg-base`; light cards lift off grey |
| Department chips | Pass | Pass | Module dots use theme-tuned `--mod-*` |
| Scan bar on submit | Pass | Pass | Token gradient; `motion-reduce` disables it |
| Remaining | — | Minor | Ambient accent blobs are stronger in dark (intentional). Tablet chips omit Railway/NPD/Other to save space |

## Dashboard (module grid)

| Check | Dark | Light | Notes |
|---|---|---|---|
| Card radius | Pass | Pass | `--sv-radius` (12px) on cards, skeletons, empty/error |
| Icon badge tint | Pass | Pass | `color-mix(16%)` of module accent |
| Module accent as icon | Pass | Pass | Light accents are 700-level (Engineering `#854d0e` was the former AA fail) |
| Skeleton shimmer | Pass | Pass | Elevated + accent-ink sheen, not generic grey |
| Empty / error | Pass | Pass | Calm surface, not a red screen |
| Remaining | — | Watch | Hover corner glow is tuned for dark; it is quieter on white (still visible) |

## Module page

| Check | Dark | Light | Notes |
|---|---|---|---|
| Hero pattern | Pass | Pass | SVG primitives; opacity 24% / 40%, stroke 0.75 / 1.05px, glow 26% / 17% |
| Breadcrumb | Pass | Pass | Muted → primary; 44px hit on mobile |
| Subfolder cards | Pass | Pass | Same radius as dashboard cards |
| Subfolder skeletons | Pass | Pass | Match card shape (icon + two lines) |
| Remaining | — | Watch | `--mod-other` glow is quieter than saturated modules; the dot-grid carries identity |

## File retrieve modal

| Check | Dark | Light | Notes |
|---|---|---|---|
| Dialog chrome | Pass | Pass | Surface + `shadow-modal` |
| Paper preview | Pass | Pass | `#F7F3EA` + border + ring so it still reads on white |
| Not-found card | Pass | Pass | Danger at 10% fill, not a full-bleed red |
| Scan bar | Pass | Pass | Module accent via `--fm-accent` |
| Remaining | — | None blocking | Close control is 44px on mobile, 32px from `sm` |

## Admin — people table

| Check | Dark | Light | Notes |
|---|---|---|---|
| Header row | Pass | Pass | `--bg-elevated` / `--text-secondary` |
| Row hover | Pass | Pass | `surface-2/60` — visible on both |
| Role badge | Pass | Pass | Accent ink on tinted fill |
| Status dot | Pass | Pass | Success ink vs faint |
| Skeletons | Pass | Pass | Avatar + text bars in real columns |
| Remaining | — | Minor | Action labels wrap on narrow tablets; min-width 640px + scroll is intentional |

## Admin — rights matrix

| Check | Dark | Light | Notes |
|---|---|---|---|
| Sticky person column | Pass | Pass | Surface fill so rows don’t show through |
| Module accent dots | Pass | Pass | 700-level on light |
| Scroll affordance | Pass | Pass | Edge fades use `--bg-surface` (light-specific overlay opacity) |
| Checkbox 44px hit | Pass | Pass | Visual box stays 16px |
| Remaining | — | Watch | Sticky header `bg-sv-surface-2` vs sticky cell `bg-sv-surface` is a 1-step luminance difference — keep it; don’t match them or the freeze reads as a hole |

## Chrome (header, theme toggle, toasts)

| Check | Dark | Light | Notes |
|---|---|---|---|
| Theme toggle | Pass | Pass | `duration-med` + `theme-switching` class on `<html>` so surfaces/borders/text interpolate |
| Header search | Pass | Pass | Collapses to icon &lt;640px |
| Toasts | Pass | Pass | `surface-2` + `shadow-modal`; success/danger use ink tokens |
| Page transition `/` ↔ `/m/:id` | Pass | Pass | Fade+8px slide, 300ms, reduced-motion off |
| Remaining | — | Watch | SVG icons don’t interpolate fill during theme switch (excluded to avoid muddy paths). They snap; surfaces do not |

---

## Open items (non-blocking)

1. **In-folder file table** (not the dashboard) still uses slightly tighter `md` paddings than module cards — keep, it is a list not a card grid.
2. **Profile menu** custom `w-[min(320px,…)]` is fine; it does not use `--sv-radius` on the inner avatar (full circle by design).
3. **Paper tokens** are theme-constant on purpose. Do not “invert” them for dark chrome.
4. **No screenshot files** were written; re-run this checklist with dark/light captures of login, `/`, `/m/:id`, file modal, `/admin/users`, `/admin/rights` before a release sign-off.
