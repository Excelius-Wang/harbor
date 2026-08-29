# GitHub Comment Lifecycle Research

Research date: 2026-08-29. This note uses only GitHub's official documentation, the live
GitHub.com GraphQL schema, GitHub's first-party REST OpenAPI description, and first-party
`github/cli` source. It covers ordinary Issue comments, ordinary pull request Conversation comments,
and submitted pull request review comments or replies. Pending-review drafts and review-summary
bodies already have separate Harbor lifecycles and remain outside this boundary.

## Recommendation

Implement one focused GraphQL comment-lifecycle boundary with three explicit subject kinds:

- `IssueComment`: an ordinary comment whose `pullRequest` is null;
- `PullRequestConversationComment`: also GraphQL `IssueComment`, but its `pullRequest.number` must
  match the selected pull request;
- `PullRequestReviewComment`: a line/file review comment or reply whose `state` is `SUBMITTED`.

For every edit or deletion, resolve the selected repository and exact comment node together, verify
the repository node ID, concrete type, parent number, capability, and displayed revision, then call
the matching mutation. Use opaque GraphQL node IDs throughout. This follows the same GraphQL
`IssueComment` mutation path used by current GitHub CLI while adding the repository, parent, stale
revision, and capability checks required for an exact per-comment desktop action.

REST remains a valid transport and may be reused where Harbor already has a focused Adapter, but it
does not expose `viewerCanUpdate`, `viewerCanDelete`, or review-comment `state`. A REST write should
therefore use the same GraphQL preflight. Do not introduce a second generic HTTP client.

## Exact API map

| Harbor subject | REST update/delete | GraphQL update | GraphQL delete |
| --- | --- | --- | --- |
| Issue comment | `PATCH` / `DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}` | `updateIssueComment(input: {id, body})` | `deleteIssueComment(input: {id})` |
| PR Conversation comment | Same Issue-comment route | Same `IssueComment` mutation | Same `IssueComment` mutation |
| Submitted inline/file review comment or reply | `PATCH` / `DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}` | `updatePullRequestReviewComment(input: {pullRequestReviewCommentId, body})` | `deletePullRequestReviewComment(input: {id})` |

