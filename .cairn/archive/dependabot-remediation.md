# Remediate Harbor Dependabot alerts

## Goal

Resolve every open Dependabot alert in `Excelius-Wang/harbor` without regressing the Tauri desktop
application. Done means all affected npm dependency paths use patched versions, project checks pass,
the fix is merged to `main`, and GitHub reports zero open Dependabot alerts.

## Current state

PR #30, [fix(deps): remediate Dependabot alerts](https://github.com/Excelius-Wang/harbor/pull/30),
is squash-merged at `f9b0a3a4bc1a843ea829464bb4f1f3084ec0d44c`. It updates the smallest compatible
JavaScript toolchain set and its lockfile. On merged `main`, both `pnpm audit` and `pnpm audit --prod`
report zero vulnerabilities; `pnpm check` passes 59 files and 292 tests, and Rust library tests pass
430 cases with two intentional external-service ignores.

PR #31, [fix(deps): update patched Rust transitive dependencies](https://github.com/Excelius-Wang/harbor/pull/31),
is squash-merged at `aa0b814f783acd5457b69bc8d8eba69f3d7f3bd0`. It updates `rand 0.8.6`,
`rustls-webpki 0.103.13`, `tar 0.4.46`, and `serde_with 3.21.0`; all CodeQL jobs pass. Of the 30
alerts handled in this task, compatible upgrades fixed 28; GitHub now shows 35 fixed alerts across
the repository's full Dependabot history.

The two remaining reports were individually verified and dismissed as `not_used` with audit
comments. Rand alert #34's remaining 0.7.3 copy is build-only through `selectors -> phf_codegen`;
`cargo tree -e features` proves the advisory's required `log` feature is disabled, and Harbor has no
custom logger. Glib alert #28 affects `VariantStrIter::impl_get` through
`Variant::array_iter_str`; a search over Harbor and every package returned by `cargo metadata`
found no caller outside glib's own documentation and tests. Tauri 2.11.5's GTK3 stack still
requires glib 0.18, so no incompatible cross-minor override or private fork was introduced.

The primary recovery worktree remains on `checkpoint/github-actions-administration-20260830` with
the user's existing uncommitted README and Cairn changes. Do not edit, reset, stash, or clean it.
PR #29 was closed as superseded by PR #30, and its temporary worktree and branch were removed. The
Dependabot API is authoritative after each merge.

## Next action

None — complete

## Verification

```bash
pnpm audit --prod
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo fmt --manifest-path src-tauri/Cargo.toml --check
gh api --paginate 'repos/Excelius-Wang/harbor/dependabot/alerts?state=open&per_page=100' --jq 'length'
```

Success: the merged dependency tree reports no pnpm vulnerabilities; `pnpm check`, Rust tests,
Cargo check, Rustfmt, Clippy, and CodeQL pass; GitHub reports 35 fixed, two evidence-backed dismissed,
and zero open Dependabot alerts.
