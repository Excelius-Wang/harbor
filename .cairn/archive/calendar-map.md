# Calendar map companion

## Goal
Integrate the approved B pixel traveler with C motion directly into contribution dates, replacing the independent stage and retaining accessible date reading and real-only levels.

## Current state
Complete on existing uncommitted feat/profile-readme-layout delivery. Grid portal, small year/full month sprite boxes, original RGBA frame atlas, compact badge Popover and deterministic encounters are implemented. Previous profile changes and unrelated archives preserved. No commit, push, PR or merge. Durable evidence and full image prompts: docs/verification/calendar-map/README.md and ASSET.md. Two opaque checkerboard generations were rejected; the final built-in background-removal call produced verified RGBA alpha. One HMR-interrupted browser run was discarded; stable final run passed.

## Next action
None — complete

## Verification
VITEST_MAX_WORKERS=1 pnpm check passed 684 tests in 140 files, format/lint/type/build. Final eight browser combinations (English/Chinese, light/dark, 900/1440) passed with 0 px selected-date x/y alignment error and no page errors. Additional long-profile Bug/chest, scroll, resize, rapid replacement, manual/in-flight/background/offscreen pause, outside dismissal and reduced motion passed. Existing hook and bundle-size warnings remain nonblocking. No Rust changes this iteration; no new native translucency acceptance claim.
Success: Approved calendar-map interaction implemented and verified, 2026-09-11.
