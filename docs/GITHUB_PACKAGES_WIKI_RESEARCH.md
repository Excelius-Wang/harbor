# GitHub Packages vs. repository Wiki

Research date: 2026-08-29. This note compares the remaining personal-developer workflows and uses
only GitHub documentation, first-party GitHub CLI source, and maintained library source.

## Recommendation

Build **personal Packages inventory and version lifecycle** next, not Wiki.

The smallest complete slice is an account-level Packages workspace that:

1. lists the signed-in user's packages for one selected ecosystem and visibility at a time;
2. opens package metadata and paginated active or deleted versions;
3. deletes a version after exact package-name confirmation and restores a deleted version; and
4. sends publishing, package settings, access control, repository linking, visibility changes, and
   whole-package deletion or restoration to GitHub Web.

This is a real end-to-end management job with server-authoritative state. It fits Harbor's existing
OAuth, Octocrab, Tauri command, TanStack Query, and account-workspace seams. Whole-package deletion
should not enter this first slice: the REST API can restore a package by known type and name but has
no endpoint that enumerates deleted packages, so a native recovery list would have to rely on stale
local tombstones or user-supplied identity.

Wiki should follow after a dedicated Git transport spike. GitHub exposes no Wiki page-content API;
an implementation must safely fetch and push a separate `.wiki.git` repository, manage a bounded
local object cache, and handle an uninitialized Wiki whose first page GitHub only documents creating
on the web.

## Decision matrix

| Concern                      | Personal Packages                                                         | Repository Wiki                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Authoritative transport      | REST for management; registry-native clients for publish/install          | Git Smart HTTP against `{repo}.wiki.git`                                                                       |
| Direct REST/GraphQL coverage | REST covers list/read/version delete/restore; GraphQL is registry-limited | Only the enabled flag; no page objects or mutations                                                            |
| Harbor authentication change | Add package scopes and reconnect                                          | Existing `repo` scope is suitable for private repository Git access, but transport needs a credential callback |
| Pagination                   | REST `page`/`per_page`, maximum 100; 10,000-result product limit          | No API contract; page and history paging are local Git policies                                                |
| New infrastructure           | Focused Octocrab routes and DTOs                                          | Git transport, secure credentials, object cache, per-repository locking, commit writer                         |
| Main completeness gap        | Settings and publish/install stay web or registry-native                  | First page and exact GitHub rendering of every markup format stay web                                          |
| Recommended order            | **Next**                                                                  | After Git transport spike                                                                                      |

## A. Personal GitHub Packages

### Supported operations

