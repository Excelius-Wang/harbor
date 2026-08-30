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

[PR #15](https://github.com/Excelius-Wang/harbor/pull/15) was squash-merged to `main` as
`c2a001707ed375cd052b7961f4184527a486c28b`, and its remote feature branch was deleted. The merged
slice adds native dismissal for eligible submitted reviews, complete 100-item REST pagination,
numeric and Node ID preservation, preflight/write/postflight identity guards, timeline and reviewer
actions, required reasons, authoritative cache refresh, and English/Chinese/ARIA coverage. All
initial Standards and Spec findings were fixed, both re-reviews have no unresolved findings, and the
squash tree exactly matches reviewed head `f89d56d`.

On merged `main`, `pnpm check` passes 36 frontend files and 199 tests. Rust library tests pass 337
tests with two intentional ignores. `cargo check`, rustfmt, and `git diff --check` pass. Clippy on the
reviewed tree completed with exactly the 15 pre-existing warnings and no warning in this slice.

The original worktree remains on local recovery branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with only its older Cairn item
unstaged; no source work remains there. The clean development worktree is now
`/private/tmp/harbor-pr-maintainer-editability-20260830` on
`feat/github-pull-request-maintainer-editability`, based on merged `main` at `f6e5b99`.

[PR #16](https://github.com/Excelius-Wang/harbor/pull/16) was squash-merged to `main` as
`f6e5b99b2749bb8b87319ec57752bc2e2fbf2a7f`, and its remote feature branch was deleted. The merged
slice adds native pull-request base editing with complete automatic branch pagination, base/head/
target OID guards, preflight/write/postflight verification, focused conflict mapping, broad cache
refresh, the official impact warning, persistent current-base context, and English/Chinese UI.
Real shadcn/Radix/cmdk keyboard, focus, retry, and pending-lock interactions are covered. Every
initial Standards and Spec finding was fixed; final reviews at head `91d77e9` have no unresolved
findings, and its tree exactly matches the squash merge.

[Draft PR #17](https://github.com/Excelius-Wang/harbor/pull/17) contains the focused
maintainer-editability slice on `feat/github-pull-request-maintainer-editability`. Research,
guarded Rust/Tauri support, and the PR-sidebar UI are separate logical commits; later focused fixes
preserve postflight ambiguity, group IPC guards, and address every initial review finding. The
slice uses the scoped REST PR GET/PATCH route with a boolean-only write,
creator/personal-fork/live-head eligibility, full identity guards, exact-head workflow risk for
enabling, and revocation that is not blocked by the optional workflow scan. The UI keeps production
and tests in separate bounded files, preserves and locks cached values during refresh, offers retry
paths, and synchronizes only affected PR caches. Initial Standards review reported two findings and
Spec review reported five; all are fixed at head `91aec7d`. `pnpm check` passes 39 files and 221
tests; Rust library tests pass 362 tests with two intentional ignores; `cargo check`, rustfmt, and
`git diff --check` pass. Clippy reports exactly the 15 pre-existing warnings and none in this slice.

On merged `main`, `pnpm check` passes 38 frontend files and 211 tests. Rust library tests pass 348
tests with two intentional ignores. `cargo check`, rustfmt, and `git diff --check` pass. Clippy
reports exactly the 15 pre-existing warnings and no warning in the merged slice. The next focused PR
control is author-controlled maintainer editability; it remains distinct from base editing and from
organization administration.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

## Next action

Run final independent Standards and Spec re-reviews on the exact current head. If both report no
unresolved findings, mark PR #17 Ready, squash-merge it, verify merged `main`, and delete the remote
feature branch.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`,
`cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`. Review the focused
diff against `origin/main`, then deliver it through a Draft PR, Ready state, squash merge, `main`
verification, and remote branch deletion.

Success: the focused PR is squash-merged with no unresolved Standards or Spec findings; remote
`main` contains the verified pull-request maintainer-editability slice; its remote feature branch is
absent; the remaining personal GitHub Web gaps are recorded for the next independent slice.
