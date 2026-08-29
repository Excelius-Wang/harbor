# GitHub Web parity

## Goal

Bring the complete GitHub Web workflow needed by an individual developer into Harbor, with native
GitHub APIs and selected web fallbacks. Done means each in-scope workflow has loading, empty, error,
permission, navigation, and primary interaction coverage. Organization administration, Enterprise
controls, and organization-level advanced security remain out of scope.

## Current state

Draft [PR #12](https://github.com/Excelius-Wang/harbor/pull/12) integrates the latest heads of PRs
#1 through #11 on `integration/prs-1-11-20260829`; it is clean and mergeable. The combined tree adds
repository Insights, personal Packages, Wiki, Reactions, comment lifecycle, commit details,
conversation controls, personal collaborators, received invitations, Issue taxonomy, and Pages.
Pages routes Actions publishing to Harbor's native Actions tab. Wiki Git/cache operations live behind
`WikiRepositoryStore`; authentication errors remain explicit and search includes UTF-8 page bodies.
Reaction writes serialize and restore all affected caches on failure. Comment updates preserve
reaction subjects and allow an explicitly empty body through both frontend and Tauri validation.
Commit detail maps 404, 409, and 422 to non-retryable states without leaking private repository
existence. The main window defaults to 1200×760 logical pixels so it fits the built-in Retina work
area while retaining the verified 900×620 minimum.

The primary worktree has separate, uncommitted Actions-administration work and must remain untouched.
No generated output, credentials, or unrelated local artifacts are included. OAuth login now
completes and saves a credential, but the configured client is a GitHub App and the issued user token
is a `ghu_` token with no OAuth scopes. The signed-in app can call `/user`, and it is installed on the
personal account, but `/user/packages?package_type=container` returns `403 Resource not accessible by
integration` under both API versions `2022-11-28` and `2026-03-10`; GitHub reports
`allows_permissionless_access=true`. This disproves the release assumption that the configured
GitHub App user token can exercise the native Personal Packages route. Harbor now rejects GitHub
App client IDs before sign-in and rejects new or stored `ghu_` credentials before use. Its supported
scope-based login is documented as a classic OAuth App flow. Harbor's original code is now
`AGPL-3.0-only`; `NOTICE` preserves the original repository attribution, the template MIT notice is
retained separately, and About exposes the license and canonical source. Temporary diagnostic
logging was removed.

## Next action

Blocked — create and configure a classic GitHub OAuth App for Harbor; after its local credentials
replace the GitHub App values, reconnect and rerun the live in-app Packages probe.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets`, `cargo fmt --check`, and
`git diff --check`. Confirm PR #12 is clean and mergeable, then reconnect and confirm the in-app
Packages page reaches a package list or its empty state instead of `githubPermission`.

Success: `pnpm check` passes with 33 files and 174 tests; the Rust library passes 314 tests with two
intentional ignores; Clippy passes with 15 existing warnings. PR #12 remains Draft until the live
Packages probe succeeds.
