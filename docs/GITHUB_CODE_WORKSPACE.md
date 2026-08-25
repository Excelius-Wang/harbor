# GitHub code workspace

Harbor's repository workspace keeps the familiar GitHub flow in one desktop view:

- **Code** reads branches, repository contents, the root README, and the latest eight commits.
- **Issues** reads open GitHub Issues and keeps Harbor's unassigned filter and detail sheet.
- **Pull requests** and **Actions** are visible navigation targets with honest GitHub fallbacks until their end-to-end workflows are implemented.

## Data flow

The React views call two read-only Tauri commands:

- `github_get_repository_code_overview`
- `github_list_repository_contents`

Both commands validate the repository reference and path, load the token from the operating system credential store, and delegate to the `GitHubClient` interface. The Octocrab implementation uses GitHub's repository Contents, README, Branches, and Commits APIs.

README Markdown is rendered with `react-markdown` and `remark-gfm`. Raw HTML is not enabled. Links open outside Harbor, and images are presented as explicit external links so private image URLs and webview navigation do not leak credentials or replace the workspace.

GitHub reads use TanStack Query with query keys scoped by repository, branch, and path. Fresh data
is reused for 60 seconds and inactive data is kept for five minutes. The cache is memory-only and
is cleared when the GitHub account connects or disconnects. Refresh controls bypass the freshness
window and read from GitHub again.

## Manual verification

1. Build Harbor with its GitHub App configuration, install the bundled desktop app, and sign in
   through GitHub. macOS delivers the `harbor://` callback to an installed bundle rather than the
   development process.
2. Open **Repositories** and select a repository.
3. In **Code**, switch branches, enter a folder, return through the breadcrumb, open a file, inspect recent commits, and scroll through the README.
4. In **Issues**, switch between all open and unassigned Issues and open an Issue detail sheet.
5. Confirm the Pull requests and Actions fallbacks open the matching GitHub pages.

Automated checks:

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## GitHub App configuration

Harbor expects these values at Rust compile time:

- `HARBOR_GITHUB_CLIENT_ID`
- `HARBOR_GITHUB_CLIENT_SECRET`

Configure the GitHub App callback URL as `harbor://oauth/github/callback`. Keep the values in the
release environment; do not commit them. GitHub requires the client secret during the token
exchange even though an installed desktop application cannot treat an embedded secret as a strong
security boundary, so Harbor also uses PKCE and callback state validation.

For the current read-only workspace, grant repository **Metadata: Read-only** (GitHub enables this
automatically), **Contents: Read-only**, and **Issues: Read-only**. Install the GitHub App on the
accounts and repositories that Harbor should be able to show; a user access token cannot exceed
the repositories selected for the installation.
