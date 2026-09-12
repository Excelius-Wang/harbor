# Profile README layout

## Goal
Implement the approved compact profile header, fully expanded Profile README, contribution calendar and activity hierarchy; connections open from counts.

## Current state
Implemented and verified on `feat/profile-readme-layout` in Harbor. Changes remain uncommitted; no PR or merge performed for this batch. Public root README read command requires a rebuilt/restarted native app. Preserve unrelated pre-existing Cairn archive changes.
Evidence: `docs/verification/profile-layout/README.md`. Eight layout combinations, six README states, four connection states and profile navigation passed in controlled browser preview. No live GitHub or new native material acceptance claimed.

## Next action
None — complete

## Verification
`VITEST_MAX_WORKERS=1 pnpm check`; `cargo check --manifest-path src-tauri/Cargo.toml`; `cargo test --manifest-path src-tauri/Cargo.toml github::profile --lib`; recorded Playwright scripts.
Success: 668 frontend tests, 7 native profile tests, format/lint/build and cargo check pass. Existing nonblocking hook and bundle-size warnings remain. Screenshot evidence is stored in the repository.
