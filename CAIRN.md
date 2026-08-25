# CAIRN

## Goal

Build Harbor's first GitHub-style repository workspace: a selected repository has Code, Issues,
Pull Requests, and Actions navigation, with real Code data for branches, files, README, and
recent commits.

## Current state

The first GitHub-style repository workspace is implemented. Code reads real branches, repository
contents, the root README, and recent commits through Octocrab; Issues retains its real open and
unassigned views. Pull Requests and Actions are visible with honest GitHub fallbacks. The browser
view was split into repository, Code, and Issue modules, and README rendering uses maintained MIT
libraries (`react-markdown` and `remark-gfm`).

## Next action

Implement the Pull Requests vertical slice next: list open PRs, open a PR summary, and show checks
before attempting an in-app diff viewer.

## Verification

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
pnpm tauri:dev
```

Result: `pnpm check`, Rust formatting, all local Rust tests (19 passed, 1 external-service test
ignored), `cargo check`, and `git diff --check` pass. A Playwright IPC simulation verified Code,
folder navigation and breadcrumbs, README GFM rendering, Issues, and the Issue detail sheet. The
native development process also compiled and hot-reloaded the new Tauri commands.

## Decisions

- Keep Code read-only. Pull Requests and Actions get honest placeholders in this slice.
- Reuse Octocrab for GitHub API access and a maintained Markdown renderer for README content.
- Keep repository navigation within the existing Harbor visual system instead of copying GitHub
  styling pixel for pixel.
