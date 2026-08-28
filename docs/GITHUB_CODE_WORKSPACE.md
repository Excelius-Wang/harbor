# GitHub code workspace

Harbor's repository workspace keeps the familiar GitHub flow in one desktop view:

- **Code** reads branches and tags, repository contents, text-file previews, the root README, commit
  and file history, GitHub blame, repository-scoped code search, raw files, and downloads.
- **Issues** reads open and closed GitHub Issues with repository-scoped search, assignee and label
  filters, sorting, pagination, and a complete in-app conversation timeline. Harbor can create an
  Issue, preview its Markdown, edit its title, body, assignees, labels, and milestone, post comments,
  and close or reopen it without leaving the workspace.
- **Pull requests** reads open, closed, draft, and merged pull requests with repository-scoped
  search, filters, sorting, pagination, and an in-app review workspace. Harbor can edit a pull
  request's title and description, preview Markdown, and post conversation comments without opening
  the browser. The changed-files workspace adds Markdown comments to exact diff lines, keeps them
  editable until submission, and sends them with comment, approval, or change-request reviews.
- **Pull Requests inbox** reads account-wide pull requests created by, assigned to, or awaiting a
  review from the signed-in user, then opens the same in-app review workspace.
- **Actions** reads paginated workflow runs with status filters, then opens Jobs, ordered Steps, and
  completed Job logs without leaving Harbor.

## Data flow

The React views call these Tauri commands:

- `github_get_repository_code_overview`
- `github_list_repository_commits`
- `github_list_repository_tags`
- `github_get_repository_blame`
- `github_search_repository_code`
- `github_list_repository_contents`
- `github_get_repository_file`
- `github_download_repository_file`
- `github_list_repository_issues`
- `github_list_repository_issue_labels`
- `github_list_repository_issue_assignees`
- `github_list_repository_issue_milestones`
- `github_get_repository_issue`
- `github_create_repository_issue`
- `github_update_repository_issue`
- `github_update_repository_issue_metadata`
- `github_create_repository_issue_comment`
- `github_update_repository_issue_state`
- `github_list_repository_pull_requests`
- `github_list_pull_request_inbox`
- `github_get_repository_pull_request`
- `github_update_repository_pull_request`
- `github_create_repository_pull_request_comment`
- `github_create_repository_pull_request_review`
- `github_list_pull_request_commits`
- `github_list_pull_request_files`
- `github_list_repository_checks`
- `github_list_repository_workflow_runs`
- `github_list_workflow_run_jobs`
- `github_get_workflow_job_log`

The commands validate repository references, paths, search input, and page bounds before loading the
token from the operating system credential store and delegating to the `GitHubClient` interface. The
Octocrab implementation uses GitHub's repository Contents, README, Branches, Tags, Commits, Issues,
Search, Labels, Assignees, Milestones, Timeline, Pull Requests, Reviews, Checks, Statuses, Workflow
Runs, and Workflow Jobs APIs. Blame uses GitHub's GraphQL `Commit.blame` field because the REST API
does not expose the same range data.

Code search is isolated behind `GitHubClient` because GitHub's REST code-search endpoint remains a
legacy surface. Harbor always appends the selected repository scope and removes qualifiers that
could escape it. Results cover GitHub's indexed default branch, so an unindexed fork can return no
matches even when a file exists. Commit history, tags, blame, and search pages have separate TanStack
Query cache keys.

File downloads use the official Tauri dialog plugin. The Rust command opens the native Save dialog,
fetches the raw file through the authenticated GitHub client, and writes only the chosen path. The
WebView does not receive broad file-system write permission.

Issue list queries are scoped by repository, state, assignee status, label, sort order, search terms,
and page. Harbor preserves GitHub search syntax but removes qualifiers that could replace the
selected repository, state, or assignee scope. Issue conversations combine the canonical Issue
record with GitHub's ordered timeline, including Markdown comments and metadata events. TanStack
Query caches every list and timeline page independently and prefetches the first detail page when a
row is hovered or focused. Creation and title/body editing share one form and the existing safe
Markdown renderer. Issue mutations stay behind the same `GitHubClient` boundary, verify that an
existing number belongs to an Issue rather than a pull request, and reconcile GitHub's returned
record with detail and list caches before invalidating related queries. Assignee and milestone
options use separate repository-scoped caches and load only when their editor tabs open. Metadata
updates replace assignees, labels, and the milestone atomically; the Rust client verifies GitHub's
returned record so silently dropped values become an explicit permission error.

Pull request lists use the same repository-scoped search boundary and keep GitHub's author, review,
base, and head qualifiers. Detail opens with the conversation and review summary, then loads commits,
checks, and changed files only when their tabs are selected. Each section has an independent TanStack
Query cache and pagination state, so returning to a tab does not repeat an unchanged request. Changed
files use `react-diff-view` for unified-diff parsing and rendering, with single-column and two-column
layouts; wide two-column content scrolls inside the diff instead of stretching the workspace. Title
and description edits use Octocrab's native Pull Requests update builder. Ordinary conversation
comments use GitHub's shared Issue comments endpoint because every pull request is also an Issue;
Harbor verifies the pull request identity before writing. The returned pull request or comment is
merged into the active conversation, repository list, and account inbox before related queries are
invalidated. Review submission keeps Octocrab's authenticated transport and sends GitHub's documented
review payload, including modern `line` and `side` coordinates for inline comments, against the head
commit shown in Harbor. `react-diff-view` supplies the gutter and widget extension points, so Harbor
does not maintain a second diff renderer. Pending comments stay editable in the current pull request
workspace and are submitted as one real GitHub review. Comment and change-request reviews require a
summary; approval summaries are optional, matching GitHub's API and CLI behavior. Returned reviews
update the conversation timeline and latest reviewer state before the focused detail and list caches
are refreshed. Issue and pull request forms share the same sanitized Markdown editor and preview.

