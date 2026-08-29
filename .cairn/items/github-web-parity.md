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
existence.

The primary worktree has separate, uncommitted Actions-administration work and must remain untouched.
No generated output, credentials, or unrelated local artifacts are included. The only unverified
release gate is the ignored live Personal Packages probe: it currently returns `GitHubNotConnected`
because the macOS Keychain has no saved Harbor OAuth grant with `read:packages`.

## Next action

Blocked — the live Packages probe requires the user to approve and finish a new GitHub OAuth grant;
when the user is available, launch Harbor login and run
`cargo test --manifest-path src-tauri/Cargo.toml live_harbor_oauth_lists_personal_packages -- --ignored --nocapture`.

## Verification

Run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets`, `cargo fmt --check`, and
`git diff --check`. Confirm PR #12 is clean and mergeable, then run the credential-gated probe above.

Success: `pnpm check` passes with 32 files and 173 tests; the Rust library passes 310 tests with two
intentional ignores; Clippy passes with 15 existing warnings. The focused empty-comment and commit
status tests pass. PR #12 remains Draft until the live OAuth probe succeeds.
