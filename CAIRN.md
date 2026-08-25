# CAIRN

## Goal

Make repeated repository navigation feel immediate by adding session-only caching and request
deduplication to Harbor's GitHub reads, while keeping manual refresh and real GitHub data.

## Current state

The GitHub repository workspace now uses TanStack Query for repositories, Code overview,
contents, and Issues. Query keys include repository, branch, and path where relevant. Fresh data is
reused for 60 seconds, inactive entries are collected after five minutes, and connecting or
disconnecting GitHub clears the in-memory cache. Manual refresh still reads GitHub immediately.

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

Result: `pnpm check`, Rust formatting, 19 local Rust tests, `cargo check`, and `git diff --check`
pass; one external DeepWiki test remains ignored by design. Unit tests prove same-key
deduplication, fresh-cache reuse, explicit invalidation, and account-change isolation for active
and inactive queries. A Playwright call-count probe confirms StrictMode now issues one initial
request per GitHub query, revisiting a repository issues none, and manual refresh refetches Code
overview and contents.

## Decisions

- Use TanStack Query rather than a handwritten cache.
- Keep cache in memory only, with a 60-second stale window and five-minute garbage collection.
- Keep React StrictMode; rely on query-key deduplication instead of effect guards.
- Defer ETag, disk persistence, prefetching, and Octocrab session reuse until measurements justify
  them.
