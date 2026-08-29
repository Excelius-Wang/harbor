# GitHub pull-request base-branch edit research

Research date: 2026-08-30. Scope: changing the base branch of an existing pull request only;
updating the head branch and `maintainerCanModify` are separate work.

## Decision

Use REST for Harbor's first implementation: `PATCH /repos/{owner}/{repo}/pulls/{pull_number}` with
the body `{ "base": "target-branch" }`. It fits Harbor's numeric PR identity and existing REST
update seam, and GitHub publishes the token permission and response statuses. Wrap it in a focused
base-edit interface rather than adding `base` to the title/body form. Preflight, verify the PATCH
response, and postflight with fresh REST reads; neither REST nor GraphQL offers an atomic
expected-current-base guard.

## Exact read and write contracts

REST updates a PR with `PATCH /repos/{owner}/{repo}/pulls/{pull_number}`. `pull_number` is an
integer; `base` is an optional string naming an existing branch in the current base repository, and
GitHub explicitly says this field cannot move the base to another repository. Send **only** `base`:
`title`, `body`, `state`, and `maintainer_can_modify` are independent optional fields. Success is
`200`; documented failures are `403` and `422`. The returned PR resource includes numeric `id`,
opaque `node_id`, `number`, `state`, `draft`, `merged`, `base.ref`, `base.sha`, `base.repo`,
`head.ref`, and `head.sha`
([update a pull request](https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request)). Read the
current resource with `GET /repos/{owner}/{repo}/pulls/{pull_number}` before and after the write
([get a pull request](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)).

The live GraphQL schema's alternative contract is:

```graphql
updatePullRequest(input: UpdatePullRequestInput!): UpdatePullRequestPayload

input UpdatePullRequestInput {
  clientMutationId: String
  pullRequestId: ID!
  baseRefName: String
  # title/body/state/maintainerCanModify and metadata fields omitted
}

type UpdatePullRequestPayload {
  actor: Actor
  clientMutationId: String
  pullRequest: PullRequest
}
```

