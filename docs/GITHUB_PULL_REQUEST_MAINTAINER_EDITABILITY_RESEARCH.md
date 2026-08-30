# GitHub pull-request maintainer editability research

Research date: 2026-08-30. Scope: an existing pull request's GitHub Web **Allow edits from
maintainers** setting for an individual developer. PR creation, changing the base, updating the head
branch, collaborator management, and Actions administration are separate work.

## Decision

Use the existing REST pull-request route with a focused interface: read
`GET /repos/{owner}/{repo}/pulls/{pull_number}` and write
`PATCH /repos/{owner}/{repo}/pulls/{pull_number}` with **only**
`{ "maintainer_can_modify": boolean }`. Harbor should expose the control only to the PR creator on
an open, unmerged PR whose head is a live, user-owned fork. Preflight and postflight against fresh
state because neither REST nor GraphQL accepts an expected current value or head SHA.

## Exact API contract

The REST `pull_number` is an integer scoped by the **base** repository route. A full GET response
contains numeric `id`, opaque `node_id`, `number`, `user`, `state`, `draft`, `merged`,
`maintainer_can_modify`, and the head/base refs and repositories. The update body's
`maintainer_can_modify` field is a boolean; `title`, `body`, `state`, and `base` are independent
optional fields and must be omitted. Success is `200`; documented update failures are `403` and
`422`
([get a pull request](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request),
[update a pull request](https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request)). Treat a
missing/null setting or incomplete identity in a full response as malformed data, never as `false`.

Live GitHub GraphQL schema introspection on the research date confirmed this alternative:

```graphql
updatePullRequest(input: UpdatePullRequestInput!): UpdatePullRequestPayload

input UpdatePullRequestInput {
  clientMutationId: String
  pullRequestId: ID!
  maintainerCanModify: Boolean
  # unrelated optional fields omitted
}

type UpdatePullRequestPayload {
  actor: Actor
  clientMutationId: String
  pullRequest: PullRequest
}
```

