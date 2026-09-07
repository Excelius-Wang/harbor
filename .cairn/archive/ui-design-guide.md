# Harbor UI design guide

> Historical snapshot: delivery and uncommitted-work statements below describe the
> checkpoint when it was recorded, not the current branch. These records were included
> in [PR #84](https://github.com/Excelius-Wang/harbor/pull/84); see the
> [current checkpoint](../items/ui-follow-up.md) for live delivery status.

## Goal

Extract the user-selected glass UI references into a durable Harbor design guide, including
color roles, both theme palettes, original reference images, and an AGENTS.md entry point.

## Current state

- Working area: `repository root`.
- `docs/UI_DESIGN_GUIDE.md` records the selected glass direction, candidate dark/light palettes,
  material hierarchy, Harbor mappings, and verification criteria.
- `docs/design/reference-board.html` displays both references and 32 candidate color swatches.
  Original images and provenance are stored in `docs/design/references/`.
- AGENTS.md links the guide and separates target direction from existing implementation;
  historical UI documents point to the new guide.
- Only documentation and reference assets changed in this outcome. Application files remain
  unchanged; prior uncommitted feature work is preserved. No commit was created.
- Style direction is selected; numerical candidates are not validated production tokens.

## Next action

None — complete

## Verification

- `pnpm exec prettier --check AGENTS.md docs/UI_DESIGN_GUIDE.md docs/design/references/README.md docs/design/reference-board.html docs/UI_SPEC.md`.
- `git diff --check`.
- Local link, palette, image identity, and source hash checks; Playwright inspection at 1440 px
  and 390 px. Details and screenshots: `output/playwright/ui-design-guide/review.md` (local QA).

Success: formatting and whitespace checks passed; 20 local links resolved; 32 swatches matched
the guide; two source images were preserved byte-for-byte; 506 application files were unchanged.
Reference board rendered without horizontal overflow at both widths. Chinese copy was reviewed
after drafting. App runtime tests were unnecessary for this documentation-only outcome.
