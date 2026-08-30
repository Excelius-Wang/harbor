# GitHub commit comments research

Verified on 2026-08-30 against GitHub REST API version `2026-03-10` and the current
GitHub GraphQL schema. This slice covers comments on one immutable repository commit for an
individual developer. Organization comment policy administration stays out of scope.

## Product contract

Harbor's native commit detail should keep the complete commit-comment workflow in the app:

- list every comment for the selected full commit SHA, 100 at a time;
- create a commit-level comment or a comment on one visible diff line;
- edit or delete a comment only when GitHub says the viewer may do so;
- preserve body drafts after failed writes and require confirmation before deletion;
- render reactions through Harbor's existing reaction controls;
- keep comments whose file or diff position is no longer placeable in a separate readable list;
- retain an explicit Open on GitHub action.

Creating a comment triggers GitHub notifications and can hit the secondary rate limit when content
is created too quickly. Harbor should surface GitHub's existing rate-limit error instead of retrying
a write automatically.

## REST contract

| Operation            | Route                                                                              | Success | Fine-grained repository permission |
| -------------------- | ---------------------------------------------------------------------------------- | ------- | ---------------------------------- |
| List commit comments | `GET /repos/{owner}/{repo}/commits/{commit_sha}/comments?per_page=100&page={page}` | `200`   | Metadata: read                     |
| Get one comment      | `GET /repos/{owner}/{repo}/comments/{comment_id}`                                  | `200`   | Metadata: read                     |
| Create a comment     | `POST /repos/{owner}/{repo}/commits/{commit_sha}/comments`                         | `201`   | Contents: read                     |
| Update a comment     | `PATCH /repos/{owner}/{repo}/comments/{comment_id}`                                | `200`   | Contents: write                    |
| Delete a comment     | `DELETE /repos/{owner}/{repo}/comments/{comment_id}`                               | `204`   | Contents: write                    |

Use `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2026-03-10` for every route.
The list is ordered by ascending database ID and supports normal Link-header pagination. Harbor's
classic OAuth `repo` scope already covers private repository contents, so this slice needs no new
OAuth scope.

The create body always contains non-empty Markdown `body`. A commit-level comment omits both
`path` and `position`. A line comment sends both values. GitHub marks the `line` parameter as
closing down for this endpoint and explicitly directs clients to `position`, so Harbor must not send
`line` even though it remains in response objects.

The REST response preserves the numeric and Node IDs, commit SHA, body, optional path, optional diff
position and file line, author identity, author association, URL, and timestamps. Unknown or null
authors remain readable as deleted users.

Source: [GitHub REST commit comment endpoints](https://docs.github.com/en/rest/commits/comments?apiVersion=2026-03-10).

## Capability and scope guards

REST does not expose viewer edit/delete capabilities. Before an edit or deletion, query the REST
comment and its `CommitComment` GraphQL node. The GraphQL type implements `Deletable`, `Reactable`,
`RepositoryNode`, and `Updatable`, and exposes `commit`, `repository`, `viewerCanDelete`,
`viewerCanReact`, and `viewerCanUpdate`.

Require all of the following before writing:

- the returned REST database ID and Node ID match the requested comment;
- the REST `commit_id` equals the selected 40-character SHA;
- the GraphQL repository ID equals the selected repository's ID;
- the GraphQL commit OID equals the selected SHA;
- the REST and GraphQL updated timestamps equal the UI-observed timestamp;
- the matching viewer capability is true.

After PATCH, verify the returned ID, Node ID, commit SHA, requested body, and unchanged placement.
A `204` DELETE is authoritative after the guarded preflight. A missing or changed preflight maps to
the existing `githubCommentConflict` error so the UI can refetch without claiming success.

Source: [GitHub GraphQL CommitComment](https://docs.github.com/en/graphql/reference/commits#commitcomment).

## Diff-position rules

GitHub defines `position` as the line index in the commit diff. The first content line after the
first `@@` hunk header is position 1. Later hunk headers and no-newline markers occupy positions in
the raw patch but are not commentable rows. Harbor should derive the mapping from the exact JSON
`patch`, never from the displayed source line number.

Only a visible parsed change with an exact position may open the line-comment form. Existing
comments with no path, no position, an unavailable patch, or an unmatched position remain in the
commit-level comment list. A malformed patch disables new line placement for that file without
blocking its metadata or existing comments.

## Cache behavior

Keep mutable comments outside the long-lived immutable commit-detail cache. Cache comments below
`[github, repository, owner, repo, commit, sha, comments]`, page by REST pagination, and keep loaded
pages visible when a later page fails.

On a successful create, update, or delete, reconcile every loaded comment page by Node/database ID,
then invalidate the comment root. Update and delete conflicts refetch the comment root. Reaction
state continues through the existing repository reaction cache after adding `CommitComment` as a
supported subject kind.

## Verification

Rust tests must cover exact REST methods, paths, headers and bodies; Link pagination; nullable
authors and placement; full-SHA/page/body validation; repository, commit, ID, timestamp, capability,
and placement guards; create/update/delete response verification; 403/404/422 and secondary-rate-
limit mapping; saved-token delegation; and Tauri command arguments.

Frontend tests must cover query keys, next-page selection, cache reconciliation, raw-patch position
mapping across multiple hunks and no-newline markers, unplaceable comments, independent external
navigation, edit/delete conflict refresh, retained drafts, reactions, loading/empty/error/retry, and
partial-pagination failure. Focused checks are followed by the complete Harbor frontend and Rust
verification suite before review.
