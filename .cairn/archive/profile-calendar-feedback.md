# Profile calendar feedback

## Goal
Add one-shot calendar entrance, month navigation transitions and hover/focus detail; improve activity readability. No image zoom; README remains fully expanded.

## Current state
Implemented and verified on the existing uncommitted profile delivery branch `feat/profile-readme-layout`. No commit, PR or merge performed for this batch. Preserve prior README implementation and unrelated Cairn archives. No new dependency or Rust change in this follow-up.
Evidence: `docs/verification/profile-feedback/README.md`. Real contribution/public-event snapshots with synthetic identity metadata passed 8 browser combinations, 4 query states, keyboard/hover/reduced-motion and color-background checks. Calendar weekday labels stay outside horizontal scrolling; zero level has stable fill. Temporary preview server/browser sessions closed.

## Next action
None — complete

## Verification
`VITEST_MAX_WORKERS=1 pnpm check`; documented Playwright matrix/state scripts. Final local log `/tmp/harbor-feedback-complete-check.log`.
Success: 676 tests in 139 files, format/lint/build passed. Existing hook and chunk-size warnings remain. No new native-translucency or live-write acceptance claimed.