The account Pull Requests inbox uses GitHub's issue and pull request search endpoint with enforced
`author:@me`, `assignee:@me`, or `review-requested:@me` scopes. Review requests include direct and
team requests, matching GitHub's documented search behavior. Harbor also enforces the selected open
or closed state and excludes archived repositories. Each scope, search, sort, and page has its own
TanStack Query cache entry. Inbox rows carry their repository identity, so the existing conversation,
commits, checks, and changed-files workspace opens without a second list implementation.

Actions keeps run, Job-page, and Job-log caches separate. Run lists refresh every 15 seconds while a
run is active; an open run refreshes unfinished Jobs every 10 seconds. Job logs remain lazy and are
requested only after a completed, non-skipped Job is selected, matching GitHub CLI's availability
rules. Harbor keeps the final 2 MB of an oversized log because failures normally appear near the end;
the complete log remains available through the Job's GitHub link.

README Markdown is rendered with `react-markdown`, `remark-gfm`, `rehype-raw`, and
`rehype-sanitize`. Common GitHub presentation HTML is parsed into React elements and cleaned with the
sanitizer's GitHub-style default schema before rendering. Links open outside Harbor, relative images
resolve through the repository's raw route, and images use lazy loading without a referrer. A small
pre-sanitize adapter preserves only bounded pixel width and height declarations from image styles;
all other inline CSS is discarded.

Repository files open in Harbor's read-only source viewer. The GitHub client decodes Base64 with
strict UTF-8 validation and treats binary content as unsupported instead of displaying mojibake.
To keep the webview responsive, Harbor previews files up to 1 MB and 10,000 lines. Binary and
larger files keep an explicit **Open on GitHub** fallback; ordinary file clicks do not leave Harbor.

Supported source files are highlighted in a Web Worker with a fine-grained Shiki bundle and GitHub
light or dark themes. Harbor loads only the selected language grammar, keeps one highlighter
instance, and renders tokens as escaped React text nodes rather than injecting generated HTML. A
total worker timeout keeps pathological source from blocking the interface and falls back to plain
text.

Unknown file types and source above 500 KB or 5,000 lines remain readable plain text so syntax
tokenization cannot stall the file view.

GitHub reads use TanStack Query with query keys scoped by repository, branch, and path. Fresh data
is reused for 60 seconds and inactive data is kept for five minutes. The cache is memory-only and
is cleared when the GitHub account connects or disconnects. Refresh controls bypass the freshness
window and read from GitHub again.

The frontend caches only the connected account name and avatar for display. It does not probe
Keyring on startup or when opening the connection dialog. Rust loads OAuth credentials lazily when
a GitHub data request or an explicit credential action needs them. Builds without GitHub App
configuration return disconnected without opening Keyring.

## Manual verification

1. Build Harbor with its GitHub App configuration and run `pnpm tauri:dev`. Sign in through GitHub;
   the browser returns to Harbor's short-lived listener on `127.0.0.1`.
2. Open **Repositories** and select a repository.
3. In **Code**, switch branches or tags, enter a folder, return through the breadcrumb, open a file,
   inspect repository and file history, open blame, view the raw file, test Save As, search the
   repository, and scroll through the README.
4. In **Issues**, switch between open and closed Issues; try search, assignee, label, sort, and page
   controls; create an Issue after checking its Markdown preview; edit its title and body, including
   clearing the body; add and remove assignees and labels; set and clear its milestone; scroll through
   comments and timeline events; post a Markdown comment; close and reopen the Issue; then return to
   the same list state.
5. Open the account-level **Pull Requests** area; switch between Created, Assigned, and Review
   requests; try open and closed state, search, sort, and pagination; open an item and return to the
   same list state.
6. In repository **Pull requests**, switch between open and closed items; try search, label, sort,
   and page controls; open a pull request; edit its title and description after checking the Markdown
   preview; post a Markdown conversation comment; inspect Conversation, Commits, Checks, and Files
   changed; switch the diff between single-column and two-column; add, preview, edit, and remove line
   comments; open **Review changes** and submit the pending comments with Comment, Approve, and
   Request changes reviews; then return to the same list state.
7. In **Actions**, filter runs by state; open a run; expand a failed Job; inspect its ordered Steps;
   load a completed Job log; then return to the same run list.

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

For local development, declare them in the repository-root `.env.local`. The `pnpm tauri:dev` and
`pnpm tauri:build` scripts load Vite's normal environment-file cascade before Tauri starts, so Cargo
receives the same values. Existing shell or CI environment variables keep precedence. Cargo also
tracks both variables and recompiles Harbor when either value changes.

Configure the GitHub App callback URL as
`http://127.0.0.1:49152/oauth/github/callback`. Keep the values in the release environment; do not
commit them. GitHub requires the client secret during the token exchange even though an installed
desktop application cannot treat an embedded secret as a strong security boundary, so Harbor also
uses PKCE and callback state validation. Harbor opens the listener only for an active login and
closes it after one valid callback or the ten-minute timeout.

Grant repository **Metadata: Read-only** (GitHub enables this automatically), **Contents: Read-only**,
**Issues: Read and write**, **Pull requests: Read and write**,
**Checks: Read-only**, and **Actions: Read-only**. Install the GitHub App on the accounts and
repositories that Harbor should be able to show; a user access token cannot exceed the repositories
selected for the installation.
After changing an existing GitHub App's permissions, approve the permission update for its
installation and reconnect Harbor if GitHub requests a new authorization.
