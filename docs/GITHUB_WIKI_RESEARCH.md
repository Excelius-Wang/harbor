# GitHub Wiki transport and product research

Date: 2026-08-29

## Decision

Repository Wikis are not content in the repository's ordinary default branch. GitHub documents
each Wiki as a separate Git repository at
`https://github.com/{owner}/{repository}.wiki.git`, and only the Wiki repository's default branch
is published to readers. Harbor therefore must use Git Smart HTTP for Wiki content; the ordinary
REST Contents and Git Database endpoints address `{owner}/{repository}`, not the separate
`.wiki.git` remote. This last statement is an inference from the two documented resource models,
not an undocumented API guarantee. [GitHub Wiki clone contract](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages#adding-or-editing-wiki-pages-locally),
[REST Contents contract](https://docs.github.com/en/rest/repos/contents),
[REST Git Database guide](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database)

Use `git2` 0.21 with only `https` and `vendored-libgit2` for the first complete native
read/write/history slice. `git2` exposes clone/fetch, remote default-branch discovery, credential
callbacks, object/tree/commit creation, revision walking, diffs, and push. Its manifest accepts the
`libgit2-sys 0.18.x` patch line; Harbor's current lockfile resolves `0.18.8+1.9.7`, which bundles
libgit2 1.9.7. Do not enable SSH and do not invoke or bundle a Git or `gh` executable.
[git2 manifest](https://github.com/rust-lang/git2-rs/blob/main/Cargo.toml),
[published libgit2-sys 0.18.8 source](https://docs.rs/crate/libgit2-sys/0.18.8%2B1.9.7/source/Cargo.toml),
[Harbor lockfile](../src-tauri/Cargo.lock),
[git2 `Remote` API](https://docs.rs/git2/0.21.0/git2/struct.Remote.html),
[git2 `Repository` API](https://docs.rs/git2/0.21.0/git2/struct.Repository.html)

The license boundary must be explicit. The Rust `git2` wrapper is MIT or Apache-2.0. libgit2 is
GPLv2 with a special linking exception that gives unlimited permission to link and distribute the
combined application without applying GPL restrictions to Harbor; changes made to libgit2 itself
remain GPL-covered. Harbor should depend on the released crate and must not copy or modify libgit2
source in this repository. [git2 license declaration](https://github.com/rust-lang/git2-rs/blob/main/Cargo.toml),
[libgit2 license and linking exception](https://github.com/libgit2/libgit2/blob/main/COPYING),
[libgit2 license summary](https://github.com/libgit2/libgit2#license)

`gix`/gitoxide remains the preferred future pure-Rust transport, but it cannot implement this
slice today: the current 0.87.1 README, crate-status document, and source tree all mark push and
send-pack/receive-pack plumbing incomplete. It is suitable for fetch/read/history only. A hybrid
`gix` read path plus a hand-written push protocol would duplicate object/credential/concurrency
logic and recreate security-sensitive Git infrastructure, so it is not recommended.
[gitoxide feature status](https://github.com/GitoxideLabs/gitoxide#readme),
[gitoxide crate status](https://github.com/GitoxideLabs/gitoxide/blob/main/crate-status.md),
[gix remote connection source](https://github.com/GitoxideLabs/gitoxide/tree/main/gix/src/remote/connection)

## GitHub Web behavior that Harbor must preserve

### Availability, visibility, and permissions

- Public-repository Wikis are publicly readable. Private-repository Wikis are readable only by
  people who can access the repository. Wikis are available for public repositories on GitHub
  Free and for public/private repositories on the paid personal plans described by GitHub.
  [About Wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis)
- By default, write access to a repository is required to edit its Wiki. A public repository can
  opt into editing by any signed-in GitHub user, so `repository.permissions.push` is useful UI
  guidance but is not a complete Wiki-write authorization oracle; the push response remains
  authoritative. [Wiki access permissions](https://docs.github.com/en/communities/documenting-your-project-with-wikis/changing-access-permissions-for-wikis)
- A repository's documented API metadata includes `has_wiki`, `archived`, and repository
  `permissions`. Harbor should read that metadata before touching the Git remote so it can
  distinguish disabled, archived/read-only, and potentially writable states without treating
  every 404 or push rejection alike. [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)
- Disabling a Wiki hides but does not erase its content; re-enabling restores the pages. Harbor
  must therefore show a disabled state and route owners to the existing repository Settings
  workflow, not delete its local or remote history. [Disabling Wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/disabling-wikis)
- Archiving makes the Wiki read-only together with the rest of the repository. Harbor must retain
  native reading/history but disable create, edit, delete, and revert. [Archiving repositories](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories)
- GitHub documents a soft limit of 5,000 total Wiki files, including non-page assets. Harbor must
  keep traversal and IPC bounded and expose truncation honestly rather than assuming a tiny Wiki.
  [About Wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis)

### Page and history workflows

- GitHub Web creates and edits a page from a title, markup mode, body, and optional edit message;
  saving produces a Git commit. Local workflows can add, edit, commit, and push the same files.
  [Adding or editing Wiki pages](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)
- GitHub's history UI shows the author, commit message, and time; it opens previous content,
  compares two revisions, and can revert the newer change when the viewer may edit. These are the
  acceptance-level history behaviors, not merely a generic commit list. [Viewing Wiki history](https://docs.github.com/en/communities/documenting-your-project-with-wikis/viewing-a-wikis-history-of-changes)
- `_Sidebar.<extension>` and `_Footer.<extension>` are documented special pages rendered as the
  Wiki sidebar and footer. They should be represented as named layout slots in the model rather
  than mixed into the ordinary page list. [Creating a Wiki footer or sidebar](https://docs.github.com/en/communities/documenting-your-project-with-wikis/creating-a-footer-or-sidebar-for-your-wiki)
- GitHub Wiki search covers title/body, repository/user/organization, and updated-date qualifiers.
  Repository-local title/body search can be added over the cached snapshot, but global and
  cross-repository search belongs to a later discovery slice. [Searching Wikis](https://docs.github.com/en/search-github/searching-on-github/searching-wikis)

GitHub's official guide only gives a clone URL after an initial page exists. After authenticated
repository metadata succeeds, treat `has_wiki=true` plus an authenticated canonical `.wiki.git`
“repository does not exist” result as `uninitialized`; do not collapse authentication, permission,
TLS, or network failures into that state. Send “Create the first page” to GitHub Web and, after it
exists, fetch the remote's actual first commit and page name instead of assuming `Home.md`. Do not
guess that an undocumented Smart HTTP push can bootstrap the server-side Wiki repository.
[Initial-page requirement](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages#cloning-wikis-to-your-computer)

Do not treat Gollum-specific files or syntax as GitHub.com contracts. The Gollum project's own
live Wiki warns that Gollum and GitHub Wikis have significantly diverged. In particular, native
page-rename redirects such as Gollum's redirect features are not documented by GitHub; defer
rename/redirect writes until a live GitHub conformance fixture proves their exact behavior.
[Gollum Wiki divergence notice](https://github.com/gollum/gollum/wiki)

## Smart HTTP URL and authentication

Derive exactly one remote URL from an authoritative GitHub repository identity:

```text
https://github.com/{url-encoded-owner}/{url-encoded-repository}.wiki.git
```

Do not accept an arbitrary Git URL from the WebView, repository content, local Git configuration,
or a redirect. The Smart HTTP protocol appends `/info/refs`, `/git-upload-pack`, and
`/git-receive-pack` to the supplied repository URL, requires ref discovery before fetch or push,
uses `git-upload-pack` for reads and `git-receive-pack` for writes, and carries old/new object IDs
for a ref update. [Git HTTP protocol](https://git-scm.com/docs/http-protocol)

Git over HTTP uses standard HTTP authentication and recommends TLS when Basic authentication is
used. GitHub supports HTTPS Git with access tokens, and GitHub Desktop's first-party description
states that its GitHub credentials are a username plus OAuth token. Harbor's existing OAuth
`repo` scope grants read/write access to public and private repository code, subject to the user's
actual permissions; no new Wiki-specific scope exists in the documented OAuth list.
[Git HTTP authentication](https://git-scm.com/docs/http-protocol#_authentication),
[HTTPS cloning with OAuth tokens](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#https-cloning-with-oauth-tokens),
[GitHub Desktop credential model](https://github.com/desktop/desktop/security/advisories/GHSA-2g23-3f32-64gr),
[OAuth `repo` scope](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)

Credential rules are non-negotiable:

1. Keep the remote URL credential-free; never place the token in URL userinfo, `.git/config`, an
   environment variable, a command argument, a log, an error payload, or an IPC model.
2. Let public fetch start anonymously. Supply a non-empty username plus the current OAuth access
   token as the password only when libgit2 asks for `USER_PASS_PLAINTEXT`.
3. Before returning credentials, parse the callback URL with a standards-compliant URL parser and
   require scheme `https`, host exactly `github.com`, the default HTTPS port, and the exact
   canonical `/{owner}/{repository}.wiki.git` path. Reject all other callbacks.
4. Disable cross-host redirects. If same-host redirects remain enabled, apply the same exact URL
   check to the effective callback URL. A 2026 libgit2 advisory showed why supplying credentials
   for the original rather than redirected host leaks tokens; this is fixed in 1.9.5, but the
   application guard remains defense in depth. [libgit2 redirect credential advisory and fix](https://github.com/libgit2/libgit2/releases/tag/v1.9.5)
5. Do not initialize submodules, execute hooks, apply checkout filters, or consult credential
   helpers. A Wiki page tree is data, not trusted Git configuration. GitHub Desktop previously
   leaked top-level OAuth credentials to a different submodule host, which is the failure class
   this rule prevents. [GitHub Desktop credential advisory](https://github.com/desktop/desktop/security/advisories/GHSA-2g23-3f32-64gr)

The only Web URLs Harbor should synthesize are the canonical repository Wiki root
`https://github.com/{owner}/{repository}/wiki` and repository Settings
`https://github.com/{owner}/{repository}/settings`, both from the authenticated repository
identity. The Wiki root is the fallback for first-page bootstrap, unsupported formats, truncated
history, and rejected writes; Settings is the fallback for enable/disable and public-edit access.
GitHub does not document a complete page-title-to-Web-slug or history/compare URL algorithm, so do
not synthesize deeper page, revision, or comparison URLs from a Git tree path. Route those cases to
the Wiki root until a canonical server URL is available. [Creating the first page](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages#adding-wiki-pages),
[disable settings workflow](https://docs.github.com/en/communities/documenting-your-project-with-wikis/disabling-wikis),
[access settings workflow](https://docs.github.com/en/communities/documenting-your-project-with-wikis/changing-access-permissions-for-wikis)

## Title, filename, format, and page identity

Use the exact root-relative Git tree path as the stable page identifier. Do not use display title,
route text, or list position as identity. GitHub documents that the filename determines the page
title and the extension determines the converter, but it does not publish a complete title-to-path
normalization or rename-redirect algorithm. [Wiki filename contract](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages#about-wiki-filenames)

For an existing page:

- `path` is the exact UTF-8 root-relative tree path, such as `Guides/Install.md`.
- `filename` is the final component, and `title` is that filename without its recognized markup
  extension. Preserve punctuation and case; do not silently replace spaces, hyphens, or underscores.
- `format` is selected strictly from the extension table below.
- `blobSha` is the immutable optimistic-concurrency guard for the page body.
- Invalid UTF-8 paths remain visible as an unsupported entry count with a GitHub Web fallback;
  never lossily rewrite them and then mutate a different path.

GitHub's open-source Markup registry currently documents these converter extensions:

| Format           | Extensions                            |
| ---------------- | ------------------------------------- |
| Markdown         | `.markdown`, `.mdown`, `.mkdn`, `.md` |
| Textile          | `.textile`                            |
| RDoc             | `.rdoc`                               |
| Org              | `.org`                                |
| Creole           | `.creole`                             |
| MediaWiki        | `.mediawiki`, `.wiki`                 |
| reStructuredText | `.rst`                                |
| AsciiDoc         | `.asciidoc`, `.adoc`, `.asc`          |
| Pod              | `.pod`                                |

Source: [GitHub Markup supported formats](https://github.com/github/markup#markups).

For create, accept a title and format but show the resulting filename before confirmation. The
first slice creates Markdown at the Wiki root and derives `<trimmed-title>.md` without replacing
spaces or punctuation. Reject empty names, `.`/`..`, control characters, path separators, absolute
paths, existing paths, case-fold collisions, names ending in a dot or space, and GitHub's documented
cross-platform forbidden title characters `\ / : * ? " < > |`. Reserve `_Sidebar` and `_Footer`
for their dedicated editors. [GitHub filename restrictions](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages#about-wiki-filenames),
[GitHub special Wiki files](https://docs.github.com/en/communities/documenting-your-project-with-wikis/creating-a-footer-or-sidebar-for-your-wiki#creating-a-footer-or-sidebar-locally)

Use a bare repository, not a worktree. This preserves Git tree path case and avoids checking out
untrusted symlinks, platform-reserved filenames, executable bits, filters, or hooks onto the user's
filesystem. It also makes every read explicitly snapshot-based by commit/tree/blob ID.
[libgit2 object and tree capabilities](https://github.com/libgit2/libgit2#what-it-can-do)

## Clone, fetch, default branch, push, and conflicts

### Cache initialization and fetch

1. Read the ordinary repository metadata with the existing authenticated Octocrab client; verify
   returned owner/name identity, `has_wiki`, `archived`, and permissions.
2. Resolve the Wiki's bare-cache directory from Tauri's `app_cache_dir`, keyed by the numeric
   repository ID returned by the authenticated metadata request, not user-controlled path
   components. Tauri exposes the application path resolver through `Manager::path`.
   [Tauri `Manager`](https://docs.rs/tauri/2.11.5/tauri/trait.Manager.html),
   [Tauri `PathResolver::app_cache_dir`](https://docs.rs/tauri/2.11.5/tauri/path/struct.PathResolver.html#method.app_cache_dir)
3. If absent, create/clone a bare repository. If present, open it only after verifying its stored
   origin URL exactly matches the derived Wiki URL; otherwise delete that one cache entry and
   reclone.
4. Connect to the fetch remote with the guarded credential callback, discover remote HEAD, and use
   the remote's advertised default branch. Never assume `main` or `master`: GitHub only promises
   that the Wiki default branch is live, while git2 exposes `Remote::default_branch` after remote
   connection. [GitHub default-branch rule](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages#adding-or-editing-wiki-pages-locally),
   [git2 `Remote::default_branch`](https://docs.rs/git2/0.21.0/git2/struct.Remote.html#method.default_branch)
5. Fetch only that branch and its complete history, without tags or other branches, into a private
   remote-tracking ref. History cannot be shallow if Harbor is to show old versions and revert them.
6. Return a snapshot headed by the fetched commit SHA. Page, history, revision, comparison, and
   asset queries include that `headSha` so one render never combines data from different fetches.

### Write transaction

All native writes use one transaction-like sequence while holding the repository lock:

1. Fetch again and rediscover the remote default branch.
2. Require the fetched head to equal `expectedHeadSha` from the editor. For update/delete/revert,
   also require the current path and blob to equal `expectedPath` and `expectedBlobSha`.
3. Build a new blob/tree/commit directly in the bare object database. The new commit's sole parent
   is the freshly verified remote head. Use the signed-in GitHub login plus a non-secret noreply
   address for author/committer, or a fixed Harbor identity if no verified email contract is added;
   do not fetch or expose private email merely for a Wiki commit.
4. Push only `<new-commit>:refs/heads/<advertised-default-branch>` without force.
5. Inspect every `push_update_reference` callback; a successful `Remote::push` call is not enough
   unless the destination ref reports no rejection. [git2 push guidance](https://docs.rs/git2/0.21.0/git2/struct.Remote.html#method.push),
   [git2 push callback](https://docs.rs/git2/0.21.0/git2/struct.RemoteCallbacks.html#method.push_update_reference)
6. Fetch and verify the remote head equals the new commit before returning success. Update query
   caches from this authoritative snapshot, then invalidate the Wiki root for reconciliation.

Because the new commit is a child of the last fetched head, a concurrent remote update makes the
normal push non-fast-forward and must be reported as `githubWikiConflict`; never force-push or
silently auto-merge Wiki edits. Git's documented default push rule allows branch updates only when
the new tip is a descendant of the old tip. Preserve the user's draft, show both head SHAs, refetch,
and let the user reapply or compare. [Git push fast-forward rule](https://git-scm.com/docs/git-push#_description)

Revert means “commit the selected path's bytes from the chosen historical commit on top of the
current verified head,” not reset or force-push history. Delete means a new commit whose tree omits
the path. Create/update/delete/revert all use the same expected-head and expected-blob guards.

## Bounded cache, concurrency, and failure policy

The following numbers are Harbor policy proposals, not GitHub limits except where explicitly cited:

- one async mutex per canonical repository; all fetch/read/write operations for that bare cache are
  serialized so a ref update cannot race a tree read or eviction;
- a global semaphore of two Git operations, because libgit2 work is blocking and pack processing is
  CPU/memory intensive;
- 64 MiB received-pack budget per operation, 64 MiB per bare repository after operation, 256 MiB
  total Wiki cache, and at most 16 cached repositories; evict least-recently-used unlocked entries;
- 1 MiB maximum text page/editor payload, 5 MiB maximum individual displayed asset, 20 MiB maximum
  aggregate displayed assets for one page, 5,000 traversed tree entries (matching GitHub's documented
  soft Wiki file limit), and 30 history rows per IPC page;
- a 2,000-commit scan budget per history page when filtering commits by exact path; return
  `truncated=true` plus the GitHub history URL rather than appearing complete;
- 30-second connect/read budget and 60-second fetch/push budget, enforced through libgit2 callbacks
  and an interrupt flag where possible.

Run every git2 call wholly inside `tokio::task::spawn_blocking`; do not carry a `Repository`,
`Remote`, callback, tree, blob, or commit across `.await`. Tokio documents that blocking work should
use `spawn_blocking`, that its default blocking-thread limit is large enough to require an explicit
semaphore for bounded workloads, and that started blocking tasks cannot be aborted. The transport's
own deadline/interrupt checks are therefore required; wrapping only the returned future in an async
timeout is insufficient. [Tokio `spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)

Cache failures are recoverable. On invalid/corrupt repository state, origin mismatch, or missing
objects, delete only that repository-ID Wiki cache entry and retry one fresh clone. Never delete
the cache root recursively. Offline reads may use the most recent verified snapshot and return
`stale=true`/`fetchedAt`; writes always require a successful fresh fetch.

## Library comparison and security gate

| Candidate                               | License and portability                                                                                                                                                                                                                                                                                                                                                                                                                  | Required capabilities                                                                                                                                                                   | Security posture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Decision                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `gix` 0.87.1                            | MIT OR Apache-2.0; pure-Rust reqwest/rustls HTTPS feature is available; current MSRV 1.85. [manifest](https://github.com/GitoxideLabs/gitoxide/blob/main/gix/Cargo.toml)                                                                                                                                                                                                                                                                 | Bare clone/fetch, refs, objects, revision walking are present; remote push and send-pack remain unchecked. [status](https://github.com/GitoxideLabs/gitoxide/blob/main/crate-status.md) | Current manifest uses `gix-pack 0.74.2`, `gix-packetline 0.22.2`, `gix-url 0.38.0`, and `gix-transport 0.59.1`, newer than the cited 2026 fixes for pack OOM/panics, packetline panic, and redirect credential leakage. [pack advisory](https://github.com/GitoxideLabs/gitoxide/security/advisories/GHSA-x494-mj8g-cj27), [packetline advisory](https://github.com/GitoxideLabs/gitoxide/security/advisories/GHSA-2vh6-hw4j-32ww), [redirect advisory](https://github.com/GitoxideLabs/gitoxide/security/advisories/GHSA-jrcm-326h-gpp8)                                          | Re-evaluate when push is released; do not build a second write transport around it. |
| `git2` 0.21 + bundled libgit2 1.9.7     | Rust wrapper MIT/Apache-2.0; libgit2 GPLv2 with linking exception; C build dependency. `vendored-libgit2` removes the system-libgit2 dependency. Its build selects Secure Transport on Apple targets and WinHTTP on Windows, while `https` enables credentials. [git2 manifest](https://github.com/rust-lang/git2-rs/blob/main/Cargo.toml), [libgit2-sys build source](https://docs.rs/crate/libgit2-sys/0.18.8%2B1.9.7/source/build.rs) | Clone/fetch/default branch/tree/blob/commit/revwalk/diff/push and credential callbacks are present. [git2 docs](https://docs.rs/git2/0.21.0/git2/)                                      | Require bundled libgit2 >=1.9.5 and ship the current patched 1.9.7 resolution. Version 1.9.5 fixed redirect credential leakage, smart-packet OOB access, unbounded delta allocation, submodule traversal, and TLS SAN comparison; 1.9.7 also fixes malicious SSH-option injection. Harbor does not enable SSH, but staying current avoids relying only on reachability analysis. [1.9.5](https://github.com/libgit2/libgit2/releases/tag/v1.9.5), [1.9.6](https://github.com/libgit2/libgit2/releases/tag/v1.9.6), [1.9.7](https://github.com/libgit2/libgit2/releases/tag/v1.9.7) | Use for this slice, behind a narrow Harbor interface.                               |
| System Git, `gh`, or bundled executable | Git itself is GPLv2 and process invocation adds installation, PATH, askpass, environment, quoting, and platform variance. [Git license](https://github.com/git/git/blob/master/COPYING)                                                                                                                                                                                                                                                  | Technically complete                                                                                                                                                                    | Credential handling becomes process-wide and harder to prove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Prohibited.                                                                         |
| Hand-written Smart HTTP/send-pack       | Harbor would own pkt-line, capabilities, pack generation, redirects, auth, cancellation, and ref-status correctness. The protocol shows the scope of that work. [HTTP protocol](https://git-scm.com/docs/http-protocol)                                                                                                                                                                                                                  | Possible in principle                                                                                                                                                                   | Recreates recently vulnerable parsing and credential paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Reject as duplicate infrastructure.                                                 |

Before merge, the lockfile and built artifact must prove `libgit2-sys` resolves to a bundled libgit2
version at least 1.9.5, `cargo audit` must be clean or have an explicit non-reachable advisory
analysis, and an OSS-license report must preserve the linking-exception notice. No SSH feature or
system `libgit2` fallback should appear in the release build.

## Harbor integration

### Existing seams to reuse

- [`GitHubService`](../src-tauri/src/github.rs) already centralizes token loading/refresh and keeps
  credentials in [`SystemCredentialStore`](../src-tauri/src/github.rs). Wiki transport must receive
  a short-lived token inside Rust through that service; it must not add another keyring record or
  expose a token-returning command.
- [`AppState`](../src-tauri/src/app_state.rs) already owns long-lived services. Add a stateful
  `GitHubWikiStore` here, initialized in Tauri `setup` from `app.path().app_cache_dir()`, rather than
  making the currently unit-like `OctocrabGitHubClient` responsible for filesystem caches.
- The GitHub backend already organizes complete business capabilities behind focused interfaces,
  as demonstrated by [`github/code.rs`](../src-tauri/src/github/code.rs) and
  [`github/code/write.rs`](../src-tauri/src/github/code/write.rs). Put Wiki models, validation,
  service orchestration, git2 adapter, fake adapter, and focused tests in
  `src-tauri/src/github/wiki.rs`; do not add Git operations to the transitional root module.
- [`github-queries.ts`](../src/features/github/github-queries.ts) already owns Tauri query contracts
  and one-minute GitHub stale time. Wiki snapshot queries should use the same query factory and
  carry `headSha` in immutable detail/history keys.
- [`github-repository-browser.tsx`](../src/features/github/github-repository-browser.tsx) already
  lazy-loads large repository tabs and locally scrolls the tab strip. Add a lazy Wiki tab there.
- [`github-readme.tsx`](../src/features/github/github-readme.tsx) already provides safe GFM/raw-HTML
  sanitization, but its relative link policy points to ordinary repository `blob`/`raw` routes.
  Extract or parameterize the safe Markdown renderer; do not reuse the repository URL resolver for
  Wiki pages or private Wiki assets.
- The existing [`react-diff-view` integration](../src/features/github/github-pull-request-files.tsx)
  is the established diff renderer. Feed it a bounded unified patch for Wiki comparisons instead
  of adding a second visual diff dependency.

### Backend interface

Keep the first interface cohesive and operation-oriented:

```rust
#[async_trait]
pub(crate) trait GitHubWikiClient: Send + Sync {
    async fn overview(&self, credential: GitHubGitCredential, target: GitHubRepositoryTarget)
        -> Result<GitHubWikiOverview, AppError>;
    async fn page(&self, credential: GitHubGitCredential, target: GitHubWikiPageTarget)
        -> Result<GitHubWikiPage, AppError>;
    async fn history(&self, credential: GitHubGitCredential, target: GitHubWikiHistoryTarget)
        -> Result<GitHubWikiRevisionPage, AppError>;
    async fn revision(&self, credential: GitHubGitCredential, target: GitHubWikiRevisionTarget)
        -> Result<GitHubWikiRevision, AppError>;
    async fn compare(&self, credential: GitHubGitCredential, target: GitHubWikiComparisonTarget)
        -> Result<GitHubWikiComparison, AppError>;
    async fn mutate(&self, credential: GitHubGitCredential, target: GitHubWikiMutationTarget)
        -> Result<GitHubWikiMutationResult, AppError>;
}
```

`GitHubGitCredential` is Rust-private, not serializable and not `Debug`; it contains the current
username and access token only for the duration of one operation. The public IPC models contain no
remote URL with userinfo and no filesystem cache path.

### IPC model

```text
GitHubWikiOverview
  status: available | disabled | uninitialized
  defaultBranch?: string
  headSha?: string
  fetchedAt?: string
  stale: boolean
  canWrite: boolean
  archived: boolean
  pages: GitHubWikiPageSummary[]
  sidebar?: GitHubWikiPageSummary
  footer?: GitHubWikiPageSummary
  unsupportedFileCount: number
  truncated: boolean
  webUrl: string

GitHubWikiPageSummary
  path, title, format, blobSha, byteSize, updatedAt?, webUrl

GitHubWikiPage
  summary, headSha, content, renderMode: markdown | sourceOnly

GitHubWikiRevisionPage
  revisions: { sha, shortSha, message, authorName?, authoredAt?, webUrl }[]
  nextCursor?: string
  truncated: boolean

GitHubWikiRevision
  path, commitSha, blobSha?, content?, deleted, renderMode, webUrl

GitHubWikiComparison
  path, baseSha, headSha, patch, additions, deletions, truncated, webUrl

GitHubWikiMutationTarget
  owner, repository, expectedHeadSha, message,
  mutation:
    create { title, format, content }
    update { path, expectedBlobSha, content }
    delete { path, expectedBlobSha }
    revert { path, expectedBlobSha, sourceCommitSha }

GitHubWikiMutationResult
  defaultBranch, headSha, commitSha, shortSha, message, page?, webUrl
```

Return `disabled` and `uninitialized` as overview states, not generic exceptions. Add stable errors
for `githubWikiConflict`, `githubWikiCacheMiss`, `githubWikiTooLarge`, and
`githubWikiUnsupportedPath`; reuse existing `githubPermission`, `githubNotConnected`, `validation`,
and filesystem error families.

Register six owned-parameter Tauri commands:

```text
github_get_repository_wiki_overview
github_get_repository_wiki_page
github_list_repository_wiki_history
github_get_repository_wiki_revision
github_compare_repository_wiki_revisions
github_mutate_repository_wiki
```

### TanStack Query contract

```text
[github, repository, owner, repository, wiki]
[github, repository, owner, repository, wiki, page, headSha, path]
[github, repository, owner, repository, wiki, history, headSha, path, cursor]
[github, repository, owner, repository, wiki, revision, commitSha, path]
[github, repository, owner, repository, wiki, compare, baseSha, headSha, path]
```

The overview owns synchronization. Detail/history queries read its immutable `headSha`. After a
mutation, seed the returned page/head, remove incompatible old-head detail caches if needed, and
invalidate the repository Wiki root. A conflict leaves the editor and every old snapshot intact.

## Smallest complete and extensible product slice

Ship the following together; dropping any item leaves a dead-end rather than a vertical workflow:

1. Repository Wiki tab with disabled, uninitialized, available, offline-stale, permission, size,
   retry, and GitHub fallback states.
2. Bare authenticated sync of the advertised Wiki default branch; page index bounded to GitHub's
   documented 5,000-file soft limit.
3. Native page reading with searchable page navigation, Markdown rendering, source view for every
   recognized text format, and custom Markdown sidebar/footer slots.
4. Markdown page create, content edit, delete confirmation, and exact-page revert with optional
   commit messages, expected-head/blob guards, non-force push, and authoritative post-push fetch.
5. Per-page history with author/message/time, previous source/rendered content, two-revision unified
   comparison, and revert.
6. GitHub Web actions for first-page bootstrap, non-Markdown create/format conversion, repository
   Wiki settings, unsupported/truncated content, and any write rejected by GitHub.
7. Wide split list/detail layout plus a narrow list-to-detail/back flow at Harbor's 900x620 desktop
   acceptance size; the existing horizontally scrolling repository tab strip remains usable.

The slice is extensible because transport, cache, domain models, IPC, query keys, and UI state are
Wiki-specific, while authentication, repository metadata, Markdown safety, diff presentation,
TanStack reconciliation, shadcn components, and desktop breakpoints reuse Harbor infrastructure.

## Rendering limitations and deferred UI

Harbor must not claim byte-for-byte GitHub rendering. GitHub's open-source Markup library performs
only format-to-HTML conversion; GitHub.com then applies private sanitization, syntax highlighting,
emoji, task lists, anchors, image caching, and autolinking. GitHub also documents math, diagrams,
maps, and 3D models for Markdown Wikis. [GitHub Markup pipeline](https://github.com/github/markup#github-markup),
[About Wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis)

GitHub's exact documented Wiki-specific subset is narrower than general MediaWiki: horizontal
rules (`---`) and shorthand symbol entities are available regardless of the page's markup language,
while transclusion, definition lists, indentation, and table-of-contents syntax are unsupported for
security and performance reasons. Its Wiki image guide promises PNG, JPEG, and GIF display. Harbor's
preview must not imply support for more, and it should preserve unsupported source bytes unchanged.
[Editing Wiki content](https://docs.github.com/en/communities/documenting-your-project-with-wikis/editing-wiki-content#supported-mediawiki-formats)

First-slice rendering contract:

- Markdown extensions render with Harbor's existing `react-markdown` + GFM + sanitized raw HTML
  pipeline and carry a visible “Harbor preview” label.
- Relative links that resolve uniquely to a page in the current snapshot navigate natively. Other
  links open GitHub through the existing external opener.
- Relative Wiki images/assets must be fetched through a bounded Rust IPC asset path and exposed as
  short-lived blob URLs; never attach an OAuth token to a WebView URL. Until that loader is present,
  show alt text and an “Open on GitHub” action rather than broken or unauthenticated private images.
- Textile, RDoc, Org, Creole, MediaWiki, reStructuredText, AsciiDoc, and Pod are source-only with a
  GitHub rendered-view fallback; Harbor does not embed Ruby, Python, Perl, or GitHub's server-side
  renderer in this slice.
- GitHub-specific math, Mermaid/GeoJSON/STL rendering, emoji expansion, mention/issue autolinks,
  generated anchors, attachment upload, and exact HTML sanitization are explicitly deferred.
- Cross-rename history following, native page rename/format conversion/redirect creation, GitHub
  account/avatar attribution from commit email, and global Wiki search are explicitly deferred.

## Verification plan and acceptance gates

### Focused Rust tests

- URL derivation rejects arbitrary schemes, ports, hosts, paths, redirects, control characters,
  and mismatched authoritative repository identities.
- Credential callback returns the token only for the exact canonical HTTPS Wiki URL and supported
  credential type; error/debug output and written config contain no token.
- Public anonymous fetch, private Basic challenge, invalid/revoked token, permission denial,
  disabled Wiki, uninitialized Wiki, and archived Wiki map to distinct stable states/errors.
- Bare tree traversal maps all documented extensions and `_Sidebar`/`_Footer`, rejects invalid UTF-8
  mutation paths, ignores non-page assets in page navigation, and enforces byte/file limits.
- Default-branch discovery does not assume `main` or `master`; only the advertised branch is fetched.
- History filters by exact path, returns stable cursors, opens previous/deleted content, produces a
  bounded unified diff, and commits a revert on top of current head.
- Create/update/delete/revert each produces one commit with the expected parent/tree; a simulated
  remote advance rejects push as `githubWikiConflict`, preserves the draft, and never force-pushes.
- Two concurrent operations against one Wiki serialize; two different Wikis obey the global
  semaphore; LRU eviction never removes a locked entry and never targets the cache root.
- Corrupt cache recovery deletes/reclones only one repository-ID entry. Offline read is marked stale;
  offline write fails before creating a success result.

The Smart HTTP fixture must be an in-process test server or checked-in protocol fixture built from
library APIs; tests must not call a system Git or `gh` executable.

### Frontend tests

- Every query factory sends exact camelCase Tauri arguments and includes `headSha` in immutable
  page/history keys.
- Markdown links select native pages only when the snapshot resolves them uniquely; unsafe HTML and
  URLs remain sanitized.
- Disabled, uninitialized, archived, permission, offline, unsupported-format, truncated-history,
  conflict, and retry states expose the correct native or GitHub fallback action.
- Mutation success reconciles the returned head/page then invalidates the Wiki root; conflict keeps
  title/body/message drafts.
- Delete and revert require shadcn confirmation with the exact page title/path; controls remain
  keyboard-accessible.

### Release gates

1. `pnpm check` passes with focused Wiki query, renderer, mutation-cache, and responsive-view tests.
2. `cargo fmt --check`, `cargo check --manifest-path src-tauri/Cargo.toml`, and the full Rust test
   suite pass on macOS, Windows, and Linux.
3. `Cargo.lock` proves `git2 0.21` and the current bundled libgit2 1.9.7 resolution (never below
   the 1.9.5 security floor); release features contain HTTPS and vendored libgit2, not SSH.
   `cargo audit` and the license report pass with the linking-exception notice retained.
4. A public fixture Wiki proves anonymous clone/fetch, page/sidebar/footer mapping, history, and
   comparison. An authenticated fixture writer proves create/update/delete/revert and
   non-fast-forward conflict without system tools.
5. A private fixture proves the existing Harbor OAuth token can read and push after login, while
   logs, IPC, cache files, crash output, and remote config contain no credential.
6. Desktop QA at 1600x1000 and 900x620 has no workspace overflow, broken tab navigation, console
   error, or warning; loading/error/empty/write/history flows are exercised.
7. GitHub Web shows every accepted native commit on the live Wiki default branch, and Harbor shows
   the same authoritative head after its verification fetch.
