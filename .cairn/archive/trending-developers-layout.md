# Trending developer list layout

## Goal

Replace the rejected wide two-column developer list with the approved single-column grouping,
verified in light and dark themes at wide and minimum window sizes.

## Current state

- Working area: `/Users/bytedance/Documents/Work/Code/harbor`.
- The existing trending feature and design-language documentation are uncommitted. Preserve them.
- Implemented the approved vertical author / popular repository / description group at every
  width, 40 px avatars, 16 px vertical padding, naturally wrapping account names, and matching
  skeletons. Same-owner repository labels are abbreviated; actual URLs and accessible full
  names remain intact. `AGENTS.md` and `docs/GITHUB_TRENDING_DEVELOPERS.md` describe the design.
- Playwright screenshots and check scripts are in ignored `output/playwright/`; filenames
  starting `developers-grouped-` show this revision. Public data uses isolated browser IPC;
  native glass and authenticated requests are outside this visual check.

## Next action

None — complete

## Verification

- `pnpm exec vitest run src/features/github/github-trending-developers.interaction.test.tsx src/features/github/github-discovery-view.interaction.test.tsx --maxWorkers=2`
- `pnpm exec eslint src/features/github/github-trending-developers.tsx` and `pnpm build`.
- Playwright: both themes at 900 × 620, 1100 × 760, and 1440 × 900; screenshots inspected for
  grouping, reading width, and hierarchy. Long-name/missing-data fixtures, keyboard links,
  skeletons, profile return, scrolling, and refresh recovery passed. Console: zero errors/warnings.

Success: all 12 focused tests, lint, build, and the listed visual/interaction checks passed.
