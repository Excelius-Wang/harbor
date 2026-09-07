# Harbor UI follow-up

## Goal

Complete the remaining UI migration and visual/native acceptance recorded in `docs/UI_MIGRATION_CHECKLIST.md`.

## Current state

- Packages action/read recovery is complete locally on `fix/packages-action-states`, based on phase-one merge `39f2a9e` (PR #82). User authorized PR creation, actual CodeRabbit review/fixes, and merge once checks pass. Preparing the Packages commit; no release is requested.
- Production fixes cover stale detail/empty inventory feedback, mutation reconciliation locks, narrow loading/error Back, scrollable loading skeletons, and long-name/pane-width layout. Stateful fixtures now use production `versionState` and reconcile guarded delete/restore writes. Details and evidence are in `docs/UI_COMPONENTS.md` and the 2026-09-07 section of `docs/UI_VERIFICATION.md`.
- All 112 browser captures are local ignored files under `output/playwright/packages-*`. Playwright CLI headed screenshots timed out; independent headless sessions succeeded. Fixture writes remain local and never reach GitHub.
- Remaining scope starts with Issue lifecycle/comment/candidate states, then nested Discussion replies, archived repository/Pages conditions and release/code transfer feedback. Recent repository/conversation/Project/Gist action browser acceptance and native background/transparency/accessibility acceptance remain unfinished.
- Preserve pre-existing Cairn archive/routing changes, including the removed `.cairn/items/ui-unification.md` and its archived copy. The prior session completed authorized remote branch cleanup; its receipt/recovery SHAs remain in the separate handoff. Remote state was not re-queried in this local batch.
- `AGENTS.md` and `docs/UI_DESIGN_GUIDE.md` remain the design authority. Third-party originals stay in the local ignored reference cache.

## Next action

Create the Packages PR, address actual CodeRabbit feedback, and merge after final-head review and checks pass.

## Verification

`pnpm check`: 608 tests/127 files, formatting, lint, TypeScript and Vite build pass; log `/tmp/harbor-packages-final-check.log`. Existing Harbor rail hook and chunk-size warnings remain. No Rust/native changes were made.

Playwright CLI: success/keyboard matrix (8 combinations), mutation-state matrix (64 cases), read/layout/scroll matrix (20 cases), filter/cache return (4 cases) pass. Scripts and 112 captures are in `output/playwright/`; exact log paths and scope are in `docs/UI_VERIFICATION.md`.

Success: Packages batch implementation and controlled browser acceptance are complete. The overall UI follow-up remains open.
