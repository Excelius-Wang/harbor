# Calendar map review

## Goal
Review the latest calendar-map changes, fix confirmed defects, and verify regressions.

## Current state
Complete on uncommitted feat/profile-readme-layout. Standards/spec review and parent browser reproduction confirmed four distinct defects, all fixed: same-width rolling-year positioning, initial ResizeObserver reversing leftward facing, selected-tooltip blocking hover details, and Sunday sprites overlapping month labels. Three regression tests failed before fixes and now pass. Findings and evidence: docs/verification/calendar-review/README.md. Prior work/archives preserved. No commit, push, PR or merge.

## Next action
None — complete

## Verification
15 focused tests pass; VITEST_MAX_WORKERS=1 pnpm check passes 687 tests in 140 files and format/lint/type/build. Eight EN/ZH × light/dark × 900/1440 browser cases pass with no page errors, correct facing/hover/focus/Escape/menu/reduced-motion behavior and 1.640625 px label clearance. Existing hook/bundle warnings remain nonblocking. Scope excludes previous Rust changes and native-translucency acceptance.
Success: Confirmed review defects fixed and verified, 2026-09-11.