`pullRequestId` is `PullRequest.id: ID!`, an opaque GraphQL Node ID, not the REST integer.
`baseRefName` has the same existing-branch/current-repository constraint. Useful verification fields
are `id`, `number`, `repository { id nameWithOwner }`, `baseRefName`, `baseRefOid`, `headRefName`,
`headRefOid`, `state`, `isDraft`, and `merged`; `baseRef` itself is nullable if the ref was deleted,
while the name and OID snapshot remain available
([mutation](https://docs.github.com/en/graphql/reference/mutations#updatepullrequest),
[input](https://docs.github.com/en/graphql/reference/input-objects#updatepullrequestinput),
[PR fields](https://docs.github.com/en/graphql/reference/objects#pullrequest),
[Node IDs](https://docs.github.com/en/graphql/guides/using-global-node-ids)). The payload and its
`pullRequest` are nullable. First-party `gh pr edit --base` also sets only `baseRefName` through this
mutation, but does not supply an expected base
([GitHub CLI source](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/pr/shared/editable_http.go#L116-L128)).

## Eligibility, repository constraints, and authority

- GitHub's Web workflow documents base editing for an **open** PR. Harbor should allow open,
  unmerged PRs, including drafts (`isDraft` is separate from `state`), and hide/disable the action
  for closed or merged PRs. API behavior for changing a closed or merged PR is **unconfirmed**; no
  real mutation was run
  ([Web workflow](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-base-branch-of-a-pull-request),
  [PR state](https://docs.github.com/en/graphql/reference/enums#pullrequeststate)).
- The target must be an existing branch in the current **base** repository, and the operation cannot
  change that repository. It follows that a fork-head PR can only select among branches in its
  existing base repository; this cross-repository-head case was not mutation-tested. Choosing the
  head branch itself is likely rejected, but the exact status/message is **unconfirmed**; let server
  validation remain authoritative.
- REST confirms GitHub App user tokens, installation tokens, and fine-grained PATs need repository
  `Pull requests: write`. It also says opening or updating a public-repository PR requires write
  access to the head branch, and an organization-owned repository requires organization membership
  ([REST permissions](https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request)). Harbor's
  classic OAuth `repo` scope is broad enough at the OAuth-scope layer for private/public repository
  writes, but never elevates the signed-in user's repository authority
  ([OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes)).
  GraphQL's reference does not publish a mutation-specific OAuth/GitHub App permission, so exact
  GraphQL permission equivalence is **unconfirmed**. The official sources reviewed do not publish a
  complete base-edit-specific actor matrix beyond those REST requirements; do not infer permission
  solely from author/maintainer labels.
- `PullRequest.viewerCanUpdate` is only a generic update hint, not a base-edit-specific capability.
  GitHub exposes no documented `viewerCanChangeBase`; eligibility and permission remain
  server-authoritative
  ([PR fields](https://docs.github.com/en/graphql/reference/objects#pullrequest)).

## User-visible warning and UI contract

GitHub Web puts **Edit** beside the PR title, then asks the user to select a base, read an impact
notice, and click **Change base**. Its documented warning is precise: changing the base may remove
some commits from the timeline, and review comments can become outdated when their referenced lines
are no longer in the diff. Official docs do **not** say comments are deleted or disappear; that
stronger behavior is unconfirmed and Harbor copy must not claim it
([Web workflow](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-base-branch-of-a-pull-request)).

Use a separate shadcn confirmation dialog reachable near the existing title edit action. Show
`current base -> target base`, the warning above, a searchable branch select, and a final **Change
base** button. Disable no-op/current-base selection and all controls while pending; provide retry for
branch-load, permission, validation, conflict, and refresh failures. Add English/Simplified Chinese
copy and labels/description for assistive technology. Do not read, write, or gate on
`maintainerCanModify`/`maintainer_can_modify` in this slice.

## Branch discovery and pagination

List candidates from the base repository with `GET /repos/{owner}/{repo}/branches`, using
`per_page=100` and following every `Link` page. The endpoint defaults to 30, permits up to 100, and
returns each branch's `name`, commit SHA, and protected flag. Fine-grained tokens need `Contents:
read`; public resources can be read without authentication
([list branches](https://docs.github.com/en/rest/branches/branches#list-branches)). Harbor's current
code overview fetches only one 100-item page, so base editing needs a dedicated paginated loader or
a corrected reusable branch loader. Keep the current base visible even during a pagination/ref race,
and re-read the URL-encoded chosen branch immediately before writing
([get a branch](https://docs.github.com/en/rest/branches/branches#get-a-branch)). The list endpoint
documents no sort parameter or ordering guarantee; de-duplicate by exact name and apply a stable UI
sort rather than treating response order as contract.

## Race guards, verification, and errors

The Tauri command should accept repository coordinates, numeric PR number, target base name, and UI
snapshot guards: expected current base name/OID and head SHA; include expected target branch SHA from
branch discovery. Never accept a raw REST/GraphQL ID without resolving it through the scoped route.

1. GET the scoped PR; require matching repository, number, numeric ID, open/unmerged state, expected
   base name/SHA, and expected head SHA. Require a different target.
2. GET the target branch in the same base repository and require its name/SHA to match the option
   snapshot. If any guard changed, return a refreshable conflict before PATCH.
3. PATCH only `{base: target}`. Require matching PR/repository identity, `base.ref == target`, the
   same base repository, expected head identity/SHA, and open/unmerged state in the response.
4. Freshly GET the PR and target branch and repeat those checks. This is authoritative verification,
   not merely receipt of `200`.

There is an unavoidable time-of-check/time-of-use window because neither write contract accepts an
expected base/head/OID. A postflight mismatch may mean the base edit persisted but surrounding refs
advanced; report “changed, refresh required” rather than falsely claiming rollback or clean failure.
Do not optimistically rewrite the timeline/diff.

Map explicit `403` to `githubPermission`; map `422` to a focused validation/conflict error while
preserving GitHub's message. Preflight/postflight `404` means missing, stale, or permission-hidden
state even though the PATCH table does not document `404`. Reuse Harbor's authenticated/rate-limit
mapping. Exact validation text, unchanged-base behavior, ref-deletion races, and closed/merged errors
are **unconfirmed**; do not match guessed strings.

## Harbor seams, invalidation, and focused tests

Add a small `pull_request/base_edit` mutation interface beside the existing REST content editor.
Return the verified `GitHubPullRequest`; extend the focused snapshot with base OID only where needed.
After success—or after a postflight conflict where the write may have persisted—invalidate the
entire PR root: detail/timeline, commits, changed-file pages, per-file viewed state, reviews and
threads, pending review, merge/check/branch-update state, repository PR lists, and inbox summaries.
Review positioning and file-view state must be refetched because the comparison changed. Avoid a
normal title/body-style optimistic cache patch.

Focused tests should cover: exact PATCH route/body; numeric-vs-node identity; open and draft-open
eligibility; closed/merged rejection; fork-head/same-base-repository targets; cross-repository and
missing targets; all branch pages; current-base no-op; stale base/head/target SHA guards; response and
postflight identity/base verification; mutation-may-have-persisted conflict; `403`, `404`, `422`,
rate-limit, and malformed/null data mapping; broad cache invalidation; dialog warning, pending,
retry/error, English/Chinese, keyboard, and ARIA behavior; and proof that title, body, PR state,
head-update APIs, and maintainer editability are untouched.
