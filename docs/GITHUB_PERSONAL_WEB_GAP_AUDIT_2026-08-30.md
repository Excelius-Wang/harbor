# GitHub personal Web gap audit — 2026-08-30

Inspected commit: `3eb1a0489b61932be100347a71d9b0b377f533df` (`feat: manage GitHub
commit comments (#18)`), equal to `origin/main` when this audit began. The worktree was clean.
Scope is GitHub.com core work for an individual developer; organization administration, Enterprise
controls, billing, and organization-level advanced security are excluded. No credentials were read
and no GitHub mutation was performed.

## Recommendation

Implement **Issue close reasons** next. Harbor already reads `stateReason`, but its only close action
always writes `state=closed` plus `state_reason=completed`
([backend](../src-tauri/src/github/issue.rs), [UI](../src/features/github/github-issue-detail.tsx)).
GitHub Web lets the user choose a reason before closing. Completing this existing lifecycle is a
small, common, reversible slice with no new OAuth scope, no secret values, and no repository-admin
surface
([GitHub Web: closing an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/closing-an-issue)).

Offer only **Close as completed** and **Close as not planned** in this slice. Preserve and render
`duplicate` if GitHub returns it, but do not pretend that duplicate is merely a cosmetic close
reason: current APIs accept a canonical duplicate issue ID, and GitHub Web's documented duplicate
workflow identifies the target issue
([REST update](https://docs.github.com/en/rest/issues/issues?apiVersion=2026-03-10#update-an-issue),
[duplicate workflow](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/marking-issues-or-pull-requests-as-a-duplicate)).

## Old gaps proven complete at the inspected commit

The 2026-08-29 audit must not be reused as a backlog. Every one of its top six groups now has
production backend, frontend, and focused tests:

| Previously reported gap | Evidence at `3eb1a04` |
| --- | --- |
| Native commit detail and paged diff | [`code.rs`](../src-tauri/src/github/code.rs), [`github-commit-detail.tsx`](../src/features/github/github-commit-detail.tsx), and [`github-commit-detail.test.ts`](../src/features/github/github-commit-detail.test.ts) |
| Issue/PR conversation lock and subscription controls | [`conversation.rs`](../src-tauri/src/github/conversation.rs), [`github-conversation-controls.tsx`](../src/features/github/github-conversation-controls.tsx), and mutation tests |
| Personal-repository collaborators and outgoing/received invitations | [`repository_access.rs`](../src-tauri/src/github/repository_access.rs), [`repository_invitations.rs`](../src-tauri/src/github/repository_invitations.rs), and both access/invitation views |
| Repository label and milestone lifecycle | [`issue_taxonomy.rs`](../src-tauri/src/github/issue_taxonomy.rs), [`github-issue-taxonomy-view.tsx`](../src/features/github/github-issue-taxonomy-view.tsx), and mutation tests |
| PR file state, review dismissal, base changes, and maintainer editability | [`file_view_state.rs`](../src-tauri/src/github/pull_request/file_view_state.rs), [`review_dismissal.rs`](../src-tauri/src/github/pull_request/review_dismissal.rs), [`base_edit.rs`](../src-tauri/src/github/pull_request/base_edit.rs), and [`maintainer_editability.rs`](../src-tauri/src/github/pull_request/maintainer_editability.rs) plus their UI/tests |
| Actions workflow/run administration | [`administration.rs`](../src-tauri/src/github/actions/administration.rs), workflow controls, run deletion, and transport/UI tests |

The later personal-Web work is also present, not merely researched: repository Insights, personal
Packages, full Wiki Git transport, reactions and comment lifecycle, and Pages are implemented in
[`insights.rs`](../src-tauri/src/github/insights.rs),
[`packages.rs`](../src-tauri/src/github/packages.rs), [`wiki.rs`](../src-tauri/src/github/wiki.rs),
[`reaction.rs`](../src-tauri/src/github/reaction.rs), [`comment.rs`](../src-tauri/src/github/comment.rs),
and [`repository_pages.rs`](../src-tauri/src/github/repository_pages.rs). Repository settings and
access, release asset lifecycle, Gists, Projects, Discussions, security alerts, and PR draft/merge/
auto-merge/merge-queue/update-branch flows likewise have production modules and UI. In particular,
PR #18's commit-comment read/create/edit/delete/reaction surface is in
[`commit_comment.rs`](../src-tauri/src/github/commit_comment.rs), its transport, React workspace, and
focused tests. The current Cairn text that still calls PR #18 open is therefore stale relative to
the inspected `origin/main` commit.

## Ranked remaining material gaps

This is a product-delivery ranking of material individual workflows, not a promise to clone every
GitHub settings page.

| Rank | Remaining gap | User value | Fit | Authorization / data risk | Size | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Issue close reason selection and display | Medium-high; completes every Issue lifecycle | Very high; model/cache/UI already exist | Low; reversible, existing `repo` scope | S | **Build next** |
| 2 | Sub-issues: parent, paged children, add/remove/reorder/create-child | High for planning | High; bounded REST and existing Issue cards/search | Medium; cross-repository numeric IDs, cycles/order races, writes | L | Follow as its own slice |
| 3 | Issue dependencies: blocked-by/blocking reads and add/remove | High for planning | High; bounded REST | Medium; cross-repository identity and secondary-rate-limit writes | M | Keep separate from sub-issues |
| 4 | Template/form-aware Issue creation | High in repositories that require templates | Medium; Contents transport exists, but YAML forms and validation do not | Low data risk; preview schema and role-dependent blank-issue policy | L | Design after Issue relationships |
| 5 | Referenced duplicate lifecycle and linked PR/Issue relationships | Medium-high | Medium; APIs exist, but target search, cross-repository permission, and undo semantics are distinct | Medium; wrong target changes canonical work tracking | M | Do not fold into close reasons |
| 6 | Personal Codespaces lifecycle | Medium-high for cloud-development users | Medium-low; new account workspace and external editor handoff | High product/auth risk: new `codespace` OAuth consent and usage can incur cost | L | Requires user discussion first |
| 7 | Branch protection/rulesets and deployment environments | Medium; owner/maintainer work | Low-medium; large policy schemas and plan variance | High: administration writes can block pushes/deployments or replace arrays | XL | Keep behind explicit admin design |
| 8 | Actions/environment/Codespaces secrets and variables | Medium | Medium transport fit | Very high: plaintext enters Harbor, secret values are not readable back, destructive overwrite/delete semantics | L+ | Deliberately defer |

GitHub now exposes first-party REST families for sub-issues and dependencies with normal pagination
and `Issues: read/write`; they are real core candidates, but a complete relationship surface needs
cross-repository resolution, both directions, identity guards, and partial-page/error handling
([sub-issues REST](https://docs.github.com/en/rest/issues/sub-issues?apiVersion=2026-03-10),
[dependencies REST](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2026-03-10)).
Issue forms are files under `.github/ISSUE_TEMPLATE`; the chooser can disable blank issues for
contributors and forms support multiple field types, so rendering only Markdown templates would be
an incomplete shortcut
([template configuration](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository),
[form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)).

Codespace creation requires the classic OAuth `codespace` scope, which Harbor does not currently
request; lifecycle includes create/start/stop/delete plus a browser/editor handoff
([Codespaces REST](https://docs.github.com/en/rest/codespaces/codespaces?apiVersion=2026-03-10)).
Branch protection and environment writes require repository Administration permission and carry
plan-dependent policies
([branch protection](https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2026-03-10),
[environments](https://docs.github.com/en/rest/deployments/environments?apiVersion=2026-03-10)).
Secrets must be encrypted before upload and read endpoints deliberately do not return their values;
that boundary should not be entered incidentally
([Actions secrets](https://docs.github.com/en/rest/actions/secrets?apiVersion=2026-03-10),
[secret encryption](https://docs.github.com/en/actions/concepts/security/secrets)).

## Recommended vertical slice: Issue close reasons

### User contract

- For an open Issue, show a GitHub-style split action beside the comment composer: the primary
  action closes as the currently selected reason, and the adjacent menu selects **Completed** or
  **Not planned**. Default to Completed on each fresh issue snapshot.
- The close click does not submit or clear a comment draft. While pending, lock both close controls
  and comment submission; do not optimistically move the Issue between lists.
- For a closed Issue, show **Closed as completed**, **Closed as not planned**, or **Closed as
  duplicate** where GitHub supplied that reason, plus **Reopen Issue** only when capability allows.
  Unknown future reason strings remain readable as a generic Closed state.
- Capability load failure leaves the Issue readable but disables state writes and provides a
  focused Retry. Permission denial preserves the selected reason and draft. A verified success
  refreshes the timeline event and list/inbox membership.
- Match GitHub's two normal Web choices. Do not offer editing a reason on an already closed Issue:
  REST explicitly ignores `state_reason` unless `state` changes.

GitHub says anyone can close an Issue they opened; personal-repository owners/collaborators and
organization users with triage or greater can close Issues opened by others. Harbor should display
server capabilities rather than recreate that role matrix
([GitHub Web permissions](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/closing-an-issue)).

### Exact REST write contract

Use the existing base-repository route and API version:

```http
GET /repos/{owner}/{repo}/issues/{issue_number}
PATCH /repos/{owner}/{repo}/issues/{issue_number}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
```

The close body must be exactly one of:

```json
{ "state": "closed", "state_reason": "completed" }
{ "state": "closed", "state_reason": "not_planned" }
```

Reopen uses only `{ "state": "open", "state_reason": "reopened" }`. Omit title, body, labels,
assignees, milestone, type, field values, `duplicate_issue_id`, rationale, and suggestion fields.
`issue_number` is the repository-scoped Issue number, while the response's numeric `id` and
`node_id` are identity guards. Reject any response with a `pull_request` member: GitHub's Issues
routes also represent PRs, but this slice is Issue-only.

The update endpoint returns the full Issue at `200`. Its documented statuses are `200`, `301`,
`403`, `404`, `410`, `422`, and `503`. `state_reason` accepts `completed`, `not_planned`,
`duplicate`, `reopened`, or null and is ignored unless state changes; `duplicate_issue_id` is a
separate integer database ID used only with `duplicate`
([REST contract](https://docs.github.com/en/rest/issues/issues?apiVersion=2026-03-10#update-an-issue)).

Fine-grained GitHub App user/installation tokens and fine-grained PATs need at least one of
`Issues: write` or `Pull requests: write`; Harbor should use the Issue-specific contract. The
endpoint says Issue owners and users with push or triage can edit. Harbor's existing classic OAuth
`repo` scope is sufficient at the scope layer for public/private repository writes but never grants
authority beyond the viewer
([REST permissions](https://docs.github.com/en/rest/issues/issues?apiVersion=2026-03-10#update-an-issue),
[OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes)).
No new scope or secret handling is required.

### GraphQL capability and schema contract

Use one focused read query, not a second write path:

```graphql
query HarborIssueState($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    id
    nameWithOwner
    issue(number: $number) {
      id
      number
      state
      stateReason(enableDuplicate: true)
      updatedAt
      viewerCanClose
      viewerCanReopen
      viewerCanUpdate
    }
  }
}
```

Live schema introspection on 2026-08-30 confirmed `viewerCanClose: Boolean!`,
`viewerCanReopen: Boolean!`, `viewerCanUpdate: Boolean!`, and nullable
`stateReason(enableDuplicate: Boolean): IssueStateReason`. Current `IssueStateReason` values are
`COMPLETED`, `NOT_PLANNED`, `DUPLICATE`, and `REOPENED`
([Issue fields and enum](https://docs.github.com/en/graphql/reference/issues#issue)). Reconcile this
Node ID, repository identity, state/reason, and `updatedAt` with the REST snapshot before enabling a
write. `viewerCanUpdate` is generic; use `viewerCanClose`/`viewerCanReopen` for the relevant action.

GraphQL also exposes `closeIssue(input: CloseIssueInput!): CloseIssuePayload`. Its input requires
`issueId: ID!` and optionally accepts `stateReason: IssueClosedStateReason`, `duplicateIssueId: ID`,
`rationale` (maximum 280 characters), and agent-suggestion fields; its nullable payload returns a
nullable `issue`. The close-reason enum is `COMPLETED`, `NOT_PLANNED`, or `DUPLICATE`
([closeIssue](https://docs.github.com/en/graphql/reference/issues#closeissue),
[CloseIssueInput](https://docs.github.com/en/graphql/reference/issues#closeissueinput),
[IssueClosedStateReason](https://docs.github.com/en/graphql/reference/issues#issueclosedstatereason)).
Do not use it in this slice: REST already matches Harbor's numeric model and publishes exact token
permissions/statuses. Rationale, duplicate target, and agent suggestions are separate product work.

### Snapshot, race, and verification

Replace the current `update_issue_state(state)` call with a focused desired-state command accepting:

```text
owner, repository, issueNumber
desiredState: open | closed
desiredReason: reopened | completed | notPlanned
expected: issueId, nodeId, state, stateReason?, updatedAt
```

1. Read the scoped REST Issue and focused GraphQL capability. Require exact repository, number,
   numeric/Node IDs, non-PR shape, state/reason, and updated timestamp. Require the applicable
   viewer capability. A mismatched snapshot is a refreshable conflict before PATCH.
2. Reject no-op desired state. For close, accept only Completed/Not planned; for reopen, force
   Reopened. Construct the two-field body and send no other mutable property.
3. Verify the `200` response identity, desired state, exact normalized reason, and a non-regressing
   update timestamp.
4. Freshly GET the Issue and require the same result. Return only the postflight resource. Refetch
   capability after the cache invalidation.

REST and GraphQL provide no expected-state/`updatedAt` compare-and-set input, so a TOCTOU window
remains. If postflight differs, the write may have persisted and then been superseded; return a
write-may-have-persisted conflict and refresh rather than claiming rollback. A different title/body
update between checks also changes `updatedAt`; stop before write when detected so the user acts on
current context.

Error mapping:

- `403` -> `githubPermission`; keep selection and comment draft.
- `301` -> moved/stale route and refresh navigation; never follow a write to an unverified repo.
- `404`/`410` -> missing, transferred, deleted, or permission-hidden resource.
- `422` -> focused invalid transition/validation conflict; preserve GitHub's message.
- `503` and shared rate limits -> retryable service/rate error; never auto-retry PATCH.
- null/missing identity, `pull_request`, wrong state/reason, or response/postflight mismatch ->
  malformed or refreshable conflict, not success.

### Harbor seams, cache, UI, and tests

Keep the code behind a small Issue-state interface in [`issue.rs`](../src-tauri/src/github/issue.rs)
or a focused sibling module. Reuse the current `GitHubIssue.stateReason`, but normalize the known
vocabulary instead of silently defaulting unknown strings. Extend the Issue detail/status DTO with
Node ID, `updatedAt`, and the two action capabilities; do not accept a global Node ID as the only IPC
scope.

In [`github-issue-detail.tsx`](../src/features/github/github-issue-detail.tsx), replace the single
hard-coded Close button with an accessible split button/dropdown beside the existing composer.
Use shadcn DropdownMenu, explicit labels/descriptions for both reasons, `aria-haspopup`,
`aria-expanded`, `aria-busy`, a polite loading status, destructive alert errors, keyboard selection,
and English/Simplified Chinese copy. Closing is reversible, so a confirmation modal adds little;
the selected reason must remain visible on the primary action before the click.

On verified success, use existing `syncUpdatedIssue` so every detail page, repository Issue page,
and personal Issue inbox receives the exact state/reason. Then invalidate `issueRoot`,
`issuesRoot`, and `issueInboxRoot` through `invalidateRepositoryIssue`: the timeline must fetch the
authoritative close/reopen event. Keep the comment draft outside mutation reset. On ambiguous
postflight, do not sync speculative state; invalidate the same roots.

Focused tests must cover:

- exact GET/GraphQL/PATCH/GET sequencing and two-field bodies for Completed, Not planned, Reopened;
- REST numeric ID versus GraphQL Node ID/repository/number reconciliation and PR-shape rejection;
- `viewerCanClose`/`viewerCanReopen`, issue author and triage cases, generic capability not being
  treated as sufficient, and no new scope;
- stale state, reason, `updatedAt`, wrong identity, no-op, response mismatch, postflight conflict,
  and the write-may-have-persisted path;
- every documented status plus rate limits, null/malformed data, unknown future reason display;
- duplicate state read/render but no duplicate mutation, rationale, or suggestion fields;
- split-button mouse/keyboard behavior, visible selected reason, pending locks, loading/error/retry,
  draft preservation, screen-reader names/descriptions, and English/Chinese copy;
- exact cache movement between open/closed repository and inbox pages, detail/timeline invalidation,
  and no PR, comment, taxonomy, Project, or notification mutation.

## Explicit boundaries and decisions needing discussion

This slice does **not** mark or unmark duplicates, change the reason of an already closed Issue,
close PRs, add rationale, process agent suggestions, link PRs, transfer/pin Issues, or add
sub-issues/dependencies. Those have different identities and consequence models.

No user decision blocks Issue close reasons. Before later work, ask explicitly about:

1. whether the next investment should deepen Issues (sub-issues/dependencies/templates) or move to
   lower-frequency repository administration;
2. whether Harbor may request the new `codespace` OAuth scope and expose cost-bearing creation;
3. whether Harbor may ever accept transient plaintext secret values, with no persistence/logging and
   no read-back guarantee; and
4. whether branch/environment policy editing should be native despite lockout/deployment risk.

## Final recommendation

At exact commit `3eb1a0489b61932be100347a71d9b0b377f533df`, the former top gaps and PRs
#1–#18 are represented in production source and tests. The smallest correct next vertical slice is
**Issue close reason selection, capability, authoritative verification, and display** using focused
GraphQL reads plus the existing REST Issue update route. It closes a real Web-parity defect without
new authorization, secret exposure, irreversible deletion, or a second mutation transport.
