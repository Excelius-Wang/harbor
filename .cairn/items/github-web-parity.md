# GitHub Web parity

## Goal

Bring the complete GitHub Web workflow needed by an individual developer into Harbor, with native
GitHub APIs and selected web fallbacks. Done means each in-scope workflow has loading, empty, error,
permission, navigation, and primary interaction coverage. Organization administration, Enterprise
controls, and organization-level advanced security remain out of scope.

## Current state

[PR #12](https://github.com/Excelius-Wang/harbor/pull/12) was squash-merged to `main` as
`b26847bb0a6e2eccf365136d6c1cad3fe04142c5`. PRs #1 through #11 were closed as superseded, and the
remote integration and superseded feature branches were deleted. The merged slice adds repository
Insights, personal Packages, Wiki, Reactions, comment lifecycle, commit details, conversation
controls, personal collaborators, received invitations, Issue taxonomy, and Pages. The signed-in
production Packages page reached its empty state after the exact API returned `200`.

[PR #13](https://github.com/Excelius-Wang/harbor/pull/13) was squash-merged to `main` as
`7a8045bf9f7c970c324d7a18888708ae67faa145`, and its remote feature branch was deleted. The merged
Actions-administration slice adds native workflow enable/disable and eligible run deletion with
authoritative state and identity guards, complete run-cache reconciliation, list/detail controls,
English/Chinese copy, and local HTTP transport tests. Standards and Spec reviews have no unresolved
findings. The squash tree exactly matches the reviewed head. On merged `main`, `pnpm check` passes
34 files and 180 tests, Rust library tests pass 324 tests with two intentional ignores, Clippy passes
with the 15 existing warnings, and `cargo check`, rustfmt, and `git diff --check` pass.

The original worktree remains on local recovery branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with only its older Cairn item
unstaged; no source work remains there. The next clean worktree is
`/private/tmp/harbor-pr-file-view-state-20260830` on
`feat/github-pull-request-file-view-state`, based on merged `main`. The current gap audit leaves PR
review controls as the highest-ranked missing personal workflow. This slice is limited to native
mark/unmark viewed state for pull-request files; review dismissal, base edits, and maintainer
editability remain separate slices.

The current slice now has a primary-source research note verified against GitHub's official
GraphQL/REST documentation and the live GitHub.com schema on 2026-08-30. The implementation keeps
REST diff pages intact, reads all viewer-specific file states through a focused cursor-paginated
GraphQL client, validates duplicate paths/cursors and mutation response identity, and exposes
separate validated mark/unmark Tauri commands. TanStack Query keeps the complete view-state snapshot
separate from REST pages and joins by exact path; the shadcn file-header checkbox preserves
`viewed`, `unviewed`, and `dismissed` states, limits pending state to the selected file, and keeps
diffs usable through loading or mutation errors. English and Chinese copy and focused render/cache/
transport tests are included.

Standards and Spec reviews found one loading-state bug, one hard i18n-hook violation, duplicated
retry-alert markup, and missing failure regression coverage. All are fixed: unmatched paths are
checked only after authoritative state data and non-placeholder REST data exist; the new component
uses Harbor's multi-window translation hook; one shared retry alert serves all four file/review
errors; and tests cover loading, error rendering, failed-cache preservation, checked, dismissed,
and pending states. Re-review has no unresolved Spec or Standards findings; the generic retry alert
now lives in its own pull-request-files module instead of the file-view-state module.

`pnpm check` passes 35 frontend files and 188 tests. Rust library tests pass 329 tests with two
intentional ignores. Focused Rust tests include two-page local GraphQL transport. `cargo check`,
rustfmt, and `git diff --check` pass. Clippy completes with exactly the 15 existing warnings and no
warning in this slice.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

## Next action

Commit and push the PR #14 review fixes, confirm the Draft PR is mergeable, then make it Ready and
squash-merge it.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`,
`cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`. Review the focused
diff against `origin/main`, then deliver it through a Draft PR, Ready state, squash merge, `main`
verification, and remote branch deletion.

Success: the focused PR is squash-merged with no unresolved Standards or Spec findings; remote
`main` contains the verified pull-request file viewed-state slice; the remote feature branch is
absent; the remaining personal GitHub Web gaps are recorded for the next independent slice.