GitHub's authenticated-user REST family is the best primary channel. The current
[Packages REST reference](https://docs.github.com/en/rest/packages/packages) exposes these routes:

| User job                                 | REST route                                                                | Notes                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| List owned packages                      | `GET /user/packages`                                                      | Requires one `package_type` per request                                               |
| Read one package                         | `GET /user/packages/{package_type}/{package_name}`                        | Includes visibility, version count, owner, timestamps, links, and optional repository |
| List versions                            | `GET /user/packages/{package_type}/{package_name}/versions`               | Supports active or deleted state                                                      |
| Read one version                         | `GET /user/packages/{package_type}/{package_name}/versions/{id}`          | Version IDs are numeric                                                               |
| Delete one version                       | `DELETE /user/packages/{package_type}/{package_name}/versions/{id}`       | `204 No Content`                                                                      |
| Restore one version                      | `POST /user/packages/{package_type}/{package_name}/versions/{id}/restore` | `204 No Content`                                                                      |
| Delete one package                       | `DELETE /user/packages/{package_type}/{package_name}`                     | `204 No Content`                                                                      |
| Restore one package                      | `POST /user/packages/{package_type}/{package_name}/restore`               | Requires already knowing its type and name                                            |
| Publish or upload                        | None                                                                      | Use npm, Maven/Gradle, Docker/OCI, NuGet, or RubyGems tooling                         |
| Change visibility/access/repository link | None                                                                      | GitHub Web or registry metadata only                                                  |

Publishing is deliberately not a generic API mutation. GitHub instructs users to authenticate an
appropriate package client and publish through that registry's protocol
([publishing a package](https://docs.github.com/en/packages/learn-github-packages/publishing-a-package)).
Harbor should not shell out to a package manager, synthesize a publish result, or pass its OAuth
token to an external process.

The GraphQL schema has richer legacy objects, including package and version download totals,
package files, file hashes and URLs, and `deletePackageVersion`
([Packages GraphQL schema](https://docs.github.com/en/graphql/reference/packages)). GitHub states,
however, that GraphQL cannot manage registries with granular permissions. Those are Container, npm,
NuGet, and RubyGems; Maven and Gradle are the repository-scoped registries
([Packages permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages)).
GraphQL therefore cannot be Harbor's common Packages transport and does not support restore or
whole-package deletion.

### OAuth scopes and permission behavior

The endpoint-specific REST documentation says OAuth App tokens and classic PATs need:

- `read:packages` for package and version metadata;
- `read:packages` plus `delete:packages` for deletion; and
- `read:packages` plus `write:packages` for restoration.

Repository-scoped packages also need `repo`; Harbor already requests it. GitHub's
[OAuth scope reference](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
defines all three package scopes and documents `X-OAuth-Scopes` and `X-Accepted-OAuth-Scopes` for
checking the token and operation.

There is a documentation tension that must be tested before UI work: the Packages overview says
Packages management requires a classic PAT, while the individual REST operations explicitly list
OAuth App tokens. Treat the more specific operation contract as the implementation hypothesis, but
gate the slice on one live Harbor OAuth probe for `GET /user/packages`; do not assume the token can
authenticate npm, Docker, or another registry client.

The live probe on 2026-08-30 also ruled out Harbor's former GitHub App configuration. GitHub issued
a `ghu_` user token with no OAuth scopes; `/user` succeeded, the app installation was visible for the
personal account, but `/user/packages?package_type=container` returned `403 Resource not accessible
by integration` with `allows_permissionless_access=true` under API versions `2022-11-28` and
`2026-03-10`. Harbor therefore requires a classic OAuth App credential for its scope-based personal
workflow. GitHub App client IDs are rejected before sign-in, and `ghu_` credentials are rejected
before storage or reuse.

Harbor currently requests `repo workflow security_events project delete_repo gist user` and does
not preserve granted scopes in `GitHubOAuthCredentials`
([current OAuth implementation](../src-tauri/src/github_oauth.rs)). Add the package scopes to new
authorizations and preserve the granted normalized scope set, or inspect `X-OAuth-Scopes`. Existing
connections must reconnect; refresh cannot silently add user-granted authority. A missing private
resource may be returned as `404`, so the UI must not translate every `404` to "package missing"
without considering insufficient scopes
([REST troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#404-not-found-for-an-existing-resource)).

### Pagination and data model

`GET /user/packages` accepts `package_type`, optional `visibility`, `page`, and `per_page`. The
default page size is 30, the maximum is 100, and `page * per_page` cannot exceed 10,000. The supported
REST request types are `npm`, `maven` (also Gradle), `rubygems`, `nuget`, `container` (`ghcr.io`),
and legacy `docker`. Because the API requires exactly one type, the UI should make ecosystem a
server-side tab/filter instead of fetching six lists and inventing cross-type pagination.

Version lists use the same page controls and add `state=active|deleted`. Suggested stable IPC models:

```text
GitHubPackage {
  id, name, packageType, visibility, versionCount,
  owner, repository?, htmlUrl, createdAt, updatedAt
}

GitHubPackageVersion {
  id, name, state, license?, description?, deletedAt?,
  htmlUrl, createdAt, updatedAt, metadata
}
```

Container version names are commonly digests and human-facing tags live in
`metadata.container.tags`. Keep response enums forward-compatible and keep registry-specific
metadata as a narrow tagged union with an unknown/raw fallback. Encode `package_name` as one URL path
segment; GitHub explicitly requires slashes in path parameters to become `%2F`
([REST troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#404-not-found-for-an-existing-resource)).

### Destructive and recovery edge cases

GitHub permits deletion of a public version only while it has at most 5,000 downloads, and deletion
of an entire public package only while no version exceeds 5,000 downloads. The REST model does not
provide those totals for the granular registries, so Harbor must explain the rule and surface the
authoritative rejection rather than pre-compute a false capability.

A deleted package or version is restorable for 30 days only if its namespace has not been reused
([delete and restore rules](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package)).
Deleted versions remain discoverable through `state=deleted`; deleted whole packages do not have a
corresponding list parameter. This is why the first slice should support version delete/restore but
keep whole-package lifecycle in GitHub Web.

For registries with granular permissions, package ownership survives a repository transfer while
the link can be removed; Maven/Gradle packages inherit repository scope and transfer with the
repository. Do not identify a package solely by its optional linked repository.

### Harbor implementation pattern

- Add a focused `GitHubPackagesClient` deep module and keep route construction, percent encoding,
  response mapping, ownership guards, and fake Adapter tests there.
- Reuse `authenticated_client(token)` and Octocrab's generic HTTP methods. Octocrab 0.54.1 has no
  Packages handler, but its public `get`, `delete`, and `post` methods are intended for uncovered
  routes ([Octocrab module list](https://github.com/XAMPPRocky/octocrab/blob/e6f4fc128e001866df4c0d73d9745eda7e75639f/src/api.rs),
  [generic HTTP methods](https://github.com/XAMPPRocky/octocrab/blob/e6f4fc128e001866df4c0d73d9745eda7e75639f/src/lib.rs#L1525-L1775)).
- Use query keys shaped by account, package type, visibility, package name, version state, and page.
  After a version mutation, invalidate the exact package detail plus active and deleted version
  families; no optimistic deleted record should become authoritative.
- Put Packages beside Profile, Projects, and Gists as a lazy account workspace. A selected
  repository can later link into the same detail when a REST package record names that repository.
- Require the exact package name in delete confirmation and re-read the package/version before
  deletion. Keep publish/install instructions and settings behind explicit GitHub links.

## B. Repository Wiki

### Supported operations and transport

GitHub documents each Wiki as a Git repository. After an initial page exists, it can be cloned from
`https://github.com/OWNER/REPOSITORY.wiki.git`; files can be added or edited, committed, and pushed.
Only the default branch is rendered to readers
([adding or editing Wiki pages](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)).

GitHub REST and GraphQL expose the enabled flag (`has_wiki` / `hasWikiEnabled`) and can update that
repository setting, but their current references expose no Wiki page, revision, or content mutation
([REST repository update](https://docs.github.com/en/rest/repos/repos#update-a-repository),
[GraphQL Repository fields](https://docs.github.com/en/graphql/reference/repos#repository)). The
official GitHub CLI follows the same boundary: it loads the canonical base repository, checks
`HasWikiEnabled`, rewrites the clone URL to `.wiki.git`, and delegates content to Git
([GitHub CLI Wiki clone](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/repo/clone/clone.go#L143-L174)).

With that Git transport, Harbor can support these authoritative operations for an initialized Wiki:

| User job                       | Git operation                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------ |
| List/read/search pages         | Read the default-branch tree and blobs; search fetched text locally            |
| Create/edit/rename/delete page | Create a new tree and commit, then non-force push the default branch           |
| Read page history              | Walk commits that change the page path                                         |
| Compare revisions              | Diff the two selected blobs/trees                                              |
| Restore deleted or old content | Create a new commit restoring the selected blob; never reset or force-push     |
| Sidebar/footer                 | Read/write `_Sidebar.<extension>` and `_Footer.<extension>`                    |
| Enable/disable                 | Existing repository Settings route; disabling hides content without erasing it |

GitHub confirms that every Wiki change is a commit and its web UI can view, compare, and revert
revisions ([Wiki history](https://docs.github.com/en/communities/documenting-your-project-with-wikis/viewing-a-wikis-history-of-changes)).
Disabling a Wiki hides rather than deletes its pages, and re-enabling restores them
([disabling Wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/disabling-wikis)).

### Permissions, pagination, and models

Public-repository Wikis are available on GitHub Free; private-repository Wikis require GitHub Pro or
another paid plan. By default, users need repository write access to edit, although a public Wiki can
allow any signed-in GitHub user to edit
([about Wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis),
[Wiki access](https://docs.github.com/en/communities/documenting-your-project-with-wikis/changing-access-permissions-for-wikis)).
There is no dedicated Wiki OAuth scope. Public reads can be anonymous; private reads and pushes use
repository Git authority. Harbor should pass its token through a credential callback, never embed it
in a remote URL, persist it in Git config, or include it in logs. GitHub CLI's first-party credential
helper likewise supplies the active token only when Git asks for HTTPS credentials
([GitHub CLI credential helper](https://github.com/cli/cli/blob/40b742f76d68e6b1f472942a6368db4b5d765641/pkg/cmd/auth/gitcredential/helper.go)).

Git defines no page-number protocol. A Harbor model should carry commit and blob identities as stale
guards and page locally:

```text
GitHubWikiPage { path, title, format, blobOid, headOid, updatedAt?, htmlUrl }
GitHubWikiRevision { commitOid, parentOid?, message, author, committedAt }
GitHubWikiMutation { path, previousPath?, content?, message, expectedHeadOid, expectedBlobOid? }
```

Fetch before every write, require `expectedHeadOid`, build one commit, and push without force. A
non-fast-forward response is a conflict that preserves the user's draft. Serialize fetch/write work
per repository and treat the remote default branch as authoritative. GitHub documents a soft limit
of 5,000 total Wiki files, so the page list and search must remain bounded even though they are local
([about Wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis)).

### Content and initialization edge cases

- GitHub documents local cloning only **after the initial page has been created on GitHub**. With no
  public page-creation API, an uninitialized Wiki needs an honest "Create the first page on GitHub"
  fallback rather than an assumed empty remote push.
- The filename determines the title and its extension determines rendering. Reject backslash,
  slash, colon, asterisk, question mark, double quote, angle brackets, and pipe in titles, and
  preserve the original extension. GitHub uses its Markup library and supports more than Markdown;
  Harbor's current Markdown renderer must not claim parity for Textile, MediaWiki, AsciiDoc, or
  other formats. Show safe source plus a GitHub-rendered fallback until a maintained renderer
  exists.
- Wiki links, sidebar/footer files, and repository-relative images have different resolution rules
  from a repository README. Reuse Harbor's sanitizer and editor shell, but add a Wiki-specific URL
  resolver instead of reusing `resolveReadmeDestination` unchanged.
- Do not use the repository Contents or Git Database REST endpoints against `OWNER/REPO.wiki`.
  GitHub's documented and first-party path is Git transport, not an API-visible second repository.

### Harbor implementation pattern and dependency choice

Keep Wiki behind a focused `GitHubWikiClient`, but split Git transport and cache from the product
service:

```text
GitHubWikiClient -> WikiGitTransport -> bounded WikiObjectCache
```

Use a maintained MIT/Apache-2.0 Rust Git library rather than copying Git or other GPL source.
`gix` is the pure-Rust application API for gitoxide and covers clone, fetch, commit graphs, tree/blob
access, and push
([gitoxide project and license](https://github.com/GitoxideLabs/gitoxide),
[gix API](https://docs.rs/gix/latest/gix/)). Before adoption, spike HTTPS clone/fetch/push with an
in-memory credential callback on macOS and Windows, pin a release with current transport security
fixes, reject any remote outside exact `https://github.com/{owner}/{repo}.wiki.git`, and fail closed
on cross-authority redirects. The gitoxide project published credential-redirect advisories in 2026,
so dependency audit and redirect tests are release gates
([gitoxide advisories](https://github.com/GitoxideLabs/gitoxide/security/advisories)).

Do not depend on a system `git` or `gh` binary for the product path. Their source is useful as a
first-party behavior reference, but neither executable is guaranteed to exist on every Tauri target.

## Acceptance evidence for the recommended Packages slice

- A Harbor OAuth token granted `read:packages` successfully calls `GET /user/packages` in a live
  probe; missing scope produces the reconnect state without breaking other GitHub areas.
- Fake Adapter tests cover every route, package-name percent encoding, type/visibility/state/page
  validation, private-resource `404`, and `204` delete/restore responses.
- Query tests prove ecosystem-scoped pagination and exact invalidation of package detail plus active
  and deleted version lists.
- A deterministic desktop fixture covers empty, permission, rate-limit, active/deleted, destructive
  confirmation, restore, compact layout, and GitHub fallback states without locally invented package
  records.
- `pnpm check`, Rust format/check/test gates, and 1600x1000 plus 900x620 browser QA pass before the
  slice is committed, pushed, and opened as its own PR.
