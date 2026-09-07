# Language picker style

## Goal

Make the trending language picker match Harbor's compact, restrained overlay design while
preserving search, keyboard selection, and the existing filters.

## Current state

- Working area: `/Users/bytedance/Documents/Work/Code/harbor`; existing changes are uncommitted.
- Scoped `harbor-filter-trigger` and `harbor-filter-menu` styles now use 13 px regular text,
  28 px rows, a 240 px menu, a transparent inner Command, quiet scrollbar, and single chevron.
- Localized unknown-language labels also support localized search. Global UI primitives and
  filter behavior remain intact. `AGENTS.md` documents the reusable picker styling.
- Screenshots and measurements live in ignored `output/playwright/language-picker-*` and
  `output/playwright/picker-style-verification.json`.
- Playwright is authorized. Use a separate QA server on port 1425; the user's server may use 1420.

## Next action

None — complete

## Verification

- Existing discovery/trending interaction tests: 13 passed across two files (`--maxWorkers=2`).
- Targeted Prettier/ESLint, frontend production build, and `git diff --check` passed.
- Playwright: both themes, 1440 × 900 and 900 × 620. Measured 240 px menu width, 13 px/400 text,
  28 px rows, transparent inner surface, and no clipped menu bounds.
- Localized search, arrow-key selection, current-selection indicator, Escape focus return,
  empty searches, and scrolling through the catalog passed. Screenshots visually inspected.

Success: the requested style revision is implemented and verified with the menu open in both themes.
