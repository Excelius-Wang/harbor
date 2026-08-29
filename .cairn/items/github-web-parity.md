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

The recovered Actions-administration slice now lives in
`/private/tmp/harbor-actions-administration-20260830` on
`feat/github-actions-administration`. Commit `3246afe` ports the verified checkpoint onto
`b26847b` without changing the original worktree. The original worktree remains on local branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with only its Cairn item unstaged.
The migrated implementation supports workflow enable/disable and eligible workflow-run deletion
through focused Actions Interfaces, validated Tauri commands, TanStack Query reconciliation,
shadcn controls, and English/Chinese copy. Review added an observed `workflow_id` deletion guard,
maps GitHub 404/409 deletion responses to refreshable conflicts, keeps selected workflow state in
sync after a stale mutation, navigates away before clearing a deleted run's caches, and uses the
documented shadcn menu grouping. The deletion regression test asserts list, detail, Jobs, artifacts,
and known Job-log cache behavior.

`pnpm check` passes 33 frontend files and 178 tests. Rust library tests pass 321 tests with two
intentional ignores. Clippy passes with the 15 existing warnings; `cargo check`, rustfmt, and
`git diff --check` also pass.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

## Next action

Commit the verified review fixes, push `feat/github-actions-administration`, and open its Draft PR.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`,
`cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`. Review the focused
diff against `origin/main`, then deliver it through a Draft PR, Ready state, squash merge, `main`
verification, and remote branch deletion.

Success: all frontend and Rust checks pass; Standards and Spec reviews have no unresolved findings;
the focused PR is squash-merged; remote `main` contains the verified Actions administration slice;
the remote feature branch is absent.
