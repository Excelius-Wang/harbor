# GitHub file preview

## Goal

Open repository text files inside Harbor with a focused, readable code preview; keep external GitHub
navigation as an explicit action and handle unsupported files honestly.

## Current state

Complete. Harbor reads a selected file through `GitHubClient`, a validated Tauri command, and a
revision-and-path-scoped TanStack Query cache. UTF-8 text renders in a dedicated source viewer with
breadcrumbs, line numbers, size metadata, and an explicit GitHub action. Binary files and files
above 1 MB or 10,000 lines show an honest fallback instead of rendering unsafe or expensive text.

## Next action

None — complete.

## Verification

- `pnpm check` passed: formatting, lint, 6 Vitest tests, TypeScript, and Vite production build.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 33 passed, 1 service-dependent test ignored.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `git diff --check` passed.
- Playwright clicked `README.md` through a mocked Tauri runtime: Harbor called
  `github_get_repository_file`, rendered the source, and made zero opener calls. Reopening the file
  reused the cached read; the opener ran only after the explicit **Open on GitHub** action.

## Decisions

- Follow GitHub's Contents API boundary and mature source-viewer state design without copying code.
- Keep the GitHub client, Tauri command, React query, and viewer behind existing small seams.
- Reuse Octocrab, TanStack Query, and shadcn primitives; do not add a heavyweight editor for a
  read-only first slice.
- Limit previews to 1 MB and 10,000 lines so pathological text files do not stall the webview.
