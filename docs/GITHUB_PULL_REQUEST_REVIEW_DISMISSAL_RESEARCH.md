# GitHub pull-request review dismissal research

Research date: 2026-08-30. Scope: dismissal of an eligible submitted review only; pull-request
base edits and `maintainerCanModify` are separate work.

## Decision

Use GitHub's REST dismissal endpoint for Harbor's first implementation. It matches Harbor's existing
numeric review IDs and publishes its token permission. Keep the GraphQL mutation documented below
as a valid alternative, but do not add a second mutation path. Preflight and postflight with the
REST review resource, and refresh all PR review/timeline state after success or conflict.

## Exact API contracts

REST is `PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals`.
`review_id` is the review's integer database ID; the JSON body contains required `message: string`
and `event: "DISMISS"`. Success is `200` with the review resource, including numeric `id`, string
`node_id`, original review `body`, and `state: "DISMISSED"`. Documented failures are `404` and
`422`; the endpoint documentation does not list `403` even though authorization is required
([official REST endpoint](https://docs.github.com/en/rest/pulls/reviews#dismiss-a-review-for-a-pull-request)).

GraphQL's exact live-schema contract is:

```graphql
dismissPullRequestReview(input: DismissPullRequestReviewInput!): DismissPullRequestReviewPayload

input DismissPullRequestReviewInput {
  clientMutationId: String
  pullRequestReviewId: ID!
  message: String!
}

type DismissPullRequestReviewPayload {
  clientMutationId: String
  pullRequestReview: PullRequestReview
}
```

The GraphQL ID is `PullRequestReview.id: ID!`, not the REST integer. `fullDatabaseId: BigInt` is the
current database-ID field; `databaseId: Int` is deprecated. Both the root payload and returned review
are nullable. The mutation expressly dismisses an approved or rejected review and returns the
dismissed review
([mutation](https://docs.github.com/en/graphql/reference/pulls#dismisspullrequestreview),
[input](https://docs.github.com/en/graphql/reference/pulls#dismisspullrequestreviewinput),
[review object](https://docs.github.com/en/graphql/reference/pulls#pullrequestreview)).

If GraphQL is used later, select and verify `clientMutationId`, review `id`, `fullDatabaseId`,
`state`, `updatedAt`, and `pullRequest { id number repository { id nameWithOwner } }`; never accept a
raw review Node ID from frontend IPC. REST list/get responses already expose the matching `node_id`
([REST get review](https://docs.github.com/en/rest/pulls/reviews#get-a-review-for-a-pull-request)).

## Eligibility, authority, and message rules

- Allow only `APPROVED` and `CHANGES_REQUESTED`. GitHub calls these approved or rejected in the
  mutation description. `COMMENTED` is informational, `PENDING` is unsubmitted, and `DISMISSED` is
  already dismissed; pending review deletion is a different endpoint
  ([review states](https://docs.github.com/en/graphql/reference/pulls#pullrequestreviewstate)).
- GitHub Web says repository administrators or people with write access can dismiss a review. For a
  protected branch, REST adds a stricter rule: the actor must be a repository administrator or be
  in the configured people/team dismissal list. Thus write access alone is not a reliable capability
  on protected branches
  ([Web workflow](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/dismissing-a-pull-request-review),
  [REST protected-branch note](https://docs.github.com/en/rest/pulls/reviews#dismiss-a-review-for-a-pull-request)).
- REST confirms GitHub App user tokens, installation tokens, and fine-grained PATs with repository
  `Pull requests: write`. The GraphQL mutation page publishes no field-specific app permission;
  equivalence to REST's permission is **unconfirmed**. Harbor's classic OAuth `repo` scope grants
  repository read/write access and is sufficient only when the signed-in user also has dismissal
  authority; scopes never elevate the user
  ([OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes)).
- The current `PullRequestReview` schema has no `viewerCanDismiss`; `viewerCanUpdate` and
  `viewerCanDelete` describe other interfaces and must not gate dismissal. Capability must remain
  server-authoritative.
- A reason is mandatory and GitHub Web says it is added to the PR conversation. The returned review
  `body` is the original review body, not the dismissal reason. GraphQL exposes the reason on a
  separate `ReviewDismissedEvent.dismissalMessage`
  ([event](https://docs.github.com/en/graphql/reference/pulls#reviewdismissedevent)). Validate a
  trimmed non-empty message. Maximum length, whitespace normalization, and Markdown rules are
  **not published**; do not invent a GitHub limit.

## Harbor preflight, verification, and errors

The Tauri command should accept `{ owner, repository, pullRequestNumber, reviewId, message }`.
Validate repository coordinates, positive numeric IDs, and non-empty message. Then:

1. `GET` the review through the scoped PR route and require matching numeric ID plus state
   `APPROVED` or `CHANGES_REQUESTED`. Preserve its `node_id`, author, commit ID, and submitted time.
2. Send the scoped dismissal request with both `message` and `event: DISMISS`.
3. Require response ID (and `node_id` when present) to match, state to be `DISMISSED`, and immutable
   review identity to agree. Then `GET` the same scoped review and require `DISMISSED` again.

A preflight `DISMISSED`, ineligible state, changed identity, null/incomplete response, or postflight
mismatch is a refreshable conflict, not success: another dismissal's reason is not the user's
requested write. Map explicit authorization failures to `githubPermission`; map `404` to
not-found/stale-or-hidden and `422` to validation/conflict, preserving GitHub's message. Exact
permission status/message and dismissal behavior on closed or merged PRs are **unconfirmed**; do not
hard-code unverified text or an open-PR-only rule. No external mutation was run during this research.

## Pagination, cache, UI, and tests

REST lists reviews chronologically with `page`, default 30, maximum `per_page` 100
([list reviews](https://docs.github.com/en/rest/pulls/reviews#list-reviews-for-a-pull-request)).
Harbor currently loads only page 1 at 100 and exposes `reviewsHaveMore`; implement an explicit
reviews page/infinite query before claiming the full review summary. Add REST `node_id` to
`GitHubPullRequestReview` even if the chosen REST mutation continues using numeric `id`.

Place a kebab action beside each eligible review in the review summary/timeline and open a shadcn
confirmation dialog with a required reason. This matches GitHub Web's review-summary menu and reason
dialog. Do not show the action for pending/comment-only/dismissed reviews; loading or inferred write
access must not be presented as proof of permission.

On success, replace the exact review with the verified `DISMISSED` resource, then invalidate the
entire `pullRequestRoot`: every detail/timeline page, review pages, PR list/inbox summaries, and merge
state can be affected. Refetch rather than synthesize the dismissal timeline event, because the
mutation response does not return its event/reason. On any conflict/permission error, keep cached
data, show retry/refresh, and invalidate review/detail state.

Focused tests must cover REST route/body, numeric-vs-node IDs, both eligible states, all three
ineligible states, required message, wrong PR/review identity, null/incomplete response, postflight
verification, `404`/`422`/permission/rate-limit mapping, multi-page chronological reviews, cache
replacement plus root invalidation, dialog pending/error behavior, eligible-only menu placement,
and English/Chinese/ARIA copy. Review dismissal must not change review threads, pending reviews,
base refs, or maintainer editability.
