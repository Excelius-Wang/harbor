# GitHub Web parity

## Goal

Bring the complete GitHub Web workflow needed by an individual developer into Harbor, with native
GitHub APIs and selected web fallbacks. Done means each in-scope workflow has loading, empty, error,
permission, navigation, and primary interaction coverage. Organization administration, Enterprise
controls, and organization-level advanced security remain out of scope.

## Current state

PRs #1 through #17 have been consolidated and squash-merged through
`a4a1dd48749b677408de0358c6b3316027c3d2cc`; superseded and merged remote feature branches were
deleted. PR #17 delivered author-controlled pull-request maintainer editability with guarded
preflight/write/postflight verification and no unresolved Standards or Spec findings.

The next focused slice is in the clean worktree
`/private/tmp/harbor-github-web-parity-next-20260830` on `feat/github-commit-comments`, based on
`origin/main` at `a4a1dd4`. It adds native paginated commit-comment reads, general and exact
diff-position creation, revision/capability-guarded edit and delete, commit-comment reactions,
unplaceable-comment recovery UI, English/Chinese copy, and focused transport and interaction tests.
Rust production code is split between a 338-line domain/service module and a 631-line transport
module; tests remain separate. [Draft PR #18](https://github.com/Excelius-Wang/harbor/pull/18) is
open. Initial Standards review reported four findings and Spec review reported five; all are fixed.
The first final Standards review had zero findings. Its paired Spec review found one remaining low
REST-contract test gap, fixed at source head `7b23a44` with shared-header assertions across REST
verbs and a successful commit-level POST that omits `path` and `position`. The fixes also cover
authoritative-refetch write locks, exact Git path preservation, terminal-newline diff mapping,
repository translation hooks, required tooltips, bounded shared types/components, and independent
navigation/reaction coverage. `pnpm check` passes 45 files and 245 tests; focused commit-comment
Rust tests pass 17 cases; full Rust library tests pass 378 cases with two intentional ignores;
`cargo check`, rustfmt, `git diff --check`, and Clippy pass with exactly the 15 pre-existing warnings.

The original worktree remains on local recovery branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with only its older Cairn item
unstaged. Do not reset, stash, clean, or use it for source edits.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

## Next action

Run full Rust verification and final independent Standards and Spec re-reviews on Draft PR #18's
exact head, then carry the reviewed head through Ready state, squash merge, merged-`main`
verification, and remote branch deletion if both reviews have no unresolved findings.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`,
`cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`. Review the focused
diff against `origin/main`, then deliver it through a Draft PR, Ready state, squash merge, `main`
verification, and remote branch deletion.

Success: the focused PR is squash-merged with no unresolved Standards or Spec findings; remote
`main` contains the verified commit-comment slice; its remote feature branch is absent; the
remaining personal GitHub Web gaps are recorded for the next independent slice.
