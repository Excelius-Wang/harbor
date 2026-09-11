# Profile calendar companion

## Goal
Ship the approved green calendar above fully expanded README, with an always-present pixel explorer and click/keyboard date encounters. Real contributions alone determine level.

## Current state
Complete on the uncommitted `feat/profile-readme-layout` branch. Calendar precedes the fully expanded README. Resident explorer supports deterministic exploration, Bug, chest and rest encounters, immediate selected-date details, replacement of pending travel, real-contribution levels, manual/offscreen/background pause and reduced motion. Generated sprite provenance and full prompt are recorded in `docs/verification/profile-companion/ASSET.md`; delivery evidence is in `docs/verification/profile-companion/README.md`. Previous profile changes and unrelated archives are preserved. No commit, push, PR or merge performed for this iteration.

## Next action
None — complete

## Verification
Final `VITEST_MAX_WORKERS=1 pnpm check` passed 683 tests in 140 files, formatting, lint, TypeScript and production build. Seven companion tests and four calendar tests passed. All eight browser combinations (English/Chinese, light/dark, 900/1440 px) passed; additional Bug, in-flight/manual/offscreen/background pause, reduced motion, keyboard, rapid replacement, refresh retention and outside dismissal checks passed. Evidence includes settled screenshots and chest-opening feedback. Existing nonblocking hook and bundle-size warnings remain. This iteration changes no Rust; browser verification does not establish native translucency acceptance. Completed 2026-09-11.