The mutation and returned `pullRequest` are nullable. `pullRequestId` is the opaque
`PullRequest.id: ID!`, not the REST integer. Read fields include
`maintainerCanModify: Boolean!`, `isCrossRepository: Boolean!`, `viewerCanUpdate: Boolean!`,
`headRepository`, `headRepositoryOwner`, `headRefName`, `headRefOid`, `state`, `isDraft`, and
`merged`; repository shape fields include `id`, `nameWithOwner`, `isFork`, `isPrivate`, and an owner
whose concrete type is `User` or `Organization`
([mutation and input](https://docs.github.com/en/graphql/reference/pulls#updatepullrequest),
[PullRequest](https://docs.github.com/en/graphql/reference/pulls#pullrequest),
[global Node IDs](https://docs.github.com/en/graphql/guides/using-global-node-ids)). There is no
maintainer-editability-specific viewer capability: `viewerCanUpdate` is generic and must not be the
sole UI or authorization gate.

REST is the preferred single write path because Harbor already carries the numeric PR ID and uses
this update route, while REST publishes its fine-grained permission and statuses. Do not add a
second GraphQL mutation path. Creation APIs also accept the setting, but initial PR creation is not
part of this slice.

## Who can toggle it and eligible shapes

GitHub's Web contract is narrower than the generic update endpoint:

- Only the pull-request creator can allow edits to their fork. Compare the authenticated user's
  durable numeric ID with the PR author's ID server-side; `GET /user` returns both ID and login and
  requires no fine-grained permission for its public identity fields
  ([committing to a fork PR](https://docs.github.com/en/pull-requests/how-tos/commit-changes/committing-changes-to-a-pull-request-branch-created-from-a-fork),
  [authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user)).
- The head must be a fork owned by a personal `User` account. GitHub explicitly says permissions
  cannot be granted to an organization-owned fork. Once enabled, the beneficiaries are **anyone
  with push access to the upstream/base repository**, not a named maintainer
  ([allowing changes](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/allowing-changes-to-a-pull-request-branch-created-from-a-fork),
  [fork permissions](https://docs.github.com/en/pull-requests/reference/forks#permissions-of-forks)).
- Same-repository PRs are ineligible: collaborators already use the shared-repository permission
  model, while this setting grants upstream maintainers access to a branch in a separate fork
  ([collaboration models](https://docs.github.com/en/pull-requests/reference/pull-requests#collaborative-development-models)).
- Require a live head repository and branch. A deleted head repository/ref cannot receive commits.
  Branch restrictions can still prevent a maintainer push even when this boolean is true; the
  setting is permission, not a bypass
  ([maintainer push prerequisites](https://docs.github.com/en/pull-requests/how-tos/commit-changes/committing-changes-to-a-pull-request-branch-created-from-a-fork)).
- Support open drafts: GitHub's fork creation flow offers the setting before the user chooses a
  normal or draft PR. Keep closed and merged PRs ineligible in Harbor. Their exact REST/GraphQL
  mutation behavior is **unconfirmed** because the Web docs do not define it and no mutation was
  performed
  ([creating from a fork](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request-from-a-fork)).

Use `head.repo.id != base.repo.id`, `head.repo.fork == true`, `head.repo.owner.type == "User"`, and
matching viewer/author IDs as defensive snapshot checks. The scoped PR resource remains
authoritative; do not infer eligibility from `head.label`, `authorAssociation`, repository
visibility, or the current boolean alone. API acceptance for same-repository, organization-owned
fork, bot/ghost author, or inactive PR requests is **unconfirmed**; reject them locally and do not
encode guessed GitHub error text.

## Workflow, private-fork, and secret warning

GitHub Web changes the label to **Allow edits and access to secrets by maintainers** when the fork
contains GitHub Actions workflows. GitHub says enabling edits then lets a maintainer edit the fork's
workflows, which can potentially reveal secret values and grant access to other branches. This does
not mean the checkbox immediately displays every secret, and Harbor must not weaken or exaggerate
that warning
([official warning](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/allowing-changes-to-a-pull-request-branch-created-from-a-fork)).

Apply this warning based on workflow presence, not only repository visibility; the official wording
does not limit it to private forks. For a private fork, the same warning is especially important,
and private forks also inherit upstream team permissions
([fork permissions](https://docs.github.com/en/pull-requests/reference/forks#permissions-of-forks)).
To match the head snapshot, inspect `.github/workflows` in the **head repository at the expected
head SHA** with `GET /repos/{owner}/{repo}/contents/{path}?ref={sha}` and `Contents: read`, rather
than using the workflow-list endpoint, which has no `ref` parameter
([repository contents](https://docs.github.com/en/rest/repos/contents#get-repository-content)).
Classify workflow risk as `present`, `absent`, or `unknown`; on permission/transient ambiguity, show
the stronger warning instead of silently treating it as absent. A missing workflows directory is
`absent` only after head repository/commit access has already been verified.

This toggle is not the private-fork Actions policy that sends write tokens, secrets, or variables to
fork PR workflows, and it does not manage secrets, variables, workflow files, branch rules, or
repository collaborators. Those separate administration settings remain out of scope
([private-fork workflow settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#enabling-workflows-for-forks-of-private-repositories)).

## Authentication and permissions

REST documents GitHub App user tokens, installation tokens, and fine-grained PATs with repository
`Pull requests: write`. It also documents write access to the head/source branch for updating a
public PR and an organization-membership condition for organization-owned repositories
([REST permissions](https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request)). Those are
endpoint requirements, not a replacement for the creator/personal-fork Web eligibility above.

Harbor's classic OAuth `repo` scope supplies public/private repository read/write at the scope layer,
including code access needed for a private head-fork workflow scan, but scopes never grant authority
the user does not already have
([OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes)).
GitHub's separate `workflow` OAuth scope covers adding or updating workflow files; no official source
reviewed says it is required to change this PR metadata boolean. The exact accepted classic scope
header and GraphQL/GitHub App behavior for this field are **unconfirmed**; preserve server errors.
If a fine-grained/App implementation also performs the optional workflow scan, it additionally needs
`Contents: read` on the head repository.

## Snapshot, race, and authoritative verification

Add a focused status DTO rather than overloading the title/body editor. It should contain PR numeric
ID and Node ID, number, author ID/login, current boolean, state/draft/merged, base repository ID/name,
head repository ID/name/owner type/private/fork, head ref/SHA, viewer ID, eligibility reason, and
workflow-risk tri-state. Add `maintainerCanModify` to Harbor's full PR model; its current mapper
drops the REST field and all head-repository identity needed for eligibility.

The mutation input should contain repository coordinates, PR number, requested boolean, and expected
snapshot guards: current boolean, PR ID/Node ID, author ID, head repository ID, head ref, and head
SHA. Never trust frontend-supplied author, repository shape, or capability.

1. Freshly GET the authenticated user and scoped PR. Require exact identities, open/unmerged state,
   viewer == author, live personal fork head, and unchanged expected current value/head snapshot.
2. If enabling, refresh workflow risk at the expected head SHA for warning integrity. Reject a UI
   no-op; if GitHub already has the requested value but the expected value differs, another actor or
   tab won the race, so return a refreshable conflict.
3. PATCH only `{ "maintainer_can_modify": requested }`. Require the response's repository/PR,
   author, head identity/SHA, and boolean to match.
4. Freshly GET the PR and repeat every identity and requested-value check. Return only this verified
   resource and refreshed status snapshot.

Neither API offers compare-and-set, so a time-of-check/time-of-use window remains. A postflight
mismatch may mean Harbor's write persisted and was then changed, or the head advanced; return a
write-may-have-persisted refresh conflict rather than claiming rollback. Do not optimistically flip
the checkbox.

Map documented update `403` to `githubPermission` and `422` to focused validation/conflict while
preserving GitHub's message. Map `401` through shared authentication handling; pre/postflight `404`
means deleted, stale, or permission-hidden PR/head state, although the PATCH table does not list
`404`. Missing/null identity or boolean is malformed data. Exact same-value behavior, closed/merged
errors, and fork-shape validation status/messages are **unconfirmed**.

## Harbor UI, cache, and tests

Match GitHub Web's lower-right PR-page placement with a compact shadcn Checkbox in Harbor's existing
conversation sidebar, not the title/body dialog or base-edit dialog. Use the normal label for an
eligible workflow-absent fork and the stronger label plus always-visible warning for
`present`/`unknown`. Keep the verified current value during a write; disable the checkbox while
pending and on stale snapshots. A successful disable removes future permission granted by this
setting; copy must not imply it reverts prior commits or any prior disclosure.

Potentially eligible state gets a compact skeleton while loading. Omit the control for confirmed
same-repository, organization-fork, non-author, closed, or merged shapes, as GitHub Web does. For a
deleted/unavailable head show a small unavailable state; for status, permission, validation, or
refresh failures show the focused message and Retry without changing the checkbox. Use a real label,
`aria-describedby` for the security warning, `aria-busy`/disabled during mutation, `role="status"`
for loading, `role="alert"` for errors, keyboard-operable retry, and English/Simplified Chinese copy.

Create a TanStack Query key under `pullRequestRoot` for the status snapshot. On verified success,
sync the returned full PR into detail caches, replace the status snapshot, and invalidate the PR
detail root plus repository PR lists/inbox summaries. On conflict or an ambiguous postflight,
invalidate the whole PR root and list/inbox state. Do **not** invalidate commits, files, viewed
states, reviews, threads, or checks solely for this boolean: it does not itself change head SHA or
the comparison; a later maintainer push will arrive through normal PR refresh.

Focused tests must cover exact GET/PATCH routes and boolean-only bodies; true and false; REST numeric
versus Node identity; creator versus non-creator; personal fork, same repository, organization fork,
deleted head, open draft, closed, and merged shapes; private/public forks; workflow
present/absent/unknown at the exact head SHA; normal/strong warning copy; stale current value,
author/head repository/ref/SHA changes; no-op; response and postflight verification;
write-may-have-persisted conflict; `401`, `403`, `404`, `422`, rate-limit, and malformed responses;
focused cache sync/invalidation; loading/unavailable/permission/retry/pending UI; keyboard and ARIA;
English/Chinese copy; and proof that title/body/state/base, head-update, Actions policies, secrets,
collaborators, and branch rules are untouched. No real mutation was performed during this research.
