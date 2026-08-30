# GitHub Web parity

## Goal

Bring the complete GitHub Web workflow needed by an individual developer into Harbor, with native
GitHub APIs and selected web fallbacks. Done means each in-scope workflow has loading, empty, error,
permission, navigation, and primary interaction coverage. Organization administration, Enterprise
controls, and organization-level advanced security remain out of scope.

## Current state

PRs #1 through #20 are squash-merged. PR #20 delivered Issue close reasons in merge commit
`7b1fc68`; its exact reviewed head passed 49 frontend files and 264 tests, 398 Rust tests with two
intentional external-service ignores, cargo check, rustfmt, `git diff --check`, and independent
Standards and Spec reviews with zero unresolved findings.

The current slice is in `/private/tmp/harbor-github-sub-issues-read-20260830` on
`feat/github-sub-issues-read-20260830`, based on `origin/main` at `7b1fc68`. The user selected the
read-only Issue hierarchy tracer: show an optional parent and paginated sub-issues, with native
hierarchy navigation where possible. The confirmed TDD seams are a focused Rust Issue-relationships
interface and transport, its Tauri command, an independent TanStack Query module, and a focused React
interaction component. The red-green cycles for all four seams are complete.

The implementation is now complete in focused modules. Rust reads the official parent and
sub-issues REST routes with the `2026-03-10` API version, preserves unknown state reasons, keeps
cross-repository coordinates, interprets a missing parent as empty, follows Link pagination, maps
moved and permission errors, and rejects self-references and duplicate child identities. A
registered Tauri command exposes the read-only page. The frontend adds an independent query-key
module, loading/empty/error/permission states, sub-issue pagination, and an in-place Issue-detail
history that supports native cross-repository traversal before returning to the host view. New
production code remains in focused files; tests are separate.

[Draft PR #21](https://github.com/Excelius-Wang/harbor/pull/21) is open and cleanly mergeable. Its
first independent Standards and Spec reviews of `a2c4210` found six gaps: response
identity reconciliation, cached-refresh error visibility, shadcn Empty composition, a real
detail-level failure/retry regression test, repeated Rust request parameters, and stale checkpoint
delivery state. Fixes for all six are complete and pass the full verification suite.

Independent Spec re-review of exact head `e4dcaa1` reports zero unresolved findings. Independent
Standards re-review confirms all code findings are resolved and reports only that this checkpoint's
delivery step must advance now that the reviews are complete.

This slice does not add authentication scope or Issue mutations. Adding, removing, reordering, and
reparenting sub-issues remain separate work because GitHub's write contract has cross-repository
ownership rules, `replace_parent` semantics, and secondary-rate-limit implications. GitHub supports
up to 100 direct children and eight hierarchy levels; child reads remain paginated.

The original worktree remains on local recovery branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with only its separate Cairn item
unstaged. Do not reset, stash, clean, or use it for source edits.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

## Next action

Mark PR #21 Ready, confirm its final remote head remains clean and mergeable, squash merge it,
verify merged `main`, and delete the feature branch.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`,
`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, and `git diff --check`. Review the focused
diff against `origin/main`, then deliver it through a Draft PR, Ready state, squash merge, `main`
verification, and remote branch deletion.

Current verification passes 54 frontend files and 273 tests, 407 Rust tests with two intentional
external-service ignores, the production frontend build, rustfmt, and `git diff --check`. Clippy
passes with exactly the 15 pre-existing warnings and no warning from this slice.

Success: the focused PR is squash-merged with no unresolved Standards or Spec findings; remote
`main` contains the verified read-only Issue-hierarchy slice; its remote feature branch is absent;
the excluded write workflow remains clearly recorded as later work.
