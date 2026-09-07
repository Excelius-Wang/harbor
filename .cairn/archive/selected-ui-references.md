# Selected Harbor UI references

> Historical snapshot: delivery and uncommitted-work statements below describe the
> checkpoint when it was recorded, not the current branch. These records were included
> in [PR #84](https://github.com/Excelius-Wang/harbor/pull/84); see the
> [current checkpoint](../items/ui-follow-up.md) for live delivery status.

## Goal

Record the user's selected sidebar image 4, Harbor cool blue-gray palette, LeonAnd page
reference, and shared-navigation reuse rule in the guide, AGENTS.md, and reference board.

## Current state

- Working area: `repository root`.
- AGENTS.md and docs/UI_DESIGN_GUIDE.md now fix reference roles: sidebar image 4 for structure,
  Harbor cool blue-gray for color, LeonAnd for whole-page surfaces, and shared navigation for
  selection and row height. Generic blue navigation selection guidance was removed.
- Selected images are stored unchanged in docs/design/references/sidebar-04.webp and
  leonand-workspace.webp, with provenance and hashes. The reference board includes both.
- Guide records the existing PrimaryNavigation / NavigationButton implementation location,
  h-10 rows, and the need to extract from that implementation if separate reuse is required.
- Application code was not changed; prior uncommitted work remains intact. No commit created.

## Next action

None — complete

## Verification

- `pnpm exec prettier --check AGENTS.md docs/UI_DESIGN_GUIDE.md docs/design/references/README.md docs/design/reference-board.html` and `git diff --check`.
- Link, palette, image identity and source-hash checks recorded in
  `output/playwright/selected-ui-references/checks.txt` (local QA).
- Playwright rendered the board at 1440 px and 390 px; wide.png and narrow.png in that QA
  directory were inspected. All four images loaded and neither viewport had horizontal overflow.

Success: formatting and whitespace checks passed; 30 local links resolved, 32 palette entries
matched, four image hashes matched, both selected images preserved byte-for-byte, and 506
application files remained unchanged. Chinese copy was reviewed after drafting.
