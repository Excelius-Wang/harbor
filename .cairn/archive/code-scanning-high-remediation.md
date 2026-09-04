# Harbor high-severity CodeQL remediation

## Goal

Resolve all five open high-severity CodeQL alerts in `Excelius-Wang/harbor` without weakening
Markdown rendering, syntax highlighting, Tauri external-link permissions, or credential handling.
Done means regression tests cover the unsafe boundaries, project checks pass, the fix is merged to
`main`, and GitHub reports zero open high-severity code-scanning alerts.

## Current state

Complete. [PR #34](https://github.com/Excelius-Wang/harbor/pull/34) was squash-merged as
`911148ff04756ecfa21b715021836fbd3d223c73`. The fix validates credential-free HTTP(S) Markdown
bases, passes the actual file path into repository-relative resolution, applies the same protocol
boundary before browser/Tauri external opens, uses exhaustive static lazy imports for Shiki, and
removes the ignored Rust test's package-count log. Regression coverage includes the actual dialog
path source, unsafe and credential-bearing bases, safe Wiki/Gist links and images, invalid syntax
languages, and the worker's `lines: null` fallback.

`pnpm check` passed 63 files and 301 tests with a production build. Rust library tests passed 437
cases with two intentional ignores; Cargo check and Rustfmt passed; Clippy reported only 15
pre-existing warnings. Standards and Spec reviews found no unresolved issues, including the final
compile-time `never` exhaustiveness guard. CodeQL on merged `main` reported zero results for Actions,
JavaScript/TypeScript, and Rust, and GitHub reports zero open High alerts. The remote feature branch
was deleted.

## Next action

None — complete.

## Verification

```bash
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo check --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
gh api --paginate 'repos/Excelius-Wang/harbor/code-scanning/alerts?state=open&severity=high&per_page=100' --jq 'length'
```

Success: focused red/green tests and all project checks pass on merged `main`, all CodeQL jobs pass,
and GitHub returns zero open high-severity alerts.
