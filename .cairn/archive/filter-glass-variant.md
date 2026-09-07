# Filter glass variant

> Historical snapshot: delivery and uncommitted-work statements below describe the
> checkpoint when it was recorded, not the current branch. These records were included
> in [PR #84](https://github.com/Excelius-Wang/harbor/pull/84); see the
> [current checkpoint](../items/ui-follow-up.md) for live delivery status.

## Goal

Implement one lighter, more translucent language-menu variant for the user's visual review.

## Current state

- Working area: `repository root`; preserve existing uncommitted work.
- User explicitly authorized a version after discussing the overly dark menu. Keep its compact
  layout and change the fill, transparency, border, and shadow.
- Implemented one scoped menu variant in `src/index.css`: a foreground/background-derived
  cool-gray tint at 58% opacity in dark mode, a 62% card tint in light mode, 24 px blur, and a
  softer 8 px / 24 px shadow. Other elevated surfaces retain their existing tokens.
- Captured the before/after menu on the same page at 900 × 620. Images:
  `output/playwright/language-glass-before-dark.png`, `language-glass-after-dark.png`, and
  `language-glass-after-light.png`. This is a reviewable variant, not a global palette change.
- Visual QA uses a separate server on port 1425; do not stop the user's server on port 1420.

## Next action

None — complete

## Verification

- `pnpm exec prettier --check src/index.css`, `pnpm build`, and `git diff --check`: passed.
- Both theme screenshots inspected. Computed dark fill opacity changed from 0.76 to 0.58,
  blur from 34 px to 24 px, shadow from 22 px / 58 px at 0.56 alpha to 8 px / 24 px at 0.2352.
- Browser inspection verified the CSS material. Native macOS compositing is outside this preview.

Success: one lighter, more translucent variant is implemented and ready for the user's review.
