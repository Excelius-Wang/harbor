# GitHub Actions workflow administration research

Verified on 2026-08-29 against GitHub REST API version `2026-03-10` and first-party
`github/cli` source at commit
[`40b742f`](https://github.com/cli/cli/tree/40b742f76d68e6b1f472942a6368db4b5d765641).
This note covers personal repositories only: workflow enable/disable and workflow-run deletion.

## REST contract

| Operation                           | Route                                                               | Documented success | Authorization                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Read workflow before/after mutation | `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}`         | `200 OK`           | Actions repository permission: read                                                                                   |
| Disable workflow                    | `PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable` | `204 No Content`   | Actions repository permission: write; OAuth/PAT classic: `repo`                                                       |
| Enable workflow                     | `PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable`  | `204 No Content`   | Actions repository permission: write; OAuth/PAT classic: `repo`                                                       |
| Read run before deletion            | `GET /repos/{owner}/{repo}/actions/runs/{run_id}`                   | `200 OK`           | Actions repository permission: read                                                                                   |
| Delete run                          | `DELETE /repos/{owner}/{repo}/actions/runs/{run_id}`                | `204 No Content`   | Repository write access and Actions repository permission: write; a private repository needs OAuth/PAT classic `repo` |

The workflow path parameter accepts either the numeric database ID or workflow file name. Harbor
already stores the numeric ID, which avoids name ambiguity. Disable changes the workflow state to
`disabled_manually`; enable changes it to `active`. All three writes return no representation, so a
successful workflow state mutation needs an authoritative follow-up read rather than a fabricated
client result. The current OpenAPI description documents only the successful `204` response for
these writes.

Sources: [REST workflow endpoints](https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10),
[REST workflow-run endpoints](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10),
[versioned OpenAPI workflow operations](https://github.com/github/rest-api-description/blob/3fa67306b30ebd736a08604ff8b8932a34f68ddf/descriptions/api.github.com/api.github.com.2026-03-10.json#L44866-L45020),
[versioned OpenAPI run operations](https://github.com/github/rest-api-description/blob/3fa67306b30ebd736a08604ff8b8932a34f68ddf/descriptions/api.github.com/api.github.com.2026-03-10.json#L42977-L43060).

## Workflow-state semantics

The API schema exposes five states:

| State                 | Meaning                                      | Harbor action                                           |
| --------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `active`              | Workflow is active                           | Offer **Disable workflow**                              |
| `disabled_manually`   | Manually disabled                            | Offer **Enable workflow**                               |
| `disabled_inactivity` | GitHub disabled it for repository inactivity | Offer **Enable workflow**                               |
| `disabled_fork`       | Disabled by default on a fork                | Show the reason; do not offer the generic enable action |
| `deleted`             | Workflow file was deleted from Git           | Preserve readable history; no enable/disable action     |

This action matrix follows GitHub CLI: `gh workflow disable` resolves only `active` workflows,
while `gh workflow enable` resolves only `disabled_manually` and `disabled_inactivity` workflows,
then sends the numeric workflow ID to the REST route. A disabled workflow stops responding to new
triggers without deleting its YAML file, so the UI should not imply that existing history is
removed.

Sources: [official `WorkflowState` definitions](https://docs.github.com/en/graphql/reference/actions#workflowstate),
[versioned REST schema enum](https://github.com/github/rest-api-description/blob/3fa67306b30ebd736a08604ff8b8932a34f68ddf/descriptions/api.github.com/api.github.com.2026-03-10.json#L141362-L141371),
[`gh workflow disable`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/workflow/disable/disable.go#L78-L96),
[`gh workflow enable`](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/workflow/enable/enable.go#L78-L96),
[GitHub's enable/disable guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

## Workflow-run deletion eligibility

Deletion is **not completed-only**. GitHub's current product guidance says a run may be deleted when
it is completed **or more than two weeks old**. Therefore the exact client predicate is:

```text
status == "completed" OR created_at <= now - 14 days
```

The second branch matters for a stale queued or in-progress run older than two weeks. Harbor may
choose a narrower completed-only first release, but that would be an intentional product limitation,
not GitHub parity. Deleting the run also deletes all artifacts associated with it and cannot be
undone, so the action needs a destructive confirmation that names the run and explains the artifact
loss.

GitHub CLI performs a repository-scoped `GET` for an explicitly supplied run ID before sending the
`DELETE`; it does not duplicate the status/age rule client-side. It handles `404` during the preflight
and anticipates `409 Conflict` from deletion even though the published REST/OpenAPI table lists only
`204`. Its current 409 text says a completed run cannot be deleted, which contradicts GitHub's
official guidance and its own test that deletes a successful completed run. Harbor should not copy
that sentence: surface 409 as a stale/server-rejected state, refetch, and keep the dialog recoverable.

Sources: [deletion eligibility and confirmation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/delete-a-workflow-run),
[artifact consequence](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts#artifacts-from-deleted-workflow-runs),
[`gh run delete` preflight and transport](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/run/delete/delete.go#L87-L150),
[`gh` completed-run deletion test](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/run/delete/delete_test.go#L98-L114).

## Harbor implementation implications

Keep the capability inside the existing Actions deep module and reuse the workflow inventory, run
detail, TanStack Query roots, and destructive shadcn dialog.

1. Keep the capability repository-scoped and leave write authorization to GitHub, matching Harbor's
   existing Actions mutations. A personal developer can maintain a repository they collaborate on;
   this does not expose organization or Team administration in Harbor.
2. Re-read the exact workflow or run through its repository-scoped route immediately before writing.
   Verify the returned numeric ID, and for a run verify `repository.full_name`; if the action came
   from a workflow-filtered list, also verify `workflow_id`.
3. Send the UI-observed workflow state or run `updated_at` as an expected-state guard. Reject and
   refetch when the authoritative object changed before confirmation.
4. For workflow mutation, apply the state matrix above, send the `PUT`, then re-read and require the
   expected resulting state before updating caches.
5. For run deletion, recompute the documented eligibility from the authoritative `status` and
   `created_at`, send `DELETE`, then remove that run from every repository/workflow/filter list cache
   and clear its detail, Jobs, logs, and artifact caches. There is no response object to merge.
6. Keep `403` permission feedback aligned with the existing Actions write-permission message. Treat
   a preflight `404` as stale/missing data and a delete-time `409` as a state conflict; refresh rather
   than claiming success.
7. Place workflow enable/disable on the selected workflow header/options, not on the repository-wide
   “All workflows” view. Place deletion in a completed/eligible run's destructive menu and detail
   header. Disabled and deleted workflows should retain readable run history.
