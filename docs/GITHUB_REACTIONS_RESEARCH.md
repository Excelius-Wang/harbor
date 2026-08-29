# GitHub Reactions Research

Research date: 2026-08-29. This note uses only current GitHub documentation and first-party
`github/cli` source. It covers Harbor's existing personal-developer surfaces: Issues, pull request
conversation and review comments, Discussions, and Releases. Commit comments, Team discussions,
organization administration, and Enterprise administration are intentionally out of scope.

## Recommendation

Implement one native GraphQL reaction boundary around GitHub's `Reactable` interface. It is the only
documented API surface that covers every Harbor target, including pull request review summaries and
repository Discussions. It also returns the two pieces REST summaries cannot provide directly:
`viewerCanReact` and `viewerHasReacted`. The interface currently covers `Issue`, `IssueComment`,
`PullRequest`, `PullRequestReview`, `PullRequestReviewComment`, `Discussion`, `DiscussionComment`,
`Release`, and `CommitComment`; Harbor should accept the first eight and explicitly reject
`CommitComment` until it has a native commit-comment surface. The complete schema contract is in the
[official GraphQL Reactions reference](https://docs.github.com/en/graphql/reference/reactions).

Use a read-before-write, desired-state operation rather than a blind toggle:

1. Resolve the selected repository and reaction subject in one query.
2. Verify repository node ID, exact `__typename`, `viewerCanReact`, and current viewer state.
3. Return immediately if the requested state is already authoritative.
4. Otherwise call `addReaction` or `removeReaction` and verify the returned subject ID, type, and
   requested `viewerHasReacted` state.
5. Replace optimistic data with the mutation's complete authoritative `reactionGroups` result.

This keeps the WebView from choosing API routes, prevents a global node ID from escaping the selected
repository, makes retries idempotent at Harbor's Service boundary, and fits the project's existing
Tauri, GitHub client, TanStack Query, and shadcn architecture.

## Exact subject map

| Harbor surface                                      | GraphQL subject            | Repository-scope field             | REST alternative                                                                          |
| --------------------------------------------------- | -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Issue body                                          | `Issue`                    | `repository { id }`                | `/repos/{owner}/{repo}/issues/{issue_number}/reactions`                                   |
| Pull request body                                   | `PullRequest`              | `repository { id }`                | The same Issues route; GitHub models every pull request as an issue for shared operations |
| Issue or ordinary pull request conversation comment | `IssueComment`             | `repository { id }`                | `/repos/{owner}/{repo}/issues/comments/{comment_id}/reactions`                            |
| Submitted pull request review summary               | `PullRequestReview`        | `repository { id }`                | None documented                                                                           |
| Inline pull request review comment or reply         | `PullRequestReviewComment` | `repository { id }`                | `/repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions`                             |
| Discussion body                                     | `Discussion`               | `repository { id }`                | None documented                                                                           |
| Discussion top-level comment or nested reply        | `DiscussionComment`        | `discussion { repository { id } }` | None documented                                                                           |
| Release body                                        | `Release`                  | `repository { id }`                | `/repos/{owner}/{repo}/releases/{release_id}/reactions`                                   |

The GraphQL reference lists all of these concrete types as implementations of `Reactable`.
`IssueComment` exposes both `issue` and a nullable `pullRequest`, so the same type correctly represents
ordinary comments in either conversation. `DiscussionComment` is the exception to the direct
repository-field pattern: its `discussion` is nullable, so a missing discussion or repository must
fail closed. See the official object references for
[Issues](https://docs.github.com/en/graphql/reference/issues#issuecomment),
[Pull requests](https://docs.github.com/en/graphql/reference/pulls),
[Discussions](https://docs.github.com/en/graphql/reference/discussions#discussioncomment), and
[Releases](https://docs.github.com/en/graphql/reference/releases).

GitHub documents ordinary Issue and pull request comments together, while distinguishing pull request
review comments, in its [REST Issue comments reference](https://docs.github.com/en/rest/issues/comments).
The REST reaction catalog contains routes for Issues, Issue comments, pull request review comments,
and Releases, but no routes for `PullRequestReview`, `Discussion`, or `DiscussionComment`.
[GitHub's REST Reactions reference](https://docs.github.com/en/rest/reactions/reactions?apiVersion=2026-03-10)
is therefore useful as a compatibility and error-semantics reference, not as Harbor's shared
implementation boundary.

### Review and Discussion distinctions

- A pull request body is `PullRequest`, an ordinary conversation comment is `IssueComment`, a review
  summary is `PullRequestReview`, and an inline thread entry is `PullRequestReviewComment`. A review
  thread itself is not `Reactable`; render controls on each comment in the thread.
- Pending inline comments still have `PullRequestReviewComment` nodes. Do not infer that a pending,
  outdated, resolved, minimized, locked, open, or closed object can accept reactions; render the
  authoritative `viewerCanReact` state.
- A Discussion upvote is not a thumbs-up reaction. `Discussion` and `DiscussionComment` independently
  implement `Votable` and `Reactable`; retain Harbor's existing `addUpvote`/`removeUpvote` control and
  add a separate reaction bar. The distinct mutations and interfaces are documented in the
  [GraphQL Discussions reference](https://docs.github.com/en/graphql/reference/discussions).

## Vocabulary and wire mapping

For Issues, pull requests, reviews, and comments, GitHub supports eight values. REST and GraphQL use
different spellings; the emoji mapping below also matches the first-party GitHub CLI implementation
in [`api/reaction_groups.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/api/reaction_groups.go#L33-L59).

| Harbor enum  | GraphQL `ReactionContent` | REST `content` | UI glyph |
| ------------ | ------------------------- | -------------- | -------- |
| `ThumbsUp`   | `THUMBS_UP`               | `+1`           | 👍       |
| `ThumbsDown` | `THUMBS_DOWN`             | `-1`           | 👎       |
| `Laugh`      | `LAUGH`                   | `laugh`        | 😄       |
| `Hooray`     | `HOORAY`                  | `hooray`       | 🎉       |
| `Confused`   | `CONFUSED`                | `confused`     | 😕       |
| `Heart`      | `HEART`                   | `heart`        | ❤️       |
| `Rocket`     | `ROCKET`                  | `rocket`       | 🚀       |
| `Eyes`       | `EYES`                    | `eyes`         | 👀       |

`Release` is a deliberate exception. Its official REST contract accepts only `+1`, `laugh`, `heart`,
`hooray`, `rocket`, and `eyes`; `-1` and `confused` are not allowed. Although GraphQL uses the shared
`ReactionContent` enum, the enum cannot express this subject-specific restriction. Harbor should
therefore expose six choices for `Release` and reject the other two in Rust before making a mutation.
The per-route vocabulary is documented in the
[REST Reactions reference](https://docs.github.com/en/rest/reactions/reactions?apiVersion=2026-03-10).

Treat the order above as Harbor presentation policy, not an API invariant. Map groups by enum value,
accept a nullable or sparse `reactionGroups` list, and treat a missing content as count zero with
`viewerHasReacted = false`. Do not parse a node ID prefix to derive its type. GitHub explicitly says
global node IDs are opaque, supports more than one ID format, and warns that prefix decoding will
break; use `__typename` instead.
[GitHub's node ID migration guide](https://docs.github.com/en/graphql/guides/migrating-graphql-global-node-ids)
owns that guarantee.

## Counts, viewer state, and identities

The minimal authoritative group selection is:

```graphql
reactionGroups {
  content
  viewerHasReacted
  reactors { totalCount }
}
```

`ReactionGroup.viewerHasReacted` is the authenticated viewer's membership in that content group.
`reactors.totalCount` is the complete count for the group. Use `reactors`, not the deprecated
`users`: a reactor can be a `User`, `Bot`, `Mannequin`, or `Organization`, whereas `users` excludes
those additional actor kinds. `Reactable.viewerCanReact` is the authoritative write capability.
The schema also exposes a paginated `reactions(content:, orderBy:)` connection and individual
`Reaction` nodes with `id`, nullable `databaseId`, `content`, `createdAt`, and `user`, but Harbor does
not need them for a count-and-toggle UI. These semantics and nullabilities are in the
[GraphQL Reactions reference](https://docs.github.com/en/graphql/reference/reactions).

The first-party GitHub CLI currently reads reaction groups on Issue comments and review summaries,
then renders nonzero groups. See
[`api/query_builder.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/api/query_builder.go#L42-L59),
[`api/queries_pr_review.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/api/queries_pr_review.go#L38-L46), and
[`pkg/cmd/pr/shared/reaction_groups.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/pr/shared/reaction_groups.go#L10-L32).
Its current query still selects deprecated `users.totalCount` and does not select viewer state, so it
is evidence for surface coverage and emoji presentation, not a contract Harbor should copy. The CLI's
Discussion client likewise maps reaction groups on the post, comments, and replies in
[`pkg/cmd/discussion/client/client.go`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/discussion/client/client.go#L447-L523).

### Delete identity

REST delete routes require the numeric `reaction_id` in addition to repository and subject identity.
A count summary is insufficient: Harbor would have to list reactions, paginate, find the current
viewer and content, retain that exact reaction ID, and then call `DELETE .../reactions/{reaction_id}`.
The REST create response returns the reaction object; a duplicate create returns the existing one.
These route and response requirements are specified in the
[REST Reactions reference](https://docs.github.com/en/rest/reactions/reactions?apiVersion=2026-03-10).

GraphQL removal instead takes exactly `subjectId: ID!` and `content: ReactionContent!`. Because the
input contains no actor or reaction ID, it operates on the authenticated viewer's reaction for that
subject and content; this is the only possible actor identity represented by the contract. The
mutation returns the removed `reaction`, updated `reactionGroups`, and `subject`. This follows from
the official [`RemoveReactionInput` and payload](https://docs.github.com/en/graphql/reference/reactions#removereaction).
Harbor should still read first and skip removal when `viewerHasReacted` is already false, because the
reference does not promise a special idempotent response for an absent reaction.

## Read and mutation contracts

### Scoped batch read

Existing Harbor REST models already preserve global `node_id` values for Issue bodies, pull request
bodies, ordinary comments, and review timeline events; review-thread comments and Discussions already
use GraphQL IDs. Release and review models should preserve their GraphQL node IDs as well. GitHub
documents that a REST `node_id` and GraphQL `id` identify the same object and recommends persisting
the global ID for API interoperability in
[Using global node IDs](https://docs.github.com/en/graphql/guides/using-global-node-ids).

Hydrate the subjects already present on one parent page in a single bounded `nodes(ids:)` query. The
query shape below was checked against GitHub's current API schema; GitHub publishes that schema and
supports direct introspection from the API on its
[Public schema page](https://docs.github.com/en/graphql/overview/public-schema). The query must also
resolve the selected repository so the comparison uses node identity, not a mutable name:

```graphql
query HarborReactionSubjects($owner: String!, $repository: String!, $ids: [ID!]!) {
  selected: repository(owner: $owner, name: $repository) {
    id
  }
  nodes(ids: $ids) {
    __typename
    ... on Reactable {
      id
      viewerCanReact
      reactionGroups {
        content
        viewerHasReacted
        reactors {
          totalCount
        }
      }
    }
    ... on Issue {
      repository {
        id
      }
    }
    ... on IssueComment {
      repository {
        id
      }
    }
    ... on PullRequest {
      repository {
        id
      }
    }
    ... on PullRequestReview {
      repository {
        id
      }
    }
    ... on PullRequestReviewComment {
      repository {
        id
      }
    }
    ... on Discussion {
      repository {
        id
      }
    }
    ... on DiscussionComment {
      discussion {
        repository {
          id
        }
      }
    }
    ... on Release {
      repository {
        id
      }
    }
  }
}
```

For every requested subject, require all of the following before exposing it to a write command:

- the returned node is non-null and implements `Reactable`;
- `__typename` exactly matches the caller's closed `ReactionSubjectKind`;
- the type is one of Harbor's eight supported kinds, not merely any `Reactable` implementation;
- its repository node ID equals `selected.id`;
- a `DiscussionComment` has a non-null `discussion.repository`;
- the returned `id` is retained as an opaque string and matches the requested node ID.

Reject the entire write preflight on a missing repository, missing subject, type mismatch, or
repository mismatch. For a batch read, returning per-subject absence is acceptable for objects that
were deleted between parent and reaction requests, but it must not silently authorize a mutation.

### Desired-state mutation

Use the official generic inputs and return the whole updated group snapshot:

```graphql
mutation HarborAddReaction($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: { subjectId: $subjectId, content: $content }) {
    subject {
      __typename
      id
      viewerCanReact
    }
    reactionGroups {
      content
      viewerHasReacted
      reactors {
        totalCount
      }
    }
  }
}
```

`removeReaction` has the same shape with `RemoveReactionInput`. `addReaction` and `removeReaction`,
their required inputs, and nullable payload fields are defined in the
[GraphQL Reactions reference](https://docs.github.com/en/graphql/reference/reactions).

After either mutation, reject a null payload or subject, GraphQL `errors`, a different subject ID or
type, duplicate/unknown groups, an impossible `viewerHasReacted = true` with count zero, or a returned
viewer state different from the requested desired state. Do not mistake HTTP 200 for GraphQL success:
GitHub can return HTTP 200 with an error for primary and secondary rate limits, and resource-limited
queries can return partial data plus errors.
[GitHub's GraphQL rate and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
document both behaviors.

## Authentication, headers, and permissions

Harbor's existing OAuth `repo` scope is sufficient for public and private repository reaction reads
and writes, subject to the signed-in user's own repository access. A public-only client can request
`public_repo`. Scopes limit a token but do not add permissions the user does not possess. GitHub's
[OAuth scope reference](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
documents those semantics, and its
[Discussions GraphQL guide](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)
explicitly requires `repo` for private repositories or `public_repo` for public repositories. No
organization or administrative scope is needed for this slice.

For GraphQL, send the OAuth token as `Authorization: Bearer TOKEN` to
`https://api.github.com/graphql`; the GraphQL API is not selected with a REST version header. GitHub's
[GraphQL client guide](https://docs.github.com/en/graphql/guides/using-graphql-clients) documents the
endpoint and header. Always honor `viewerCanReact`; neither the OAuth scope nor a successful read
proves that the current subject is writable.

If Harbor ever uses the REST fallback with fine-grained tokens, the documented repository permissions
are:

| REST subject                                                                  | List                                                        | Create and delete                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Issue or Issue comment, including ordinary pull request conversation comments | Issues: read                                                | Issues: write                                               |
| Pull request review comment                                                   | Pull requests: read                                         | Pull requests: write                                        |
| Release                                                                       | No repository permission required by the fine-grained token | No repository permission required by the fine-grained token |

Public list operations can be unauthenticated; create and delete operations need an authenticated
actor. Send `Accept: application/vnd.github+json`, `Authorization: Bearer TOKEN`, and
`X-GitHub-Api-Version: 2026-03-10`. The route-specific permission matrix and recommended media type
are in the [REST Reactions reference](https://docs.github.com/en/rest/reactions/reactions?apiVersion=2026-03-10).
GitHub currently supports REST versions `2026-03-10` and `2022-11-28`; an omitted version still
defaults to `2022-11-28`, while an unsupported retired version returns 410. Pin the current version
rather than relying on that default, as described in
[GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2026-03-10).

## Pagination, limits, and request policy

- REST list routes use `page` and `per_page`, default to 30, and cap `per_page` at 100. Follow the
  `Link` header until complete if individual reactors or a REST delete ID is ever needed.
- `reactionGroups` is a small non-connection list, so the count-and-viewer query has no reaction
  pagination. A future actor popover must paginate `reactors(first:, after:)`; GraphQL connections
  require `first` or `last` from 1 through 100.
- Bound a Harbor `nodes(ids:)` hydration batch to 100 opaque, deduplicated IDs. This is a local safety
  limit aligned with current parent page sizes, not a claimed GitHub `nodes` argument maximum.
  Do not load reactions for unmounted pages.
- A GraphQL call cannot request more than 500,000 nodes, and GitHub warns specifically against
  fetching all comments, reactions, and related Issues in a large nested query. Asking only for group
  totals avoids reactor nodes. GraphQL pagination and node limits are documented in
  [Using pagination](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api)
  and [Rate and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api).
- An OAuth user has a primary GraphQL budget of 5,000 points per hour and a separate authenticated
  REST budget of 5,000 requests per hour. Secondary limits are shared: at most 100 concurrent API
  requests, 2,000 GraphQL points per minute, and generally no more than 80 content-generating
  requests per minute or 500 per hour. A GraphQL request with a mutation costs five secondary-limit
  points. GitHub recommends avoiding concurrent mutations and pausing at least one second between
  mutative requests. These ceilings can change, so use response headers rather than hard-coded retry
  timing. See the official [GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
  and [REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

Serialize user reaction writes, never poll reaction state, and never retry a mutation in a hot loop.
On a rate limit, honor `Retry-After`; otherwise use `x-ratelimit-reset` when remaining is zero, or wait
at least one minute and then apply bounded exponential backoff. A user click after the wait is safer
than a background retry that may surprise them.

## Stable success and error behavior

REST create is explicitly idempotent: 201 means a reaction was created and 200 means that viewer's
same reaction already existed. Both are success. The documented create error is 422 for validation
failure or spam detection; it is not a distinct conflict signal. List returns 200, with 404 for a
missing subject and an additional 410 documented for the Issue route. Delete documents 204 and
requires an exact reaction ID. These statuses are route-specific in the
[REST Reactions reference](https://docs.github.com/en/rest/reactions/reactions?apiVersion=2026-03-10).

GraphQL does not document equivalent duplicate or absent-removal status codes. Make Harbor's public
operation stable instead:

- `set_reaction(..., reacted: true)` returns the preflight snapshot without writing when already true;
- `set_reaction(..., reacted: false)` returns it without writing when already false;
- permission failure is based on `viewerCanReact` for addition and on any mutation error for removal;
- `NOT_FOUND`, null node, unsupported type, expected-kind mismatch, and repository mismatch remain
  distinct validation/not-found outcomes rather than generic permission errors;
- rate-limit responses preserve retry metadata; a transport timeout after dispatch is ambiguous, so
  refetch authoritative state before offering or attempting another write;
- never accept partial GraphQL data when the response also contains errors for the reaction operation.

For REST, primary exhaustion returns 403 or 429; GraphQL primary exhaustion can remain HTTP 200 with
an error. Secondary exhaustion can return REST 403/429 or GraphQL 200/403. Keep Harbor's stable IPC
codes based on the response body and rate headers, not HTTP status alone. The exact response rules are
in GitHub's [REST](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
and [GraphQL](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
limit documentation.

## Harbor module and cache design

Add a focused deep module, for example `github/reaction.rs`, behind a two-method interface:

```text
reaction_subjects(token, repository, [(subject_id, expected_kind)]) -> [ReactionSubject]
set_reaction(token, repository, subject_id, expected_kind, content, reacted) -> ReactionSubject
```

The module should own:

- `ReactionContent`, `ReactionSubjectKind`, `ReactionGroup`, and `ReactionSubject` models;
- the eight-kind allowlist and the six-value Release vocabulary;
- opaque ID validation, a 100-subject batch bound, and deduplication;
- the scoped batch query, desired-state mutations, and response verification;
- Octocrab GraphQL transport, fake Adapter, and focused tests.

Keep the public result compact: `subjectId`, `kind`, `viewerCanReact`, and nonzero groups containing
`content`, `count`, and `viewerHasReacted`. Keep the picker vocabulary separately so dropping zero
groups never removes available choices. The root GitHub module should only compose/re-export the
Interface and the Tauri commands should take repository coordinates, opaque subject ID, exact kind,
content, and desired boolean.

Hydrate reactions with each existing parent detail page rather than issuing one Tauri call per card:

- Issue detail: body plus the node IDs on the current 100-item timeline page.
- Pull request conversation: body, ordinary comments, and review summaries on the current page.
- Pull request files: inline comment IDs already loaded in the current review-thread page.
- Discussion detail: post, current 30 top-level comments, and the replies already present.
- Release detail: the Release node ID.

The backend may batch REST-origin node IDs through `nodes(ids:)`; GraphQL-origin detail queries may
select the same fragment inline when doing so does not create an excessive nested response. In either
case, the frontend should receive the same `ReactionSubject` shape.

Use one TanStack Query key family scoped by repository and node ID:

```text
["github", "repository", owner, repository, "reaction", subjectId]
```

Prime those entries from every parent detail response. A successful mutation replaces the canonical
subject entry and patches any mounted parent snapshots containing that node: Issue detail timeline,
pull request conversation/reviews, pull request review threads, Discussion detail/replies, and
Release detail. Then invalidate only the relevant subject and parent root for authoritative
reconciliation. Do not invalidate every Issue, pull request, Discussion, or Release list: this slice
does not render reactions in those lists.

## UI and reconciliation

Use a single compact `GitHubReactionBar` on each supported body or comment. Existing nonzero groups
are buttons; an add-reaction shadcn popover exposes all allowed choices. Give every button an
accessible localized label such as “3 heart reactions; you reacted” rather than relying on emoji or
color. Selected groups need icon-independent pressed state (`aria-pressed`), and the picker should be
hidden or disabled with an explanation when `viewerCanReact` is false.

Optimistic behavior should be immediate but bounded:

1. Snapshot the canonical subject.
2. Set the chosen `viewerHasReacted` to the requested state and adjust its count by exactly one,
   clamped at zero.
3. Disable or queue further writes for the same `(subjectId, content)`; coalesce rapid clicks to the
   latest desired state instead of sending concurrent add/remove operations.
4. On success, replace all optimistic groups with the mutation payload, including changes caused by
   other users between read and write.
5. On failure, restore the snapshot, retain retry context, show the existing Harbor permission/rate
   feedback, and refetch that subject. After an ambiguous timeout, do not automatically replay until
   the refetch resolves the actual viewer state.

Different contents on the same subject should also be serialized through a small mutation queue to
respect GitHub's no-concurrent-mutation guidance. A reaction action must never modify the separate
Discussion upvote count. If a subject disappears from a later parent page or GraphQL returns null,
remove its canonical reaction entry rather than displaying stale controls.

## Focused verification

### Rust contract and Service tests

- Map all eight GraphQL enum values, REST spellings, stable display order, and glyphs.
- Enforce the six-value Release subset and reject `ThumbsDown`/`Confused` before transport.
- Deserialize `reactors.totalCount`, `viewerHasReacted`, and `viewerCanReact`; tolerate null/sparse
  groups, drop zero groups from compact output, and reject duplicate or internally inconsistent
  groups.
- Preserve node IDs as opaque strings; trim, deduplicate, and cap a batch at 100 without parsing
  prefixes.
- Verify repository ID for all direct-repository types and the nested Discussion-comment path.
- Reject null selected repository, null subject, missing Discussion parent, foreign repository,
  `CommitComment`, any unsupported type, and expected-kind mismatch.
- Confirm matching desired state skips transport for both add and remove.
- Confirm add/remove send `subjectId` and GraphQL enum content, preserve GraphQL errors, and reject a
  null payload, wrong returned ID/type, or unconfirmed desired state.
- Confirm permission and rate-limit errors keep stable IPC codes and retry metadata.
- Confirm a missing node in a batch cannot authorize a later write.

### Frontend tests

- Render counts and pressed state for every emoji with localized accessible names.
- Show eight picker choices for Issue/PR/Discussion subjects and six for Release.
- Keep Discussion upvote and thumbs-up reaction counts independent.
- Hide or disable writes when `viewerCanReact` is false while retaining readable counts.
- Cover optimistic add, optimistic remove, zero-count removal, rollback, authoritative replacement,
  rapid-click coalescing, and no negative count.
- Patch the correct cached subject across Issue body/comment, PR body/conversation review/inline
  comment, Discussion body/comment/reply, and Release detail fixtures without invalidating unrelated
  repositories or list filters.
- Keep controls correct across existing timeline, thread, and Discussion pagination.

### Commands

```bash
pnpm check
pnpm test -- --run
cargo test --manifest-path src-tauri/Cargo.toml reaction
cargo check --manifest-path src-tauri/Cargo.toml
```

For signed-in desktop verification, exercise one public and one private repository: add and remove a
reaction on every supported surface, revisit another tab/page to confirm cache reconciliation, test
a locked or otherwise non-reactable subject, and confirm that a Release never offers 👎 or 😕.

## Explicit non-goals

- Commit-comment reactions until Harbor has a native commit-comment conversation.
- Reactor identity drawers; counts and the current viewer state are sufficient for this slice.
- Team discussion/comment REST endpoints or any organization/Enterprise administration.
- Notification fan-out, webhook ingestion, bulk reacting, background polling, or reaction analytics.
- Replacing Discussion upvotes with emoji reactions.
