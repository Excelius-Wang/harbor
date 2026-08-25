# CAIRN

## Goal

Connect Harbor's first real GitHub data workflow: after authentication, the user can browse
their repositories, select one, and inspect its real open Issues inside the desktop app.

## Current state

The previous foundation is complete at `07c7ae1`. The current HEAD contains the verified
real repository and open-Issue read path, focused Octocrab mapping tests, structured IPC errors,
and the repository workspace with Issue details. Both standards and spec re-reviews report no
remaining findings.

## Next action

None — complete

## Verification

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
pnpm tauri:dev
```

Success: The connected account can load real repositories and real open Issues in Harbor;
disconnected and empty states are clear; `pnpm check` passes; 14 Rust tests pass with one live
DeepWiki test ignored by default; UI interaction checks and native startup pass.

## Decisions

- Keep the first slice read-only. Assignment, comments, background monitoring, and automatic
  actions remain out of scope until the data path is stable.
- Reuse Octocrab and GitHub's official APIs behind `GitHubClient`; do not expose credentials to
  the frontend.
- Browser preview keeps sample or desktop-only states because authenticated API calls belong in
  the Tauri backend.
