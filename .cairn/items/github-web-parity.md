# GitHub Web parity

## Goal

Bring the complete GitHub Web workflow needed by an individual developer into Harbor, with native
GitHub APIs and selected web fallbacks. Done means each in-scope workflow has loading, empty, error,
permission, navigation, and primary interaction coverage. Organization administration, Enterprise
controls, and organization-level advanced security remain out of scope.

## Current state

PRs #1 through #19 are squash-merged. PR #18 delivered commit comments at `3eb1a04`; PR #19
refreshed the personal GitHub Web gap audit at `a59f9f3`, selected Issue close reasons as the next
small slice, and recorded the later auth, secret, and repository-administration boundaries. Their
remote branches are absent.

The current slice is in `/private/tmp/harbor-github-issue-close-reasons-20260830` on
`feat/github-issue-close-reasons-20260830`, based on `origin/main` at `a59f9f3`. [Draft PR
#20](https://github.com/Excelius-Wang/harbor/pull/20) adds GraphQL close/reopen capabilities,
Completed and Not planned selection, forward-compatible close-reason display, guarded REST
preflight/write/postflight verification, destination-cache reconciliation, English/Chinese copy,
and focused transport and interaction tests. Production code is split into an Issue lifecycle
module, a small state-control component, and a separate query helper; tests remain separate.

The first independent Standards and Spec reviews found checkpoint, translation-hook, tooltip,
capability-refresh, forward-compatibility, moved-resource, destination-cache, copy, and test-matrix
gaps. Those findings are fixed. A second exact-head review found production retry, combined-error
recovery, bounded cache-ordering, and remaining matrix gaps; those are also fixed. Full verification
now passes 49 frontend files and 264 tests, 398 Rust tests with two intentional external-service
ignores, cargo check, rustfmt, and Clippy with exactly the 15 existing warnings. The focused diff
also passes `git diff --check`.

The original worktree remains on local recovery branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with only its separate Cairn item
unstaged. Do not reset, stash, clean, or use it for source edits.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

## Next action

Commit and push the final verified PR #20 review fixes, then request independent Standards and Spec
re-reviews on the replacement exact head. If both report no unresolved findings, mark the PR Ready,
squash merge, verify merged `main`, and delete the feature branch.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`,
`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, and `git diff --check`. Review the focused
diff against `origin/main`, then deliver it through a Draft PR, Ready state, squash merge, `main`
verification, and remote branch deletion.

Success: the focused PR is squash-merged with no unresolved Standards or Spec findings; remote
`main` contains the verified Issue-close-reason slice; its remote feature branch is absent; the
remaining personal GitHub Web gaps are recorded for the next independent slice.
