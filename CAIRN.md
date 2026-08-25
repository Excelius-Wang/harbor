# CAIRN

## Goal

Deliver Harbor's first usable workspace slice: the Discover UI, secure GitHub connection,
and a replaceable public-repository context provider backed by DeepWiki.

## Current state

The implementation and documentation are complete in the current HEAD. GitHub API,
system credential storage, and MCP transport use maintained MIT/Apache dependencies behind
Harbor-owned interfaces. Browser interaction checks, frontend checks, Rust tests, a live
DeepWiki smoke test, and native Tauri startup have passed.

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

Success: Frontend build and lint pass; 9 Rust tests pass with the network test ignored by
default; the explicit DeepWiki smoke test answers for a public repository; the native Harbor
window starts without a CSP, IPC, or transparent-window warning.

## Decisions

- DeepWiki receives only `owner/repository` and the user's question, and only for repositories
  whose public GitHub page can be verified.
- GitHub credentials stay in the operating system credential store and are never returned to
  the frontend after connection.
- GitHub client, credential store, and repository context provider remain replaceable seams for
  the next Issue Radar slice.
- The macOS window enables Tauri's private API support for the requested transparent shell. If
  Mac App Store distribution becomes a goal, revisit this packaging decision.