GitHub explicitly states that ordinary pull request comments use the Issue-comments API, while Diff
comments use the pull request review-comments API. The update REST calls accept a required `body`
and return `200` with the complete updated comment; deletion returns `204 No Content`. Review-comment
deletion also documents `404`. See the official
[Issue-comment endpoints](https://docs.github.com/en/rest/issues/comments?apiVersion=2026-03-10#update-an-issue-comment),
[review-comment endpoints](https://docs.github.com/en/rest/pulls/comments?apiVersion=2026-03-10#update-a-review-comment-for-a-pull-request),
and [working-with-comments guide](https://docs.github.com/en/rest/guides/working-with-comments).

The equivalent GraphQL operations and inputs are documented under
[Issues](https://docs.github.com/en/graphql/reference/issues#updateissuecomment) and
[Pull requests](https://docs.github.com/en/graphql/reference/pulls#updatepullrequestreviewcomment).
`deleteIssueComment` returns only `clientMutationId`; `deletePullRequestReviewComment` additionally
offers the deleted comment and its review. All four mutation root fields and their returned comment
fields are nullable in the 2026-08-29 live schema. Reject GraphQL `errors`, a null mutation payload,
or a null updated entity; never equate HTTP 200 with a successful GraphQL write.

## Live GraphQL schema facts

Live introspection on 2026-08-29 confirmed that both `IssueComment` and
`PullRequestReviewComment` implement `Node`, `RepositoryNode`, `Updatable`, `UpdatableComment`,
`Deletable`, `Minimizable`, and `Reactable`. Both expose:

- non-null `id`, `body`, `updatedAt`, `isMinimized`, `viewerCanUpdate`, `viewerCanDelete`, and
  `viewerDidAuthor`;
- nullable `author`, `editor`, `lastEditedAt`, `minimizedReason`, and `fullDatabaseId`;
- non-null `repository`, plus parent fields needed for exact scope validation;
- non-null `viewerCannotUpdateReasons`.

`fullDatabaseId` is a `BigInt` and should replace any new dependency on GraphQL `databaseId`; the
review-comment `databaseId: Int` field is explicitly deprecated. Prefer the opaque node ID for
GraphQL writes and retain REST's numeric `id` only where an existing REST Adapter needs it. GitHub
warns that global IDs have multiple formats and must not be decoded in its
[global-ID migration guide](https://docs.github.com/en/graphql/guides/migrating-graphql-global-node-ids).

`PullRequestReviewComment.state` is the non-null enum `PENDING | SUBMITTED`; `outdated` is a
separate non-null boolean. Its `pullRequest` and `repository` are non-null, while
`pullRequestReview` is nullable. Scope against the pull request and repository, not the optional
review object. `IssueComment.issue` is non-null and `pullRequest` is nullable; a live query against a
PR Conversation comment returned the same parent number through both fields, so the nullable
`pullRequest` field is the discriminator between an Issue and pull request conversation.

GitHub publishes the capability and object contract in the
[`IssueComment`](https://docs.github.com/en/graphql/reference/issues#issuecomment) and
[`PullRequestReviewComment`](https://docs.github.com/en/graphql/reference/pulls#pullrequestreviewcomment)
references. The live introspection process follows GitHub's official
[schema-discovery guidance](https://docs.github.com/en/graphql/guides/introduction-to-graphql#discovering-the-graphql-api).

## Capability, ownership, and permission policy

Use `viewerCanUpdate` and `viewerCanDelete` as UI gates and recheck the relevant flag immediately
before transport. `viewerDidAuthor` is ownership metadata, not an authorization rule. GitHub permits
anyone with repository write access to edit or delete comments for moderation, while the author can
also have capabilities according to the selected subject state. GitHub documents this Web behavior,
the permanent nature of deletion, and the visible deletion timeline event in
[Managing disruptive comments](https://docs.github.com/en/communities/moderating-comments-and-conversations/managing-disruptive-comments).

The current `CommentCannotUpdateReason` values are `ARCHIVED`, `INSUFFICIENT_ACCESS`, `LOCKED`,
`LOGIN_REQUIRED`, `MAINTENANCE`, `VERIFIED_EMAIL_REQUIRED`, and `DENIED`.
`INSUFFICIENT_ACCESS` says the viewer must be the author or have repository write access. Use these
values for focused edit feedback; there is no parallel delete-reason list, so a false
`viewerCanDelete` should remain authoritative without an invented explanation.

Fine-grained token requirements are:

- Issue/PR Conversation comment update or delete: at least one of Issues: write or Pull requests:
  write, as listed on the Issue-comment REST operations;
- review-comment update or delete: Pull requests: write.

Harbor's OAuth App `repo` scope covers private and public repository Issues and pull requests;
`public_repo` is the public-only alternative. Scopes only limit a token and never grant rights the
viewer lacks. Users may also grant fewer scopes than requested. Preserve permission errors and offer
reconnection only when the scope is actually missing. See GitHub's
[OAuth scope reference](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

For REST, send `Accept: application/vnd.github+json` and pin
`X-GitHub-Api-Version: 2026-03-10`. GitHub currently supports `2026-03-10` and `2022-11-28`; the
latter remains supported through 2028-03-10. GraphQL is not date-versioned. See
[REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2026-03-10).

## Required preflight and validation

Use one query shaped like this before either operation:

```graphql
query HarborCommentTarget($owner: String!, $repository: String!, $id: ID!) {
  selected: repository(owner: $owner, name: $repository) { id }
  node(id: $id) {
    __typename
    ... on IssueComment {
      id body updatedAt isMinimized minimizedReason
      viewerCanUpdate viewerCanDelete viewerCannotUpdateReasons viewerDidAuthor
      repository { id }
      issue { number }
      pullRequest { number }
    }
    ... on PullRequestReviewComment {
      id body updatedAt isMinimized minimizedReason outdated state
      viewerCanUpdate viewerCanDelete viewerCannotUpdateReasons viewerDidAuthor
      repository { id }
      pullRequest { number }
    }
  }
}
```

Fail closed unless all applicable checks pass:

1. The selected repository and comment node are non-null and the response has no relevant errors.
2. Returned `id` equals the requested opaque ID.
3. `__typename` equals the caller's exact GraphQL kind.
4. Comment `repository.id` equals `selected.id`.
5. Parent number equals the currently open Issue or pull request.
6. An Issue comment requires `pullRequest == null`; a PR Conversation comment requires a matching
   non-null `pullRequest`; a review comment requires `state == SUBMITTED`.
7. The requested action's `viewerCan*` flag is true.
8. For updates, the returned `updatedAt` equals the caller's `expectedUpdatedAt`.

The mutation input itself contains no repository or parent identity, and the REST edit/delete routes
contain no Issue or pull request number. That makes the preflight parent check essential, not merely
defensive polish. A stale or compromised WebView must not be able to redirect a visible action to a
different comment in the same repository.

After update, request the same identity, parent, capability, body, and revision fields in the
mutation payload. Require exact ID/type/repository/parent matches and the requested body before
replacing caches. Supply a unique `clientMutationId` and verify its echo. After deletion, require the
non-null payload and matching `clientMutationId`, then refetch the parent timeline or complete review
thread collection; `deleteIssueComment` has no returned entity with which to verify scope.

## Stale writes, retries, and deletion

Neither REST update route nor either GraphQL update input accepts an expected revision, body, or
other compare-and-swap value. GitHub says conditional requests for unsafe methods such as `PATCH`
and `DELETE` are unsupported unless an endpoint explicitly says otherwise; these endpoints do not.
An `expectedUpdatedAt` preflight is therefore a useful best-effort stale guard, but a race remains
between the read and mutation. Do not describe it as atomic. See GitHub's
[REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests).

Serialize writes per comment. If the requested body already equals the authoritative body, return
the current record without creating another edit-history entry. On conflict or failure, keep the
editor text and offer reload or explicit retry. An absent node or REST 404 can mean deleted,
inaccessible, or foreign; never treat a bare null/404 as proof that a deletion succeeded. After an
ambiguous timeout, refetch the accessible parent before offering another delete.

Deletion is irreversible and should always use the existing destructive confirmation. A successful
ordinary deletion can create a `CommentDeletedEvent`; review-thread topology after deleting a root
comment with replies is not promised by the API. Refetch rather than inventing a tombstone or merely
splicing one cached row. Remove the deleted subject's reaction cache only after authoritative
absence is established.

## Null and presentation behavior

- GraphQL `author` and REST `user` can be null; render the existing deleted-user fallback and never
  authorize by login comparison.
- A minimized comment is not deleted. Keep its body and collapsed presentation, and expose Edit or
  Delete only from the current capability fields. Minimization has its own mutations.
- `outdated`, thread resolution, parent state, and minimization do not imply editability. Trust
  `viewerCanUpdate` and `viewerCanDelete`.
- The initial Issue or pull request body is not an `IssueComment` and cannot use these delete
  mutations; Harbor's existing Issue/PR content editor remains the correct path.
- REST Issue comments contain `id: int64`, `node_id`, `issue_url`, nullable `user`, and nullable
  `minimized`; REST review comments add nullable `pull_request_review_id`, `pull_request_url`, and
  diff coordinates. Model optional actors and legacy coordinates defensively.

The exact current schemas are also published by GitHub in its first-party OpenAPI description:
[Issue-comment routes](https://github.com/github/rest-api-description/blob/3fa67306b30ebd736a08604ff8b8932a34f68ddf/descriptions-next/api.github.com/api.github.com.2026-03-10.yaml#L46882)
and [review-comment routes](https://github.com/github/rest-api-description/blob/3fa67306b30ebd736a08604ff8b8932a34f68ddf/descriptions-next/api.github.com/api.github.com.2026-03-10.yaml#L51645).

## First-party GitHub CLI precedent

Current `gh issue comment` and `gh pr comment` edit or delete only the last ordinary comment authored
by the viewer. They do not target inline review comments:

- the shared model filters with `viewerDidAuthor` in
  [`api/queries_comments.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/api/queries_comments.go#L18-L25);
- both commands use GraphQL `updateIssueComment` and `deleteIssueComment` in
  [the same file](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/api/queries_comments.go#L82-L124);
- editing seeds the current body and preserves an explicitly empty `--body ""` in
  [`commentable.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/pr/shared/commentable.go#L274-L342);
- deletion warns that it cannot be recovered and requires confirmation, with `--yes` required for
  noninteractive use, in
  [`commentable.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/pr/shared/commentable.go#L363-L407).

The current CLI query asks for only `comments(first: 100)` and then chooses the last viewer-authored
entry. Harbor should reuse the exact GraphQL mutation and confirmation patterns, not the CLI's
last-own-comment or 100-comment limitation. Harbor already renders exact comment nodes, so actions
should be per-comment and gated by GitHub's `viewerCan*` values. The public command contracts are in
the [`gh issue comment`](https://cli.github.com/manual/gh_issue_comment) and
[`gh pr comment`](https://cli.github.com/manual/gh_pr_comment) manuals.

## Harbor implementation contract

Add a focused Interface rather than expanding the root GitHub module:

```text
comment_target(token, repository, parent_kind, parent_number, subject_ref) -> CommentTarget
update_comment(token, repository, parent, subject_ref, expected_updated_at, body) -> CommentTarget
delete_comment(token, repository, parent, subject_ref, expected_updated_at) -> DeleteResult
```

The module should own the closed subject-kind enum, GraphQL documents, scope and capability guards,
stale-conflict mapping, mutation verification, Octocrab transport, fake Adapter, and focused tests.
Keep pending review comments behind the existing pending-review Interface and reject `PENDING` here.

On update, replace the comment in Issue timeline, PR Conversation, or review-thread caches before a
focused invalidation. On delete, invalidate and reload the complete parent timeline/thread, adjust
list counts only from authoritative parent data, and remove the deleted reaction subject. Preserve
edit drafts across permission, rate-limit, stale, and transport errors.

Focused tests should prove exact type and parent discrimination, repository-node scoping, nullable
payload rejection, `SUBMITTED` enforcement, capability gates, optional actors, minimized/outdated
independence, expected-revision conflicts, explicit empty-body transport, response-body verification,
serialized writes, irreversible confirmation, cache replacement, and full parent refetch after
deletion. A desktop fixture should exercise all three kinds, a moderator action on another user's
comment, a stale-edit conflict, permission failure with retained text, and deletion at both supported
viewport sizes.
