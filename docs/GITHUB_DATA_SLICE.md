# GitHub Repository and Issue Data

## Goal

Let a connected Harbor user browse real repositories and inspect real open Issues without
exposing credentials to the frontend or introducing write actions.

## Behavior

- Read the GitHub OAuth credentials from the operating system credential store and refresh an
  expiring access token when GitHub supplied a refresh token.
- Use Octocrab's authenticated-user repository endpoint and request the first 100 repositories,
  ordered by the most recently pushed.
- Show repository ownership, visibility, language, stars, forks, archive state, and open-item
  count when GitHub provides those fields.
- Request the first 100 open items for the selected repository, ordered by latest update.
- Remove pull requests returned by GitHub's Issues endpoint by checking the `pull_request` field.
- Show Issue labels, author, assignees, comment count, body, and update time.
- Keep browser preview desktop-only because credentials and authenticated requests stay in Rust.
- Keep Ask Harbor connected to the currently selected real repository.

## Limits of this slice

- No local cache or background polling yet.
- No pagination controls beyond reporting that only the first 100 items are shown.
- No repository pinning, Issue assignment, comments, or other GitHub write actions.
- Pull Requests and Discover continue as separate future slices.

## Verification

```bash
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri:dev
```

In the bundled desktop app, sign in through GitHub in the system browser, open Repositories, select
a repository, and confirm that its open Issues match GitHub. Search, unassigned filtering,
refresh, empty states, and external links should remain usable.
