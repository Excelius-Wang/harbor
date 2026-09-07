# Harbor UI follow-up

## Goal

Complete the remaining UI migration and visual/native acceptance recorded in `docs/UI_MIGRATION_CHECKLIST.md`.

## Current state

- Packages action/read recovery was merged through PR [#83](https://github.com/Excelius-Wang/harbor/pull/83) at `74c396b9f5792c9eec850bdd2e6c7b5d3329a526` on 2026-09-07. CodeRabbit reviewed head `e7c6103212e4655d08e8d96ab1a55c098a005b79` with no actionable comments and Minimal risk; all CodeQL checks passed. Its default docstring-coverage warning was recorded as non-blocking in the PR. No release was created.
- Production fixes cover stale detail/empty inventory feedback, mutation reconciliation locks, narrow loading/error Back, scrollable loading skeletons, and long-name/pane-width layout. Stateful fixtures now use production `versionState` and reconcile guarded delete/restore writes. Details and evidence are in `docs/UI_COMPONENTS.md` and the 2026-09-07 section of `docs/UI_VERIFICATION.md`.
- All 112 browser captures are local ignored files under `output/playwright/packages-*`. Playwright CLI headed screenshots timed out; independent headless sessions succeeded. Fixture writes remain local and never reach GitHub.
- Remaining scope starts with Issue lifecycle/comment/candidate states, then nested Discussion replies, archived repository/Pages conditions and release/code transfer feedback. Recent repository/conversation/Project/Gist action browser acceptance and native background/transparency/accessibility acceptance remain unfinished.
- Current delivery is PR [#84](https://github.com/Excelius-Wang/harbor/pull/84) on the existing `feat/window-navigation-toggle` branch, based on `74c396b`. All window-shell changes, branch-policy documentation and previously local Cairn archives are committed and pushed. The user approved the visual result and requested PR submission/review; no additional branch should be created.
- PR #84 contains fixed 1200 × 760 startup, the Logo navigation toggle and single-border/10 px window edges. Selected screenshots are in `docs/verification/window-shell/README.md`. GitHub PR comments/checks are authoritative for current CodeRabbit and CI results.
- A first Git push timed out; retry succeeded without changing remotes or creating another branch. The next Issue migration batch has not started.
- `AGENTS.md` and `docs/UI_DESIGN_GUIDE.md` remain the design authority. Third-party originals stay in the local ignored reference cache.

## Next action

For PR #84, address any remaining valid review findings on the same branch; after merge authorization, recheck final-head review/CI, merge and clean up the PR branches.

## Verification

Latest window-shell `pnpm check`: 610 tests/127 files, formatting, lint, TypeScript and Vite build pass (`/tmp/harbor-window-edge-check.log`). Four Rust geometry tests and cargo check passed for the startup-size change. Existing rail hook and chunk-size warnings remain.

Window/navigation: 12 browser language/theme/size combinations pass; native 1200 × 760 sizing and the original toggle were verified, and final Logo behavior was browser-verified. Edge refinement: 12 before/after theme/size/background comparisons, reduced-transparency checks and native dark active/inactive self-review pass. See the latest sections of `docs/UI_VERIFICATION.md` for exact artifacts and native scope limits.

Packages PR #83 is merged; its 112-capture acceptance remains recorded separately. The user-approved window-shell result and all current checkpoint/archive updates are submitted in PR #84. Review and CI conclusions are recorded on that PR. The overall UI migration and broader native material acceptance remain open.
