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

[PR #14](https://github.com/Excelius-Wang/harbor/pull/14) was squash-merged to `main` as
`e3218bb58cd95cc3bef888398b7348de23819b72`, and its remote feature branch was deleted. The merged
slice adds native viewer-specific `viewed`, `unviewed`, and `dismissed` pull-request file state while
retaining REST diff pages. The squash tree exactly matches reviewed head `513f657`, with no
unresolved Standards or Spec findings.

The review-dismissal slice has a primary-source research note verified against GitHub's official
REST/GraphQL documentation and the live GitHub.com schema on 2026-08-30. The implementation uses the
focused REST dismissal route with numeric review IDs, checks the selected review and pull-request
scope before writing, accepts only approved or changes-requested reviews, verifies the mutation
response and a postflight GET, and preserves shared permission/rate-limit errors plus a stable
refreshable conflict code. Review listing now has explicit 100-item pagination and retains REST
`node_id` identity.

The PR reviewer sidebar consumes the complete paged Review cache, shows an eligible-only shadcn
action menu and required-reason dialog, and keeps authority server-side. Success replaces only the
verified review before invalidating the full pull-request/list/Inbox roots; failure preserves the
dialog and input while refreshing authoritative state. Submitted reviews also reconcile the new
paged cache, including the exact 100-item boundary. English, Chinese, ARIA, transport, identity,
eligibility, validation, error-category, query, and cache regressions are covered.

Initial Standards review found a missing tooltip on the icon-only menu and duplicated dialog-state
setup; initial Spec review found no action on historical timeline reviews, generic errors for
malformed successful REST responses, and partial pagination/postflight tests. All findings are fixed:
one reusable dismissal action owns the menu/dialog/mutation, eligible timeline cards retain numeric
review IDs, malformed `200` payloads remain refreshable conflicts, and focused tests traverse two
Review pages plus null and mismatched postflight responses. Independent re-review is pending.

Post-fix verification passes `pnpm check` with 36 frontend files and 199 tests, and Rust library tests
with 337 passing and two intentional ignores. `cargo check`, rustfmt, and `git diff --check` pass.
Strict Clippy previously reported exactly the 15 pre-existing warnings and no warning in this slice;
rerun it on the reviewed head before merge.

The original worktree remains on local recovery branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with only its older Cairn item
unstaged; no source work remains there. The clean development worktree is now
`/private/tmp/harbor-pr-review-dismissal-20260830` on
`feat/github-pull-request-review-dismissal`, based on merged `main`. The next focused PR-review
control is dismissal of an eligible submitted review. Pull-request base edits and maintainer
editability remain separate later slices.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

## Next action

Commit and push the PR #15 review fixes, obtain clean Standards and Spec re-reviews, then mark Ready
and squash-merge when clean.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`,
`cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`. Review the focused
diff against `origin/main`, then deliver it through a Draft PR, Ready state, squash merge, `main`
verification, and remote branch deletion.

Success: the focused PR is squash-merged with no unresolved Standards or Spec findings; remote
`main` contains the verified pull-request review-dismissal slice; the remote feature branch is
absent; the remaining personal GitHub Web gaps are recorded for the next independent slice.
