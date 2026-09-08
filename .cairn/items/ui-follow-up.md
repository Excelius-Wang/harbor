# Harbor UI follow-up

## Goal

Complete the remaining UI migration and visual/native acceptance recorded in `docs/UI_MIGRATION_CHECKLIST.md`.

## Current state

- Packages action/read recovery was merged through PR [#83](https://github.com/Excelius-Wang/harbor/pull/83) at `74c396b9f5792c9eec850bdd2e6c7b5d3329a526` on 2026-09-07. CodeRabbit reviewed head `e7c6103212e4655d08e8d96ab1a55c098a005b79` with no actionable comments and Minimal risk; all CodeQL checks passed. Its default docstring-coverage warning was recorded as non-blocking in the PR. No release was created.
- Production fixes cover stale detail/empty inventory feedback, mutation reconciliation locks, narrow loading/error Back, scrollable loading skeletons, and long-name/pane-width layout. Stateful fixtures now use production `versionState` and reconcile guarded delete/restore writes. Details and evidence are in `docs/UI_COMPONENTS.md` and the 2026-09-07 section of `docs/UI_VERIFICATION.md`.
- All 112 browser captures are local ignored files under `output/playwright/packages-*`. Playwright CLI headed screenshots timed out; independent headless sessions succeeded. Fixture writes remain local and never reach GitHub.
- Remaining scope starts with Issue lifecycle/comment/candidate states, then nested Discussion replies, archived repository/Pages conditions and release/code transfer feedback. Recent repository/conversation/Project/Gist action browser acceptance and native background/transparency/accessibility acceptance remain unfinished.
- Window-shell PR [#84](https://github.com/Excelius-Wang/harbor/pull/84) was squash-merged at `bc39129d72e733c353ac41edc81e3ecff946ec67` on 2026-09-07. CodeRabbit reviewed final head `bef67a1c0f9dd10eea8eb326602a509a796885af`: all four findings resolved, no new actionable comments, Minimal risk; all CI/CodeQL checks passed. Its default docstring warning remains non-blocking.
- PR #84 delivers fixed 1200 × 760 startup, persistent Logo navigation control and single-border/10 px window edges. Selected screenshots are in `docs/verification/window-shell/README.md`. Final native Logo accessibility activation and broader native material acceptance remain unverified.
- PR #84's remote and local `feat/window-navigation-toggle` branches were deleted after synchronizing `main`. The user-authorized removal of permanently disabled title-bar history arrows is included in the Repolane delivery on `feat/repolane-lane-identity`; use the selected brand checkpoint and GitHub for its current submission status. The prior branch remains preserved.
- The next Issue migration batch has not started.
- `AGENTS.md` and `docs/UI_DESIGN_GUIDE.md` remain the design authority. Third-party originals stay in the local ignored reference cache.

## Next action

Resume Issue lifecycle/comment/candidate-state acceptance from docs/UI_MIGRATION_CHECKLIST.md; titlebar delivery is tracked by the selected brand item.

## Verification

History-arrow removal: existing MainTitleBar interaction tests pass (3 tests), and targeted Prettier/ESLint checks pass. Diff review confirms only the two disabled buttons/tooltips and their unused icon imports were removed.

Latest PR #84 review-fix `pnpm check`: 611 tests/127 files, formatting, lint, TypeScript and Vite build pass (`/tmp/harbor-pr84-review-check.log`). Four Rust geometry tests and cargo check passed for the startup-size change. Existing rail hook and chunk-size warnings remain.

Window/navigation: 12 browser language/theme/size combinations pass; native 1200 × 760 sizing and the original toggle were verified, and final Logo behavior was browser-verified. Edge refinement: 12 before/after theme/size/background comparisons, reduced-transparency checks and native dark active/inactive self-review pass. See the latest sections of `docs/UI_VERIFICATION.md` for exact artifacts and native scope limits.

Packages PR #83 is merged; its 112-capture acceptance remains recorded separately. Success: PR #84 is merged, its final-head review and CI passed, and its local/remote branches are cleaned up. GitHub records the authoritative merge and review outcome. The overall UI migration and broader native material acceptance remain open.
