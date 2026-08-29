# GitHub pull-request file viewed state research

Verified against GitHub.com on 2026-08-30. The conclusions below use GitHub's current
GraphQL schema, the official GraphQL reference, and the official REST pull-request file
documentation. Harbor should keep the existing REST diff transport and add a focused GraphQL
view-state transport.

## Confirmed API contract

`PullRequest.files` is a nullable `PullRequestChangedFileConnection`. It accepts the standard
`first`, `last`, `after`, and `before` cursor arguments. Each `PullRequestChangedFile` exposes:

- `path: String!`
- `viewerViewedState: FileViewedState!`
- `additions: Int!`, `deletions: Int!`, and `changeType: PatchStatus!`

`FileViewedState` has exactly three current values:

- `UNVIEWED`: the viewer has not marked the file as viewed.
- `VIEWED`: the viewer marked the file as viewed.
- `DISMISSED`: the file changed after the viewer last viewed it.

The state is viewer-specific. Harbor must query and mutate it with the signed-in user's OAuth
token; it must not treat it as repository-global review state.

The mutations are:

```graphql
mutation HarborMarkPullRequestFileViewed($pullRequestId: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
    pullRequest {
      id
    }
  }
}

mutation HarborUnmarkPullRequestFileViewed($pullRequestId: ID!, $path: String!) {
  unmarkFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
    pullRequest {
      id
    }
  }
}
```

Both input objects require `pullRequestId: ID!` and `path: String!`; `clientMutationId` is
optional. Both payloads expose a nullable `pullRequest`. Harbor should reject a successful
transport response whose payload omits the pull request or returns a different ID.

GitHub GraphQL connections require `first` or `last` between 1 and 100. Harbor must traverse
`pageInfo.endCursor` while `hasNextPage` is true; it must reject a `hasNextPage` response that
does not supply a new cursor. Mapping by `path` avoids assuming that the GraphQL connection and
REST file endpoint use identical page boundaries or ordering.

The REST `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` endpoint remains necessary for
Harbor's patch, blob URL, SHA, rename, and diff rendering data. It supports Pull requests
repository permission (read), paginates up to 100 records per page, and caps the response at
3,000 files. Its documented response does not contain viewer viewed state.

## Authentication and errors

Harbor already requests the classic OAuth `repo` scope and performs GraphQL calls with the
signed-in user's token. GitHub's current GraphQL reference does not publish a mutation-specific
OAuth scope or GitHub App permission for `markFileAsViewed`/`unmarkFileAsViewed`. GitHub's own
permission guidance says GraphQL permissions must be tested and that insufficient permissions
produce an API error. Therefore Harbor must not hard-code a narrower permission claim.

Transport and GraphQL errors should continue through Harbor's shared mapping:

- permission-like GraphQL messages become `githubPermission`;
- rate-limit messages become `githubRateLimited`;
- missing repository, pull request, file path, stale path after a push/rename, or a malformed
  mutation payload remains a refreshable GitHub error;
- the UI keeps the prior cached state on failure, shows the returned error, and offers a refetch.

`DISMISSED` is a readable state, not a mutation target. Selecting its checkbox calls
`markFileAsViewed`; only a currently `VIEWED` file calls `unmarkFileAsViewed`.

## Harbor implementation contract

1. Add a focused `pull_request/file_view_state.rs` client interface. Do not expand the existing
   root pull-request mutation interface.
2. Query all view-state pages in one backend service call (100 nodes per GraphQL request), return
   one pull-request node ID plus path/state entries, and detect missing/duplicate pagination
   cursors and duplicate paths.
3. Keep REST file pages and view states in separate TanStack Query keys. Join them by exact path
   in the file header.
4. Expose separate mark and unmark Tauri commands. Validate the GraphQL node ID and repository
   path at the command boundary.
5. After a successful mutation, update the complete view-state cache by path. On failure, do not
   leave an optimistic state behind. A refetch must reconcile pushes, renames, and `DISMISSED`.
6. Render the shadcn checkbox as checked only for `VIEWED`. Preserve `DISMISSED` distinctly as
   "changed since viewed" rather than collapsing it silently into `UNVIEWED`.
7. Disable only the file currently being mutated. Loading/query failures must not prevent the
   existing REST diff and external-source controls from working.
8. Cover GraphQL query pagination and mutation payload verification in Rust; cover Tauri invoke
   arguments and cache reconciliation in TypeScript; cover checked, dismissed, pending, and
   error presentation through pure/render tests.

## Sources

- [GitHub GraphQL pull-request reference](https://docs.github.com/en/graphql/reference/pulls)
- [GitHub GraphQL pagination guide](https://docs.github.com/en/enterprise-cloud@latest/graphql/guides/using-pagination-in-the-graphql-api)
- [GitHub REST pull-request endpoints](https://docs.github.com/en/rest/pulls/pulls)
- [GitHub GraphQL call and authentication guide](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql)
- [GitHub App permission guidance for GraphQL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)

The live GitHub.com schema was also introspected on 2026-08-30 for
`PullRequestChangedFile`, `FileViewedState`, `MarkFileAsViewedInput`,
`UnmarkFileAsViewedInput`, both mutation fields and payloads, and the `PullRequest.files`
connection arguments. The introspection matched the linked official reference.
