# GitHub Personal Web Gap Audit

Research date: 2026-08-29. This audit covers GitHub.com workflows used by an individual
developer. Organization administration, Enterprise controls, billing, and advanced organization
security are deliberately excluded. Evidence is limited to Harbor's current source/Cairn, GitHub's
official documentation and API schema, and first-party `github/cli` source.

## Decision

Implement **native commit detail and diff** next.

Harbor already retrieves commit summaries from repository history, pull request commits, blame,
and notifications, but the two reusable commit-list surfaces still call `openExternalUrl` rather
than opening a native detail (`src/features/github/github-code-view.tsx` and
`src/features/github/github-commit-list.tsx`). This is a frequent read path, closes a visible Web
fallback, and reuses the existing Octocrab transport, `GitHubCodeClient`, TanStack Query keys,
pagination, and `react-diff-view` renderer.

Keep the slice read-only: metadata, signature state, parents, totals, and paged changed-file diffs.
Commit-comment creation/edit/delete is a separate mutation slice. It has different positioning,
permission, authorship, and stale-comment rules and should not delay the native commit page. GitHub
documents that lifecycle separately under the
[commit-comment endpoints](https://docs.github.com/en/rest/commits/comments?apiVersion=2026-03-10).

## Current baseline

The current Cairn inventory and source show native repository code browsing and file history,
Issues, pull requests and reviews, Actions, Discussions, Releases, notifications, security alerts,
Projects v2, repository relationships/settings, Gists, profile/activity, and discovery. Open PRs
also cover Insights, personal Packages, Wiki, reactions, and Issue/PR comment lifecycle. Those are
not counted again as gaps.

Useful existing seams for this slice are:

- `src-tauri/src/github/code.rs`: `GitHubCodeClient`, commit-summary/page DTOs, authenticated
  Octocrab client, validation and pagination conventions;
- `src-tauri/src/commands.rs`: thin validated Tauri command delegation;
- `src/features/github/github-queries.ts`: repository-scoped query keys/options;
- `src/features/github/github-pull-request-files.tsx`: patch normalization, `parseDiff`, unified /
  split rendering, truncation states, and paged changed-file UI;
- `src/features/github/github-data.ts`: common commit and changed-file shapes;
- `src/features/github/github-code-view.tsx`, `github-commit-list.tsx`, and
  `github-notifications.tsx`: existing commit entry points.

## Ranked missing core workflows

| Rank | Gap | User value | Fit now | Reason |
| --- | --- | --- | --- | --- |
| 1 | Native commit detail and paged diff | Very high | Very high | Every history/PR/notification commit can stay in Harbor; most DTO and diff UI infrastructure already exists. |
| 2 | Issue/PR conversation controls | High | Very high | `locked` is already loaded and rendered, but lock/unlock and subscribe/unsubscribe are absent. REST uses the shared Issue route for Issues and PRs; GraphQL exposes `viewerCanSubscribe` and `updateSubscription`. See [Issues REST](https://docs.github.com/en/rest/issues/issues?apiVersion=2026-03-10) and [GraphQL Activity](https://docs.github.com/en/graphql/reference/activity#updatesubscription). |
| 3 | Personal-repository collaborators | High, less frequent | High | Cairn previously grouped collaborators with organization administration, but personal repos officially have owner and collaborator roles. Missing: list, invite, cancel invite, remove. See [personal-repository permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository) and [collaborator REST](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10). |
| 4 | Repository label and milestone lifecycle | Medium-high | High | Harbor assigns existing values but cannot create/edit/delete the repository catalog. The official [label](https://docs.github.com/en/rest/issues/labels?apiVersion=2026-03-10) and [milestone](https://docs.github.com/en/rest/issues/milestones?apiVersion=2026-03-10) routes are bounded REST CRUD. |
| 5 | Remaining PR review controls | Medium-high | Medium-high | Mark/unmark files viewed, change base/maintainer editability, and dismiss submitted reviews remain absent. The live schema documents `markFileAsViewed` and `unmarkFileAsViewed` under [Pull requests](https://docs.github.com/en/graphql/reference/pulls). |
| 6 | Actions/repository administration | Medium | Medium | Enable/disable workflows, delete runs, and manage Actions secrets/variables are missing but require several permission and secret-value-only boundaries. See [workflow REST](https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10). |
| 7 | Codespaces, Pages, deployments, environments | Medium | Low-medium | Valuable but each is a separate product surface with plan, lifecycle, or external-editor constraints. See [Codespaces REST](https://docs.github.com/en/rest/codespaces?apiVersion=2026-03-10), [Pages REST](https://docs.github.com/en/rest/pages/pages?apiVersion=2026-03-10), and [environments REST](https://docs.github.com/en/rest/deployments/environments?apiVersion=2026-03-10). |

This is a delivery ranking, not a claim that lower rows are unimportant. Rank 1 wins because it is
both a common navigation path and a small reuse-heavy vertical slice.

## Recommended slice: native commit detail and diff

### User contract

From repository recent commits/history, pull request Commits, blame, and commit notifications, a
commit selection opens a Harbor-native detail. It must show:

- full message, full SHA with copy action, author and committer identities/dates;
- GitHub signature verification state without claiming that Harbor verified the signature;
- parent commit links, with zero, one, and multiple parents supported;
- additions, deletions, total changes, and changed-file count actually loaded;
- paged files with status, rename source, additions/deletions, blob link, and unified/split patch;
- explicit binary/no-patch, malformed-patch, truncated-page, inaccessible, and retry states;
- an “Open on GitHub” escape hatch.

All entry points must select by the immutable full SHA returned by GitHub. Do not use a branch or
tag as the detail identity even though the API accepts them.

### Exact REST contract

Use the versioned JSON endpoint:

```http
GET /repos/{owner}/{repo}/commits/{sha}?per_page=100&page={page}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
Authorization: Bearer …
```

GitHub's [Get a commit](https://docs.github.com/en/rest/commits/commits?apiVersion=2026-03-10#get-a-commit)
contract returns `200`, `404`, `409`, `422`, `500`, or `503`. The JSON response contains stable
commit metadata plus `parents`, optional `stats`, and a `files` array. Each file can include
`filename`, `previous_filename`, `status`, `additions`, `deletions`, `changes`, `blob_url`,
`raw_url`, and an optional `patch`.

The endpoint has unusual pagination: when a commit changes more than 300 files, GitHub repeats the
static commit metadata on each response and changes only `files`. Link headers expose remaining
pages, up to 3,000 files. Request 100 files per page, preserve GitHub's Link result as `hasMore`,
and never infer completeness from `files.length == 100`. Show a clear “GitHub exposes at most
3,000 changed files” boundary when the cap is reached.

Do **not** request `application/vnd.github.diff` or `.patch` for the primary UI. GitHub states that
those media types do not support pagination, large diffs may return 5xx, and binary diffs may have
no patch. The default JSON response matches Harbor's existing per-file diff model.

The response's `commit.verification` contains GitHub's `verified`, `reason`, `signature`, `payload`,
and `verified_at`. Display “Verified by GitHub” only when `verified == true`; display “Unverified”
or the documented reason otherwise. The authoritative reason vocabulary is in the same
[commit endpoint reference](https://docs.github.com/en/rest/commits/commits?apiVersion=2026-03-10#get-a-commit).

Fine-grained tokens need **Contents: read**; public repositories can be read anonymously. Harbor's
existing classic OAuth `repo` scope already covers private repository contents, so this slice must
not request a new scope.

### Harbor data boundary

Return two focused DTOs rather than exposing Octocrab models:

```text
GitHubCommitDetailPage
  commit: GitHubCommitDetail
  files: GitHubChangedFile[]
  page: u32
  hasPrevious: bool
  hasMore: bool

GitHubCommitDetail
  sha, url, message
  author?, authorLogin?, authorAvatarUrl?, authoredAt?
  committer?, committerLogin?, committerAvatarUrl?, committedAt?
  parents[{ sha, url }]
  stats?{ additions, deletions, total }
  verification?{ verified, reason, verifiedAt? }
```

The author/committer Git identities and linked GitHub accounts are distinct and nullable. Do not
substitute one silently for the other. `stats` and `patch` must remain optional. Derive the title
only for presentation from the first message line; retain the complete message.

### Backend implementation fit

- Extend the existing `GitHubCodeClient` with one paged `commit_detail` method; do not create a
  second HTTP stack.
- Validate owner/repository with existing command guards and require a 40-character hexadecimal
  SHA at the Tauri boundary. URL-encode path values using the existing route convention.
- Request page `>= 1`, cap `per_page` at 100, parse Link headers through the existing pagination
  helper, and verify every page's returned `sha` equals the requested SHA.
- When appending a later page, also verify the repeated immutable metadata matches page 1. Reject a
  mismatched repository/SHA response instead of combining it.
- Reuse the current changed-file mapper; preserve unknown future `status` strings as displayable
  values rather than failing the whole commit.
- Map `404` to inaccessible/not-found without leaking private-repository existence. Treat `409` and
  `422` as non-retryable request/resource errors; expose retry for `500`/`503`.

First-party `github/cli` does not add a special commit-view command contract here; its
[`gh api`](https://github.com/cli/cli/blob/trunk/pkg/cmd/api/api.go) implementation delegates
versioned REST requests, supports response headers and Link pagination, and treats `204` separately.
Harbor should likewise keep transport/pagination generic while owning a typed commit interface.

### Frontend implementation fit

- Add `githubQueryKeys.commitDetail({ owner, repository, sha, page })` and an infinite query whose
  next page is driven only by `hasMore`.
- Extract the non-review patch rendering from `github-pull-request-files.tsx` into a shared changed-
  file component. Keep review selection/thread state in the PR wrapper; commit detail is read-only.
- Replace external-only clicks in both commit list components with native selection. Preserve an
  explicit external-link button so clicking it never also opens the native detail.
- Let notification commit targets open the same detail, not a second implementation.
- Cache by repository plus full SHA. A commit is immutable, so use a long stale time; manual retry
  remains available for previously failed pages.
- Do not optimistically claim that all files are loaded. Show per-page loading/error affordances and
  preserve already loaded pages if a later page fails.

### Edge cases that must be designed, not patched later

- root commits have no parents; merge commits have multiple parents;
- Git author or committer may not map to a GitHub user; dates and linked avatars may be null;
- signature can be absent, invalid, unknown, expired, or temporarily unverifiable;
- `stats` can be absent and integer totals must not be recomputed from only the currently loaded page;
- renamed files can have `previous_filename`; binary/generated/oversized diffs can omit `patch`;
- a patch can be syntactically malformed for `react-diff-view`; fall back to file metadata and blob;
- a later diff page can fail while page 1 remains useful;
- a private repository can become inaccessible after the summary was cached;
- a notification reference may be stale or deleted; keep the external URL only when GitHub supplied it;
- GitHub exposes no more than 3,000 files through this endpoint.

## Verification requirements

### Rust and IPC

- fixture tests for a normal, root, and merge commit;
- null linked users, null stats, every signature state family, rename, binary/no-patch, and unknown
  file status;
- page 1/page 2 Link handling, exactly-100-file boundary, 3,000-file cap messaging, and later-page
  failure without discarding prior data;
- full-SHA/page validation, returned-SHA mismatch rejection, and repository scoping;
- status mapping for 200/404/409/422/500/503;
- saved-token delegation and exact command arguments;
- `cargo test` for the focused module and `cargo check --manifest-path src-tauri/Cargo.toml`.

### React and cache behavior

- stable repository/SHA/page query keys and `hasMore`-only next-page selection;
- each current entry point opens the same native detail; external action remains independent;
- unified/split diff, malformed patch fallback, binary state, rename label, parent navigation, copy
  SHA, loading/empty/error/retry, and partial-pagination failure;
- no review-comment controls appear in commit diff;
- focused Vitest coverage followed by `pnpm check`.

### Desktop acceptance

Use a real public commit plus a controlled repository fixture containing a root commit, merge
commit, rename, and binary file. Verify native navigation from repository history, PR commits, and a
commit notification where available. Capture 900×620 and 1600×1000 views in English and Simplified
Chinese. Require no horizontal page overflow, no clipped diff controls, no console errors, and no
unexpected external navigation.

## Immediate follow-ups after this slice

1. Issue/PR lock reason plus lock/unlock, then GraphQL subscription state/capability.
2. Personal-repository collaborators and outgoing invitations. This is explicitly in personal
   scope; only organization teams/roles/policies stay excluded. Official
   [invitation endpoints](https://docs.github.com/en/rest/collaborators/invitations?apiVersion=2026-03-10)
   cover list/cancel, while collaborator PUT/DELETE covers invite/remove.
3. Repository label and milestone CRUD.
4. Commit comments as their own lifecycle slice, reusing the completed comment UI but applying the
   commit-specific permission and position contract.
