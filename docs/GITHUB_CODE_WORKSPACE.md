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

## Manual verification

1. Run `pnpm tauri:dev` and connect a fine-grained token with repository Contents and Issues read access.
2. Open **Repositories** and select a repository.
3. In **Code**, switch branches, enter a folder, return through the breadcrumb, open a file, inspect recent commits, and scroll through the README.
4. In **Issues**, switch between all open and unassigned Issues and open an Issue detail sheet.
5. Confirm the Pull requests and Actions fallbacks open the matching GitHub pages.

Automated checks:

```bash
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```
