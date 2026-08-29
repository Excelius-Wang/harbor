# GitHub Web parity

## Goal

Make Harbor's GitHub-native areas support complete in-app user workflows comparable to GitHub Web
before expanding Harbor-only discovery and agent features.

## Current state

Authentication, repository listing, code browsing, GitHub-style safe Markdown rendering, Issues,
Pull Requests, and repository Actions read workflows use GitHub APIs rather than product mock data.
The Tauri scripts load the standard environment-file cascade before Cargo starts, and Cargo tracks
both GitHub OAuth build variables, so a root `.env.local` now configures local login reliably.
New OAuth logins request GitHub's `repo` and `workflow` scopes. Repository and Actions writes need
`repo`; creating or editing a Release whose target changes `.github/workflows/` can additionally need
`workflow`. Existing lower-scope tokens remain usable for reads but must reconnect before the
corresponding writes can succeed; permission feedback says so.
The repository picker constrains Radix ScrollArea content width, so long repository metadata cannot
stretch every row past the sidebar or hide description text beneath the vertical scrollbar.
The dark workspace maps its semantic color tokens and Shiki preview to One Dark Pro Darker; neutral
surface blends use sRGB so near-gray theme colors do not drift toward an unintended hue.
The repository code workspace uses a 1360px cap for dense directory, commit, and source surfaces,
while README prose stays within 960px for readable line lengths.
Code now supports paginated repository and file history, paginated tags and tag browsing, GraphQL
blame, raw-file access, native Save As downloads, and repository-scoped code search over GitHub's
indexed default branch. Shared commit and Shiki source renderers keep the pull request, history,
preview, and blame views on the same presentation path. File downloads use Tauri's official dialog
plugin and Rust-side writes, without granting the WebView broad file-system access.
The complete Code backend now lives behind the eight-method `GitHubCodeClient` Interface in
`github/code.rs`. That module owns its public models, Service orchestration, Octocrab and fake
Adapters, REST and GraphQL transport, response mappings, repository-scope sanitization, preview
limits, and focused tests. Production code stays in the 988-line `code.rs`; the fake Adapter and ten
tests live in `code/tests.rs`. The root module only composes the Interface and re-exports the stable
types used by Tauri commands.
Repository Actions now supports paginated workflow runs, GitHub status and conclusion filters,
on-demand run Jobs, ordered Steps, automatic refresh while work is active, and lazy completed-Job
logs. Logs keep a bounded 2 MB tail in the WebView and retain an explicit GitHub fallback. Actions
and pull request checks share one execution-status model instead of duplicating state mapping.
Running or queued workflow runs can now be cancelled in place; completed runs can rerun every Job,
and failed or timed-out runs can rerun only failed Jobs and their dependants. The detail header uses
a destructive shadcn confirmation for cancellation and a compact rerun menu for completed runs.
Each completed Job can also rerun itself and its dependants from the detail row, matching GitHub Web
for successful as well as failed Jobs. Harbor reads the authoritative Job first, verifies its run ID
and completed status, then calls GitHub's native Job rerun route. Accepted requests invalidate every
cached run-list variant and the selected run's Job pages; permission failures keep the current state
and explain how to restore write access. The backend capability lives in the vertical
`github/actions.rs` deep module, which owns its public models, six-method Interface, Service
orchestration, Octocrab Adapter, test Adapter, raw response mappings, action-state validation, log
policy, and focused tests. Cancellation reuses Octocrab's native method; reruns use only the official
REST routes Octocrab does not yet wrap. Manual workflow dispatch now lives in the child deep module
`github/actions/dispatch.rs`, which owns a three-method Interface, Octocrab and fake Adapters,
workflow-YAML input parsing, authoritative validation, environment loading, and focused tests.
Harbor lists active workflows, branches, and tags, renders all five GitHub input types, and refetches
the run list after an accepted dispatch. Actions now also lists every repository workflow through
the focused one-method `github/actions/workflows.rs` inventory Interface and filters runs through
GitHub's per-workflow endpoint without loading dispatch branches or tags. Wide workspaces show a
searchable workflow sidebar; narrow workspaces use a Select while keeping status, pagination, and
detail state. Disabled workflows retain readable history and cannot start a different workflow by
accident. The run detail now lists every workflow artifact through GitHub's official paginated
endpoint and downloads active artifacts as ZIP files through Harbor's native Save As path. Expired
artifacts stay visible but disabled, download-time metadata is checked against the selected run, and
permission, expiration, loading, empty, retry, and file-system states remain in the desktop workflow.
This capability lives behind the focused two-method `github/actions/artifacts.rs` Interface and
reuses Octocrab's native list and download implementations. The root `github.rs` composes these
Interfaces and keeps stable type re-exports for Tauri commands; it owns no Actions route, production
implementation, or test Adapter. `github/actions.rs` is 1,121 lines,
dispatch is 973 lines, the inventory module is 152 lines, and the artifact module is 340 lines.
Actions run history now also supports status, branch, event, and triggering-actor filters through
GitHub's native server-side parameters. Filter options are workflow-aware and independently cached;
repository branches reuse the existing paginated branch loader, while recent workflow runs provide
event and actor values. Loading, permission, rate-limit, retry, filtered-empty, clear, pagination,
and narrow-layout states stay inside Harbor. The focused `github/actions/filters.rs` module owns the
option Interface and adapters instead of growing the transitional root module.
README images preserve bounded pixel dimensions from otherwise-discarded inline styles, so badges
and explicitly sized diagrams match their GitHub presentation without allowing arbitrary CSS.
Issue lists support open/closed state, repository-scoped GitHub search, unassigned and label filters,
sorting, and 30-item pagination. In-app Issue detail renders the canonical body, comments, metadata,
and paginated timeline while preserving the previous list state. Harbor now creates Issues with a
safe Markdown preview and edits their title and body in place, including intentionally clearing the
body. Issue detail also posts Markdown comments and closes or reopens Issues. Returned records update
the active conversation and cached lists immediately, then invalidate related TanStack Query entries
for reconciliation. The Rust mutation boundary verifies that an existing number belongs to an Issue
before writing. Issue detail now also edits assignees, labels, and milestones through one shared
shadcn dialog. Assignee and milestone options load lazily into separate repository-scoped caches;
metadata writes replace all three fields atomically and verify GitHub's returned record so a silently
dropped value is reported as a permission error instead of false success. The complete Issue
backend now lives behind the eleven-method `GitHubIssueClient` Interface in `github/issue.rs`. That
module owns its public models, Service delegation, Octocrab and fake Adapters, REST transport,
repository-scoped search policy, response mappings, and focused tests. Its 1,078 production lines and
478 test lines no longer live in the transitional root module; `github.rs` is now 3,651 lines and
only composes the Issue Interface and stable Tauri type re-exports.
The account Issues area now reads cross-repository GitHub search results for Issues created by,
assigned to, or mentioning the signed-in user. Open/closed state, search, sorting, 30-item
pagination, repository identity, and detail prefetch use one account-scoped TanStack Query family.
Repository, organization, user, and label qualifiers can narrow a view without overriding its
author/assignee/mention boundary. Each item opens the existing native Issue conversation and write
workflows, then returns to the same inbox state. Returned comments and edits synchronize both
repository and account list caches; state changes are removed from stale open or closed caches before
authoritative invalidation. Search results do not carry a default branch, so the existing Markdown
renderer uses symbolic `HEAD` instead of guessing or adding a repository lookup per item.
Repository Discussions now has a native Harbor workspace backed by GitHub's current GraphQL API.
The focused `github/discussion.rs` deep module owns its thirteen-method Interface, public models,
Service orchestration, Octocrab and fake Adapters, cursor queries, category and repository-ID
validation, mutation guards, response mappings, and focused tests. The repository tab handles enabled
and disabled states, category/open/closed/answer filters, created/updated ordering, cursor loading,
Markdown detail, nested replies, create/edit, comment/reply/edit-comment, discussion and comment
upvotes, answer selection, close/reopen reasons, poll rendering and voting, and confirmed destructive
deletion. Discussion and comment deletion use GitHub's viewer capabilities plus authoritative node
scope checks; deleting a parent comment with replies preserves the server's tombstone and thread,
while deleting a leaf removes it from cached pages and adjusts root-comment counts. Returned records
synchronize list and detail Infinite Query caches before focused invalidation. Discussion
notifications open this native detail instead of forcing GitHub Web. Top-level comments paginate 30
at a time; each thread keeps up to 100 replies and explicitly offers GitHub for the remainder. The tab
and detail are lazy chunks, so the workflow does not grow the main page beyond its previous bundle
threshold. GitHub's documented `CreateDiscussionInput` exposes no poll question or option fields, so
Harbor does not invent an undocumented native poll-creation mutation.
Repository Releases now has a native read and write workspace behind the focused nine-method
`GitHubReleaseClient` Interface. Harbor paginates releases, preserves draft, pre-release, immutable,
author, target, notes, archive, asset, digest, and download metadata, and renders release notes
through the existing safe GitHub Markdown path. It creates draft or published releases, edits their
tag, target, title, notes, draft, and pre-release state, uploads and deletes assets, and deletes the
Release itself through confirmed actions. Published immutable releases expose only GitHub's allowed
title and notes edits; their assets remain locked, while complete Release deletion remains available.
Active assets and source zip or tar.gz archives use the existing native Save As flow. The Adapter
rereads the authoritative release before scoped operations, verifies release and asset identity,
uploaded state, mutability, and downloaded byte length, and rejects untrusted upload hosts. Uploads
use GitHub's returned hypermedia URL, encoded file names, native file selection, streaming bodies,
and the documented under-2-GiB limit instead of loading an entire asset into memory. Shared
cross-platform filename sanitization serves both Releases and Actions artifacts. Repository and
notification entry points lazy-load the list and detail chunks; Release notifications open natively
only when GitHub supplies the stable release ID, without guessing from the subject title.
Pull request lists support open/closed state, repository-scoped GitHub search, labels, sorting, and
30-item pagination. In-app pull request detail renders conversation and reviews first, then lazily
loads commits, checks, statuses, and changed files into independently cached tabs. Changed files use
the maintained `react-diff-view` parser and renderer with single-column and two-column layouts; wide
diffs scroll locally without widening the desktop workspace. Pull request detail now edits the title
and body with Markdown preview and posts ordinary conversation comments. Returned data synchronizes
the conversation, repository list, and account inbox before focused cache invalidation. Files changed
now submits comment, approval, and change-request reviews against the displayed head commit. Returned
reviews update the timeline and latest reviewer decision immediately.
Files changed also exposes line-comment controls through `react-diff-view`'s existing gutter and
widget APIs. Markdown comments are staged against GitHub's modern path, line, side, start-line, and
start-side coordinates, stay editable across tabs and changed-file pages for the current pull request
head, and are submitted in the same real GitHub review payload. Reviewers can select a range by
Shift-clicking line numbers or dragging the comment control across one Diff side; single-line drafts
keep their original payload. Failed writes retain both the review summary and line-comment drafts.
The pull request header switches to a compact presentation in narrow detail panels, leaving a usable
changed-files viewport at 900x620.
Pull request detail now completes direct merge, squash, and rebase flows through Octocrab's native
merge builder. The confirmation dialog carries the displayed head SHA as a stale-revision guard,
allows GitHub-style commit title and message edits for merge and squash, and omits those fields for
rebase. Draft, closed, merged, conflicting, calculating, and mergeable states render separately;
write-permission failures stay in the dialog. GitHub's authoritative post-merge pull request updates
the conversation, repository list, and account inbox caches before focused invalidation.
Files changed now reads submitted review threads through GitHub's cursor-paginated GraphQL thread
model. Current line conversations render in the existing Diff widgets; file-level, outdated, and
otherwise unplaceable conversations remain visible below their file. Resolved and GitHub-collapsed
threads start compact, pending comments keep their server state, and thread node IDs and viewer
capabilities are preserved for focused mutations. Users can now reply inside a submitted thread and
resolve or reopen conversations without leaving Harbor. Actions are gated by GitHub's viewer
capabilities, authoritative mutation responses patch the existing infinite-query cache, failed
replies retain their Markdown draft, and reopening clears stale resolver metadata immediately.
The account Pull Requests area reads cross-repository GitHub search results for pull requests created
by, assigned to, or awaiting review from the signed-in user. Open/closed state, search, sorting,
30-item pagination, repository identity, and detail prefetch are independently cached. Each item opens
the existing repository pull request detail workspace and returns to the same inbox state.
Files changed now restores the signed-in user's pending review directly from GitHub, including the
review summary and editable line comments. Line-comment saves, edits, and deletes write through
immediately; summary drafts use an explicit Save draft action. The restored review is shared through
one pull-request-scoped TanStack Query entry, so navigation and an app restart no longer discard it.
Pending comments returned by both the review and thread APIs are deduplicated by GitHub node ID.
Harbor warns when a draft belongs to an earlier head commit, retains input after permission failures,
and requires confirmation before deleting the server-side review. The backend follows GitHub's
native pending-review lifecycle with Octocrab REST review/comment operations and the modern
`addPullRequestReviewThread` GraphQL mutation. This lifecycle lives behind a focused
`GitHubPendingReviewClient` sub-interface and `github/pending_review.rs` deep module instead of
expanding the root GitHub client implementation.
Pull request detail now closes and reopens unmerged pull requests in place through GitHub's native
REST update builder. The returned pull request updates every cached conversation, removes the item
from stale open or closed repository and account lists, and then invalidates those focused queries.
Permission failures keep both the current state and comment draft. Existing pull request writes were
moved with the new state mutation behind `GitHubPullRequestMutationClient` in
`github/pull_request/mod.rs`; the root `github.rs` dropped from 6,908 to 6,455 lines and no longer owns
their production or fake Adapter implementations. Pull request detail now also edits assignees,
labels, and milestones in place. GitHub exposes these pull request fields through the Issues update
endpoint, so both item kinds use one verified `github/item_metadata.rs` write boundary, the same
repository-scoped option caches, and one shadcn selection experience. The full pull request is read
again after a successful metadata write before detail, repository-list, and account-inbox caches are
reconciled. Permission failures keep every staged selection in the open dialog.
Pull request detail now manages individual and Team review requests in place. Candidate users reuse
the repository assignee cache, while visible repository Teams use a separate five-minute option
cache. Each request, removal, or re-request is sent immediately through Octocrab's native review
request endpoints; Harbor reloads the authoritative pull request before updating conversation,
repository-list, and account-inbox caches. A currently requested reviewer overrides an older approval
or change-request decision in the sidebar, matching GitHub's pending state after re-request. Team-only
removals still send the REST endpoint's required empty `reviewers` array. Transport, verification,
test Adapter, and Team models live behind `GitHubPullRequestReviewerClient` in
`github/pull_request/reviewer.rs`; the root module only re-exports the public Team models.
The Issues UI keeps list orchestration, detail loading, mutations, timeline rendering, and shared
presentation in separate modules; pagination, comment avatars, and comment fields compose the
official shadcn components.
Pull request detail now changes its review stage in place. Draft pull requests expose Ready for
review in the merge box; open pull requests expose Convert to draft under Reviewers with a shadcn
confirmation dialog. The focused `github/pull_request/lifecycle.rs` module preloads the pull request
node ID and state, makes the official GraphQL mutation idempotently, rejects closed or merged pull
requests, verifies the mutation response, and reloads the authoritative REST pull request before
detail, repository-list, and account-inbox caches are reconciled. GraphQL permission and rate-limit
failures retain stable IPC error codes and keep the current UI state. This implementation stays out
of the oversized root `github.rs`, which remains transitional architecture debt and is scheduled for
incremental vertical extraction rather than a risky all-at-once rewrite.
Pull request detail now updates a behind head branch without leaving Harbor. The focused
`github/pull_request/update_branch.rs` deep module owns the two-method status/write Interface,
Octocrab and fake Adapters, the same minimal GraphQL `baseRef.compare` query used by GitHub CLI, the
official REST update route, expected-HEAD validation, response mapping, and focused tests. The merge
box shows the authoritative behind count, keeps permission and conflict failures in an accessible
confirmation dialog, and treats REST 202 as accepted work rather than completion. Harbor polls the
focused status cache until GitHub publishes a different head SHA, then invalidates pull request
detail, commits, files, review state, checks, repository lists, and the account inbox. Polling stops
after one minute with a manual status refresh that does not submit a second update. The root
`github.rs` only adds the Interface composition and stable result re-exports.
Repository pull requests can now be created without leaving Harbor. The flow reuses the cached Code
overview for branch choices, compares the selected base and head through Octocrab's native Compare
API, shows commit and file totals, shares the existing GitHub Markdown title/body editor, and supports
draft creation. The focused `github/pull_request/creation.rs` module owns the two-method Interface,
Octocrab and fake Adapters, comparison mapping, safe title suggestion, pre-write comparison guard,
stable 422 conflict mapping, and focused tests. Harbor trusts GitHub's successful create response,
primes the new conversation cache, opens it immediately, and then invalidates related list and detail
queries for reconciliation. Permission failures retain every field and can retry in place. The root
`github.rs` only composes the new Interface; the focused creation module is 497 lines.
Pull request detail now enables and disables GitHub Auto-merge without leaving Harbor. The focused
`github/pull_request/auto_merge.rs` deep module owns the three-method status/write Interface, the
official GraphQL capability query and mutations, repository-allowed merge methods, viewer
capabilities, expected-HEAD validation, response verification, authoritative reconciliation,
Octocrab and fake Adapters, stable conflict errors, and focused tests. Permission failures retain the
selected merge method for retry, disabling requires confirmation, and repository-disabled,
unavailable, ready-to-merge, and Merge Queue states remain distinct. The production module is 656
lines and its Fake Adapter and ten focused tests live in `auto_merge/tests.rs`; `github.rs` is 3,573
lines and only composes this Interface and its stable status re-export. Merge Queue is intentionally
read-only in this slice because enqueueing and ordinary Auto-merge are separate GitHub workflows.
Pull request Merge Queue now supports the distinct GitHub workflow in place. A focused
`github/pull_request/merge_queue.rs` deep module reads the base branch capability, repository write
permission, merge requirements, queue entry state, position, enqueuer, and estimated wait. It calls
GitHub's official `enqueuePullRequest` and `dequeuePullRequest` mutations directly, guards enqueueing
with the displayed head SHA, verifies mutation identity, and rereads authoritative state after every
write. The Merge Panel uses one focused polling cache, preserves Auto-merge only for branches without
a queue, and reuses the shared revision guard and installed shadcn dialogs. Code and API-schema
verification pass; deterministic desktop interaction and responsive visual checks remain pending
because no in-app browser instance was available.
The pending Merge Queue desktop checks are complete, and the repository Code write workflow now has
deterministic coverage for create, edit, atomic rename or move, delete, branch creation, and branch
deletion at both supported viewport sizes.
Repository Insights now has a native Overview, Contributors, and Traffic workspace. The focused
three-method `GitHubInsightsClient` owns community profile metrics, commit activity, code frequency,
contributor activity, views, clones, referrers, and popular paths. Statistics generation keeps
GitHub's `202 Accepted` state explicit and polls only the focused query; unavailable large-history
statistics stay distinct from errors. Traffic remains independently permission-gated so a missing
push permission does not hide the public Overview or Contributors data. The frontend reuses TanStack
Query, shadcn Cards, Charts, Tables, Tabs, Select, and existing repository navigation rather than
adding a parallel data or component layer. The verified slice is open as pull request
`https://github.com/Excelius-Wang/harbor/pull/1`.
Harbor now has an account-level Notifications workspace backed by GitHub's official REST inbox.
The focused `github/notification.rs` deep module owns its three-method Interface, Octocrab and fake
Adapters, notification and repository mapping, subject-to-Web target policy, page bounds, read and
done writes, mark-all-read orchestration, and focused tests. The workspace lists unread notifications
across repositories, separates all and participating scopes, paginates 50 at a time, refreshes once a
minute while mounted, and supports single read, confirmed done, and confirmed mark-all-read actions.
Issue, pull request, Discussion, Release, Workflow Run, Check Suite, and Commit subjects with stable
API identities open through existing in-app detail workspaces. Subject parsing requires the exact
notification repository and official resource path, rejects branch-like commit refs, and never
guesses an identity from the title. Workflow Run notifications load the authoritative run by ID and
reuse the complete Actions Jobs, logs, artifacts, cancel, and rerun detail. Check Suite notifications
load the suite by ID and list only that suite's Check Runs rather than every check on its head commit.
Commit notifications open the existing Code workspace at the exact SHA, including its detached
reference and repository tree. Security and unknown subject types keep explicit GitHub destinations
until their native Harbor areas exist. Notification repository payloads omit
`default_branch` in the live API, so Harbor uses the symbolic `HEAD` reference instead of guessing
`main` or adding one repository lookup per row. GitHub's public API cannot distinguish read Inbox
threads from Done threads and cannot list Saved or Done, so Harbor exposes only the authoritative
unread views rather than inventing local server state. Deterministic desktop interaction now covers
Workflow Run, Check Suite, and Commit targets plus Inbox page restoration at both supported viewport
sizes without root overflow or browser warnings.
Commit-wide checks, Check Suite metadata, and suite-scoped Check Runs now live behind the focused
three-method `github/checks.rs` Interface with production and fake Adapters, response mappings, and
route tests. The transitional root module only composes and re-exports this capability; it no longer
owns check transport or raw response models.
The repository picker now reads every authenticated repository page instead of stopping at 100.
Page one remains immediately usable while later pages load sequentially into one infinite-query
cache; repositories are deduplicated by GitHub ID. Later-page failures preserve loaded data and can
retry in place, complete search covers every loaded page, and refresh preserves the selected
repository. Discover is sample data, and the Rail checks/comments views are placeholders.
Repository Security now handles Dependabot, code-scanning, and secret-scanning alerts natively. The
focused five-method `GitHubSecurityClient` Interface owns list, detail, evidence, and update flows,
with family-specific filters, state vocabularies, dismissal reasons, permission and unavailable
errors, authoritative response verification, and focused tests. The lazy repository workspace shows
compact alert lists, risk metadata, Code Scanning instances, safe Secret Scanning locations, and
confirmed close or reopen actions. Secret requests always send `hide_secret=true`, raw models omit
the secret field, and tests verify that no secret literal can enter the IPC payload. Exact
repository-scoped security notification subjects open the matching Harbor detail; unstable or
unsupported security subjects retain an explicit GitHub fallback. New OAuth logins request
`security_events`; existing connections must reconnect before these endpoints can use that scope.
Personal Projects v2 now has a native account workspace backed by GitHub's current GraphQL API. The
focused eight-method `GitHubProjectsClient` Interface owns personal project lists and details,
cursor pagination, current field and view unions, create/update/delete, draft and repository-linked
items, typed field updates, archive/restore/removal, personal-owner guards, and focused tests. The UI
lazy-loads from the primary navigation, renders GitHub table, board, and roadmap layouts, and opens
linked Issues and pull requests through the existing native details. Wide layouts use a list/detail
workspace; compact layouts start on the list and preserve a functional back path. Organization-owned
Projects and administration are rejected at the Rust boundary. New OAuth logins request `project`;
existing connections without that scope keep other GitHub workflows and receive an explicit
reconnect explanation when Projects is opened.
Repository relationships now cover the signed-in user's complete personal Star, Watch, and Fork
workflow. The focused five-method `GitHubRepositoryRelationshipsClient` Interface owns starred
repository pagination and sorting, selected-repository relationship state, Star writes, all three
GitHub notification levels, and personal Fork creation. The repository workspace reuses its existing
list, detail, query, and shadcn infrastructure for My repositories and Starred sources; relationship
writes reconcile focused caches and counts before authoritative invalidation. Fork ownership is
fixed to the signed-in account, personal repositories cannot be forked back into the same owner, and
the backend exposes no organization destination. Fork creation follows GitHub CLI's recent-created
guard and tells the user that Git objects can remain briefly unavailable after GitHub accepts the
asynchronous request.
Personal repository lifecycle management is now native. Harbor creates repositories only under the
signed-in personal account, loads current Gitignore and license templates from GitHub, and supports
README initialization plus repository feature choices. Owner-only Settings covers name, description,
homepage, default branch, public or private visibility, template use, Issues, Projects, Wiki,
Discussions, all three merge methods, Auto-merge, update-branch suggestions, post-merge branch
deletion, archive or unarchive, and permanent deletion. The focused five-method
`GitHubRepositorySettingsClient` Interface owns the transport, authoritative owner and branch guards,
response verification, and tests. Visibility and archive changes require explicit consequence flags;
deletion requires the exact full repository name and the OAuth connection now requests GitHub's
`delete_repo` scope. Personal repository owners can now list collaborators and pending invitations,
invite an exact GitHub username, cancel a pending invitation, and remove a collaborator. Personal
repositories expose only the owner and one read/write collaborator role, so Harbor does not invent
organization-only permission choices. Organization creation, transfer, organization collaborator
administration, billing, organization rulesets, and organization-level security administration
remain deliberately outside the personal-product boundary.
Personal Gists now have a complete native account workspace. The focused eleven-method
`GitHubGistClient` Interface owns personal, Starred, and recent-public pages; detail and safe file
content; creation and multi-file editing; Star, Fork, and exact-ID deletion; revision pages and
revision detail; and comment list, create, edit, and delete workflows. It reuses Octocrab's existing
Gist builders and adds narrow REST transport only for Starred pages and comments that Octocrab does
not wrap. Authoritative owner, file-set, visibility, Star, Fork, comment-scope, and response guards
stay inside the deep module. The lazy account UI reuses TanStack Query, shadcn, the existing Shiki
source path, and the sanitized Markdown renderer. Public and secret creation, multiple files,
renaming and deletion, revision browsing, personal Fork navigation, comment capabilities, large-file
raw fallback, and compact list-to-detail navigation remain in Harbor. A truncated API file cannot be
edited in Harbor because doing so could overwrite content GitHub did not return. New OAuth logins
request GitHub's `gist` scope; existing connections can reconnect without losing access to other
areas.
Personal profiles and the social graph now have a native account workspace behind the focused
six-method `GitHubProfileClient` Interface. Harbor reads the signed-in or selected user's public
profile, edits every public field GitHub exposes, renders the last-year contribution calendar and
totals, paginates followers, following, and public activity, and follows or unfollows another user.
REST owns profile, relationship, and activity transport; GraphQL is used only for GitHub's
contribution collection. The backend rejects organization identities and unsafe usernames, verifies
the authoritative profile after writes, and keeps the surface limited to personal users and bots.
The lazy UI reconciles viewer and selected-user caches, preserves relationship counts, and states
GitHub's documented public-activity window instead of presenting it as a complete audit log. New
OAuth logins request the `user` scope, while existing lower-scope connections retain unrelated
workflows and receive focused permission feedback.
Discover now uses GitHub's authenticated APIs instead of bundled sample repositories. The focused
two-method `GitHubDiscoveryClient` Interface owns repository, code, Issue, pull request, and personal
user search plus the signed-in developer's received-events feed. Harbor preserves GitHub's native
query qualifiers, owns only each tab's result discriminator and valid sort vocabulary, surfaces
incomplete results and the 1,000-result search boundary, and documents the activity API's 30-day and
300-event window. Results reuse the existing Code, Issue, pull request, profile, and repository
details, including direct source-file navigation. The old mock-data module and fake pinned-repository
Discover list are gone; the workspace lazy-loads the 17.02 kB discovery chunk and the shared home
chunk fell to 476.28 kB.
Repository Code now supports native personal file writes and branch lifecycle. Harbor creates, edits,
renames, moves, and deletes UTF-8 files on an explicitly selected branch; every write carries the
displayed blob and branch SHAs, creates one atomic Git tree and commit, updates the ref without force,
and rereads the authoritative file and ref before reconciling TanStack Query caches. Empty repositories
use GitHub's Contents API only for the first file, because Git database refs do not exist yet. Personal
developers can create a branch from an exact source SHA and delete non-default branches after an exact
SHA confirmation. The focused `GitHubCodeMutationClient` owns normalization, permission and archived
repository guards, conflict mapping, Git transport, response verification, and tests. The Code UI
reuses the existing overview, Markdown editor, Shiki preview, shadcn dialogs, toasts, and query roots;
workflow-file scope requirements and protected/default-branch failures remain explicit.
Personal Packages now has a native account workspace behind the focused four-method
`GitHubPackagesClient` Interface. Harbor lists one selected ecosystem with server-side visibility
and page filters, loads authoritative Package details, and paginates active or recently deleted
versions. Version deletion requires the exact Package name and rechecks both Package and version
identity before writing; restoration resolves the selected version from GitHub's deleted-version
inventory before calling the official restore route. Raw 204 write responses are checked without
trying to parse an empty JSON body. Successful writes invalidate inventory, detail, and both
version-state query families instead of inventing local Package state. Package visibility and
registry metadata keep explicit unknown fallbacks, while container tags remain sorted and
deduplicated. Publishing, install commands, visibility, access, repository linking, and
whole-Package deletion retain explicit GitHub links. New OAuth logins request `read:packages`,
`write:packages`, and `delete:packages`; returned scopes are normalized and stored with a
backward-compatible empty-scope migration. Known lower-scope connections fail before transport,
while legacy credentials probe GitHub and treat a hidden private-package 404 as a reconnect state.
Repository Insights is complete on open pull request #1, and Personal Packages is complete on open
pull request #2; both remain unmerged pending pre-merge verification. The reusable ignored live probe
uses Harbor's `SystemCredentialStore` and production GitHub client without printing credentials. Its
latest run returned `GitHubNotConnected` because no saved Harbor OAuth connection exists in the
current Keychain.

Issues, pull requests, review summaries, inline review comments, Discussions, nested Discussion
replies, and Releases now share one native GitHub Reactions workflow. The focused
`GitHubReactionClient` uses GitHub's `Reactable` GraphQL contract, keeps global node IDs opaque,
verifies exact subject kind and repository ownership, batches reads at 100 nodes, and applies
idempotent desired-state writes with authoritative response checks. Release choices are limited to
their documented six values while other supported subjects expose all eight. The shared TanStack
Query provider batches each visible conversation, serializes mutations, cancels stale reads before
optimistic updates, rolls back on failure, and replaces every cached copy with GitHub's returned
groups. Discussion upvotes remain a separate GitHub capability instead of being conflated with
thumbs-up reactions.
The completed Reactions slice is open and mergeable in
[PR #4](https://github.com/Excelius-Wang/harbor/pull/4) from `feat/github-reactions`.

Issue and pull request conversation comments plus submitted pull request review comments now support
native editing and confirmed permanent deletion. The focused `GitHubCommentClient` preloads the
selected repository, exact comment node, parent Issue or pull request, viewer capabilities, and
displayed revision before writing through GitHub's current GraphQL mutations. Issue comments and
pull request conversation comments remain explicitly discriminated even though GitHub models both
as `IssueComment`; submitted review comments require `PullRequestReviewComment` and `SUBMITTED`
state. Returned comments update every matching TanStack Query cache before focused invalidation,
while deletion refetches the authoritative parent instead of guessing counts or tombstones. Shared
shadcn edit and destructive-confirmation dialogs preserve Markdown drafts across conflict and
permission failures. Review comment database IDs accept GitHub's current GraphQL `BigInt` string
shape instead of relying on the removed integer field.
The completed comment-lifecycle slice is open in
[PR #5](https://github.com/Excelius-Wang/harbor/pull/5) from `feat/github-comment-lifecycle`.

Repository commits now open in a native read-only detail from Code history, recent commits, blame,
pull request commits and comparisons, and Commit notifications. The existing `GitHubCodeClient`
Interface uses GitHub's authenticated commit REST endpoint and Link headers for pages of 100 changed
files, preserves nullable actors and statistics, signatures, merge and root parents, renames, binary
files, and GitHub's 3,000-file response limit. The UI reuses the maintained `react-diff-view` parser,
shares its read-only renderer with pull request files, supports unified and split layouts, opens
available source files inside Harbor, and keeps an explicit GitHub fallback. A primary-source gap
audit is stored in `docs/GITHUB_PERSONAL_WEB_GAP_AUDIT.md`; it confirms that personal repository
collaborators remain in scope while organization and Team administration do not. Delivery is open
and mergeable in GitHub pull request #6.

Issue and pull request details now share native conversation controls. The focused three-method
`GitHubConversationClient` Interface owns exact Issue-or-pull-request identity, lock state and reason,
viewer permissions, subscription state, and the corresponding writes. Lock and unlock reuse
Octocrab's existing REST Issues transport for both conversation kinds; subscriptions use GitHub's
official GraphQL `updateSubscription` mutation through the existing authenticated client. Every write
reloads authoritative state before the focused TanStack Query cache and existing Issue or pull request
caches are reconciled. The shared shadcn sidebar control preserves ignored notifications, exposes all
four GitHub lock reasons, and shows lock actions only to viewers with repository write access.
Received repository invitations now stay inside the personal account workspace. The focused
two-method `GitHubRepositoryInvitationClient` Interface lists every open invitation for the signed-in
user and accepts or declines it through GitHub's official account-scoped routes. The Notifications
header keeps a permanent invitation entry even when the inbox is empty, while exact
`RepositoryInvitation` subjects open the same native view and mark the notification read. The lazy
UI preserves repository, inviter, permission, privacy, pagination, loading, empty, retry, confirmed
decline, mutation failure, and responsive states. Accepted invitations invalidate the authenticated
repository cache; both actions reconcile the invitation and notification caches by immutable IDs.
The verified slice is open as PR #9 from `feat/github-repository-invitations`.
Repository Issue taxonomy management is now native in PR #10. The focused two-method
`GitHubIssueTaxonomyClient` Interface owns label and milestone writes, saved-credential delegation,
input normalization, route encoding, exact deletion confirmation, response verification, and focused
tests. The repository Issues workspace reuses its existing label and milestone queries, TanStack Query
roots, and shadcn components for label create, rename, color and description edits, and deletion plus
milestone create, edit, due-date clearing, close, reopen, progress, and deletion. Returned records
reconcile option caches immediately before related Issue, pull request, inbox, and Project queries are
invalidated. Organization administration remains outside this repository-scoped developer workflow.
Personal repository Settings now includes a native GitHub Pages workspace behind the focused
three-method `GitHubRepositoryPagesClient` Interface. Harbor enables and disables Pages, switches
between branch and GitHub Actions publishing, validates branch sources, updates custom domains and
HTTPS enforcement, polls DNS health and active builds, paginates legacy deployment history, and
requests branch rebuilds. The Adapter reuses the authoritative personal-owner and archived-repository
guard, sends `null` when clearing a CNAME, verifies GitHub's returned configuration, and keeps Actions
deployments in the existing Actions workflow instead of inventing Pages build records. The lazy
shadcn UI and focused TanStack Query roots cover loading, empty, permission, build failure, DNS pending,
archived, narrow-layout, and destructive-confirmation states. PR #11 is open, mergeable, and clean:
https://github.com/Excelius-Wang/harbor/pull/11 (`2515932`). Playwright CLI session state is now
ignored by Git through `.playwright-cli/`.
The workspace shell is responsive, starts at 1600x1000, and remains usable down to 900x620.
Repository Wiki now has a native personal-developer workflow behind a focused Git-backed service.
Harbor discovers the Wiki's real default branch, keeps a bounded bare cache per immutable repository
ID, reads Markdown and source-only pages, renders Sidebar and Footer content, follows unambiguous
relative Wiki links in app, and supports guarded create, edit, delete, history, comparison, and revert
commits without force-pushing. Every write carries the displayed head and blob revisions, verifies the
authoritative remote result, and preserves a stale draft as a stable conflict. Offline cached reads are
explicitly read-only; private relative assets never receive OAuth credentials from the WebView. A
disabled or uninitialized Wiki keeps a narrow GitHub Web fallback because Smart HTTP cannot reliably
bootstrap the first page. Authentication failures remain authentication failures instead of being
misreported as an uninitialized Wiki. The injected `WikiRepositoryStore` Interface now owns Git
transport, bounded cache access, locking, pruning, reads, and writes outside `GitHubService`;
repository-local search reads both page metadata and UTF-8 bodies at one immutable Wiki head. Local
Playwright and TypeScript build artifacts are ignored.
The verified Wiki slice is published as GitHub pull request #3 from `feat/repository-wiki`.

## Next action

Complete the cumulative integration and verification of pull requests #1 through #11, then merge
them through the protected `main` branch without disturbing the parked Actions administration work.

## Verification

Each GitHub parity slice must use real API data, cover loading/empty/error/permission states, preserve
repository context and navigation, and complete its primary path without forcing a browser fallback.
Run `pnpm check`, the Rust check suite when Rust changes, and a focused desktop interaction check.

Personal Packages verification covers exact Tauri query and mutation arguments, every official read
and version-write route, single-segment Package-name encoding, private-resource 404 handling, and
realistic 204 delete and restore responses. It also covers bounded Package identities and pages,
normalized OAuth-scope persistence and legacy credential migration, linked-repository mapping,
forward-compatible visibility and metadata (including malformed future container payloads),
personal-only request enum rejection, deduplicated container tags, cross-registry rejection,
saved-credential delegation, stable conflict errors, and focused cache invalidation. `pnpm check`
passes with 128 frontend tests; 241 Rust tests pass with one external DeepWiki test ignored by design;
`cargo fmt --check`, `cargo check`, the production build, and `git diff --check` pass. Deterministic
desktop fixtures verified ecosystem and visibility filters, empty, permission, rate-limit,
active/deleted, exact-name deletion confirmation, public-version deletion guidance,
deletion-to-recently-deleted reconciliation, restoration, explicit GitHub fallbacks, compact back
navigation, and the 1600x1000 and 900x620 layouts. Document width equals viewport width, and the
browser console reports zero errors and warnings. The focused live probe now runs through the same
credential and service boundary as the desktop app, but its latest run returned
`GitHubNotConnected`; no credential was read, printed, or exported.

Repository Wiki verification covers canonical credential scoping, nonstandard remote default branches,
origin recovery, token-free cache configuration, bounded page mutations, stale-head conflicts,
authoritative create/edit/delete pushes, history, comparison, linear revert commits, body search, and
authentication error classification. `pnpm check` passes with 132 frontend tests; 238 Rust tests pass
with one external DeepWiki test ignored by design; `cargo fmt --check`, the production build, and
`git diff --check` pass. RustSec previously reported the same nine pre-existing advisories as
`origin/main`; this environment does not currently have the `cargo audit` subcommand installed.
A deterministic desktop fixture verified browsing, native relative links, credential-safe private
assets, new-page preview, and revision history at 1600x1000 and 900x620. Both sizes keep document width
equal to viewport width, and the browser console reports no product errors or warnings.

GitHub Reactions verification covers current official GraphQL schema fields, eight supported
Reactable kinds, opaque node IDs, selected-repository guards, Release vocabulary restrictions,
nullable and sparse groups, duplicate and inconsistent response rejection, saved-credential
delegation, desired-state IPC arguments, 100-node batching, canonical cache replacement, optimistic
add/remove, rollback support, and mutation serialization. `pnpm check` passes with 129 frontend
tests; 228 Rust tests pass with one external DeepWiki test ignored by design; `cargo fmt`, `cargo
check`, the production build, `git diff --check`, and Clippy pass with the same 11 pre-existing
warnings and no new warning. A deterministic Playwright fixture verified Issue and pull request
bodies, conversation comments, review summaries, inline review comments, Discussions, nested
replies, Releases, separate Discussion upvotes, exact batch and mutation arguments, and six-versus-
eight choice menus. At 900x620 and 1600x1000 the document dimensions equal the viewport; the browser
console reports zero errors and zero warnings. Screenshots and the reusable fixture stay ignored
under `output/playwright/`.

Conversation-control verification covers exact Issue and pull request identities, GraphQL integer
bounds, write-permission mapping, lock-reason REST values, subscription mutation payload and response
verification, saved-credential delegation, exact Tauri arguments, and detail/list/inbox cache
reconciliation. `pnpm check` passes with 130 frontend tests; 231 Rust tests pass with one external
DeepWiki test ignored by design; `cargo fmt --check`, `cargo check`, `cargo clippy --all-targets`, the
production build, and `git diff --check` pass. Clippy reports the same 11 existing warnings and no new
warning. A deterministic desktop fixture verified subscribe, unsubscribe, lock with reasons, unlock,
authoritative UI updates, and exact Issue and pull request mutation arguments at 1600x1000 and
900x620. Both sizes have no page-level horizontal overflow, and the browser reports zero errors and
zero warnings.

Personal repository access verification covers exact owner-scoped collaborator and invitation REST
routes, personal-owner guards, GitHub username normalization, write-only personal invitation roles,
saved-credential delegation, paginated query separation, exact Tauri mutation arguments, and cache
reconciliation. `pnpm check` passes with 128 frontend tests; 228 Rust tests pass with one external
DeepWiki test ignored by design; Rust format, `cargo check`, `cargo clippy --all-targets`, the
production build, and `git diff --check` pass. Clippy reports the same 11 existing warnings and no new
warning. A deterministic desktop fixture verified pending invitations, retained permission errors,
successful username invitation, cancellation, collaborator removal, and consequence confirmations at
1600x1000 and 900x620. Both sizes have no page-level horizontal overflow, and the browser reports zero
errors and zero warnings.
Received repository invitation verification covers the official account-scoped list, accept, and
decline contracts; exact Tauri argument names; repository, inviter, permission, and pagination
mapping; saved-credential delegation; notification routing; and focused TanStack Query
reconciliation. `pnpm check` passes with 129 frontend tests. `cargo fmt --check`, 227 Rust tests,
and `cargo check` pass with one external DeepWiki test ignored by design; Clippy retains the same 11
pre-existing warnings. A deterministic desktop fixture verified the permanent inbox entry,
notification-to-native routing, authoritative accept and decline payloads, confirmation, empty and
permission-error states, no console errors, and no page-level horizontal overflow at 1600x1000 and
900x620.

Repository Code mutation verification covers exact Tauri contracts, atomic rename payloads, stale
file and branch guards, Git-compatible branch validation, empty-repository initialization, stable
conflict errors, saved-credential delegation, and focused query reconciliation. The desktop fixture
verified exact-SHA branch creation and deletion, branch switching, first-file creation, edit, atomic
rename or move, deletion, and rendered source content at 1600x1000 and 900x620. Both sizes have no
page-level horizontal overflow, and the browser reports zero errors and warnings.
Repository Insights verification covers exact Overview, Contributors, and day or week Traffic Tauri
contracts; official route construction; `202 Accepted`, `204 No Content`, and code-frequency `422`
states; contributor aggregation; positive deletion presentation; safe repository-path links; and
saved-credential delegation. `pnpm check` passes with 127 frontend tests; 231 Rust tests pass with one
external DeepWiki test ignored by design; `cargo fmt --check`, `cargo check`, the production build,
and `git diff --check` pass. A deterministic Playwright fixture verified all three Insights tabs,
Traffic period switching, and exact IPC arguments at 1600x1000 and 900x620. Both sizes have no
page-level horizontal overflow, and the browser reports zero errors and warnings.

Comment-lifecycle verification covers current official GraphQL node and mutation contracts, exact
Issue versus pull request parent discrimination, repository scope, viewer capabilities, submitted
review state, displayed-revision conflicts, nullable mutation payloads, client-mutation identity,
and GraphQL `BigInt` review comment IDs. `pnpm check` passes with 130 frontend tests; 235 Rust tests
pass with one external DeepWiki test ignored by design; `cargo fmt --check`, `cargo check`, the
production build, and `git diff --check` pass. The deterministic desktop fixture verified edit and
delete flows for Issue comments, pull request conversation comments, and submitted review comments,
including exact Tauri arguments, authoritative refetch after deletion, retained Markdown after a
conflict, and capability-gated actions. At 1600x1000 and 900x620, dialogs remain inside the viewport,
document width equals viewport width, and the browser console reports zero errors and warnings.

Native Commit detail verification covers the exact 40-character SHA and page Tauri contract,
authenticated GitHub REST transport, API-version and Link headers, metadata identity across pages,
root and merge commits, signatures, renamed and binary files, unknown future status strings, and the
3,000-file limit. `pnpm check` passes with 129 frontend tests; 228 Rust tests pass with one external
DeepWiki test ignored by design; `cargo fmt --check`, `cargo check`, `cargo clippy`, the production
build, and `git diff --check` pass. Deterministic desktop QA at 1600x1000 and 900x620 covers repository
and history entry points, paged files, parent navigation, source-file return, unified and split Diff,
binary fallback, and the exact Commit-notification SHA. Both sizes have no page-level overflow, and
fresh sessions report zero console errors and warnings. GitHub's live `cli/cli` endpoint confirms the
2026-03-10 response and Link-pagination contract.
Repository Issue taxonomy verification covers exact camelCase Tauri contracts, normalized label
colors and due dates, create-versus-clear due-date serialization, route encoding, authoritative
response checks, deletion confirmation, and focused cache reconciliation. `pnpm check` passes with
128 frontend tests; 229 Rust tests pass with one external DeepWiki test ignored by design; `cargo
fmt --check`, `cargo check`, `cargo clippy --all-targets`, and `git diff --check` pass with the same 11
existing Clippy warnings. A deterministic desktop fixture verified label create, rename, retained
input after a permission failure, and deletion plus milestone create, edit, due-date clearing, close,
reopen, and deletion at 1600x1000 and 900x620. Light and dark themes render cleanly, wide tables
scroll only inside their content surface, the document width equals the viewport width, and the
browser console reports zero errors and warnings. PR: https://github.com/Excelius-Wang/harbor/pull/10
GitHub Pages verification covers exact Tauri read, health, and typed mutation contracts; personal
ownership and archived-write guards; branch and domain normalization; CNAME clearing; authoritative
response verification; focused cache reconciliation; workflow and legacy presentation; and exact-name
disablement. `pnpm check` passes with 129 frontend tests. The Rust library has 233 passing tests with
one external DeepWiki test ignored by design; `cargo fmt --check`, `cargo check`, the production build,
and `git diff --check` pass. A deterministic desktop fixture verified branch and Actions configuration,
build pagination and rebuild, DNS-ready and pending states, failure recovery, disablement, and first
enablement at 1600x1000 and 900x620 in light and dark themes. The Pages content has no horizontal
overflow at either size, and clean sessions report no browser errors or warnings.

Success: `pnpm check` passes; a 70-repository Playwright fixture with a 240-character unbroken token
keeps `scrollWidth === clientWidth` at both 1600x1000 and 900x620, with 12px between descriptions and
the scrollbar. The One Dark workspace was visually checked at both sizes with exact computed theme
tokens, a rendered source preview, no page-level horizontal overflow, and no browser console errors.
The OAuth environment bridge was verified with the current `target/debug/harbor`: both configuration
keys reached the process and compiled binary. `cargo fmt --check`, 33 Rust tests, and the Rust check
pass with the same environment cascade.
Personal Projects verification passes against GitHub's live GraphQL schema for the complete read
document and all 11 mutation fields. `pnpm check` passes with 107 frontend tests, and `cargo
fmt --check`, 180 Rust tests, and `cargo check` pass with one external DeepWiki test ignored by
design. The deterministic desktop fixture verified table, board, roadmap, typed field mutation,
draft-item creation, archived-item loading and restore, and compact back navigation at 1600x1000 and
900x620. Page-level horizontal overflow is absent at both sizes, intentional table/board overflow
stays local, and the browser console reports zero errors and warnings.
Repository relationship verification covers exact Tauri arguments, relationship and list-cache
reconciliation, duplicate-free Fork priming, Starred sort keys, GitHub route semantics, Watch flag
mapping, personal-owner Fork guards, and GitHub CLI's recent-Fork detection rule. `pnpm check` passes
with 111 frontend tests; 186 Rust tests pass with one external DeepWiki test ignored by design;
`cargo fmt --check` and `cargo check` pass. A deterministic desktop fixture verified My and Starred
sources, Star, Watch, custom-name Fork, default-branch-only Fork, personal-repository Fork disablement,
localized timestamps, and exact mutation payloads. At 640x720 the list remains complete, the detail
panel follows the existing compact rule, and document width equals viewport width with no horizontal
overflow. The browser console reports no errors or warnings.
Personal repository lifecycle verification covers creation-template sorting and deduplication,
personal-owner guards, default-branch validation, explicit visibility and archive acknowledgements,
at-least-one-merge-method validation, authoritative response verification, exact deletion
confirmation, Tauri argument contracts, and owned or Starred cache reconciliation. `pnpm check`
passes with 115 frontend tests; 194 Rust tests pass with one external DeepWiki test ignored by design;
`cargo fmt --check`, `cargo check`, and `git diff --check` pass. A deterministic desktop fixture
verified personal creation, owner-only Settings, exact visibility and archive payloads, archived
read-only state, exact-name deletion, external-repository Settings exclusion, and zero page-level
overflow. At 900x620 the creation dialog stays inside the viewport with local vertical scrolling. A
fresh browser session reports zero errors and warnings.
Personal Gist verification covers exact Tauri contracts, list and detail cache separation, Starred
and source-list reconciliation, multi-file create and edit payloads, file rename/add/delete guards,
personal Fork ownership, exact-ID deletion, revision identity, comment ownership and scope, and
sanitized Markdown plus shared source rendering. `pnpm check` passes with 119 frontend tests; 202
Rust tests pass with one external DeepWiki test ignored by design; `cargo fmt --check`, `cargo check`,
and `git diff --check` pass. A deterministic desktop fixture verified personal, Starred, and public
sources; public multi-file creation; rename and deletion edits; Star and personal Fork; exact
revision selection and return to latest; comment create, edit, and owner deletion; and exact-ID Gist
deletion. At 900x620 the detail has a native back path, document width equals viewport width, and the
two-file creation dialog remains within the viewport with local vertical scrolling. A fresh browser
session reports zero errors and warnings.
At 2048px, the code surface occupies 1360px of a 1422px panel with equal 31px gutters; at 900px it
contracts to the full 556px panel without page-level horizontal overflow or browser console errors.
The Issues contract tests cover cache keys and Tauri arguments for filtered list and timeline pages;
Rust mapping tests cover state, pagination, timeline comments, and repository-scoped search terms.
`pnpm check`, `cargo check`, and 39 Rust tests pass, with the external DeepWiki test ignored by
design. A mocked desktop interaction check verified open/closed reset, two-way pagination, detail
prefetch/cache, Markdown tables and code, timeline scrolling, and list-state restoration. The Issues
toolbar was visually checked at 1280px, 900px, and 700px; container queries prevent filter clipping.
After the UI cleanup, the same fixture verified shadcn pagination in both list and timeline views,
restored page 2 after returning from detail, and showed no horizontal overflow or console errors at
700px. The full frontend check, 39 Rust tests, Rust format check, and Rust compilation all pass.
The real verl README was checked at wide and 900px viewports: its DeepWiki badge renders at 117x20,
the unconstrained Seed banner remains responsive, the 400px architecture image keeps its width,
image corners remain square, and the page has no horizontal overflow or console errors.
The Pull Requests contract tests cover filtered list requests and separate detail, commits, files,
and checks caches. Rust tests cover repository-scoped search, draft/merged mapping, and review timeline
state. `pnpm check`, `cargo fmt --check`, `cargo check`, and 42 Rust tests pass, with one external
DeepWiki test ignored by design. A real desktop session verified repository loading and the empty
pull request state. A deterministic review fixture verified conversation, reviews, commits, checks,
single-column and two-column diffs, lazy tabs, and local diff scrolling at 900x620 with no page-level
horizontal overflow or console errors.
The Code depth contract tests cover separate history, tag, blame, and search cache keys and Tauri
arguments. Rust tests cover code-search scope sanitization, blame mapping, search fragments, and input
validation. A real desktop session verified history, tags, 58 repository search results, in-app file
opening, GraphQL blame ranges, and the native Save dialog. A deterministic fixture verified history,
tags, search, source preview, and blame at 900x620 with no page-level horizontal overflow; wide source
and blame content scrolls only inside its code surface. `pnpm check`, `cargo fmt --check`, `cargo
check`, and 46 Rust tests pass, with one external DeepWiki test ignored by design.
The Actions query-contract test keeps workflow runs, Jobs, and logs in separate cache entries with
their exact Tauri arguments. Rust tests cover run metadata fallback, ordered Job Steps, GitHub status
values, and bounded log tails. A live unauthenticated GitHub read against `cli/cli` returned one
current completed run and all eight Jobs with the expected schema; GitHub rejected the Job-log read
without Actions authorization, as expected. A deterministic fixture verified status selection,
failed-run detail, Job expansion, step ordering, lazy logs, local log scrolling, and progress
accessibility at 900x620 with no page-level horizontal overflow or browser warnings. The current
debug bundle could not complete a signed-in read because the pre-existing macOS Keychain prompt
blocked credential loading; no credential or Keychain state was changed.
The account Pull Requests query contract covers scope, state, search, sort, page, and exact Tauri
arguments. Rust tests cover enforced account scopes, removal of scope-changing user qualifiers, and
repository identity mapping from real Search API fields. A live unauthenticated GitHub Search read
confirmed `repository_url`, pull request metadata, and draft fields. A deterministic desktop fixture
verified Created, Assigned, Review requests, open/closed state, search, two-way pagination, detail
reuse, and list-state restoration at 900x620 and 1600x1000. Both sizes have no page-level overflow.
The Issue mutation contract tests cover exact comment and state Tauri arguments, terminal-page
timeline insertion, cached comment counts, and state synchronization across cached timeline pages.
Rust tests cover saved-credential delegation, comment mapping, blank-comment validation, and rejection
of pull request numbers at the Issue mutation boundary. A deterministic desktop fixture verified
Markdown comment submission, close and reopen transitions, write-permission feedback, and internal
scrolling at 900x620 and 1600x1000. Neither size has page-level overflow or browser errors. `pnpm
check`, `cargo fmt --check`, 56 Rust tests, and `cargo check` pass; the external DeepWiki test remains
ignored by design.
The Issue editor contract tests cover exact create and title/body update arguments, priming a newly
created conversation, and synchronizing updated records into both detail and list caches. Rust tests
cover saved-credential delegation, title/body validation, native Octocrab creation and editing, and
rejection of pull request numbers before editing. A deterministic desktop fixture verified Markdown
preview, creation-to-detail navigation, title editing, intentional body clearing, write-permission
feedback, and cache reconciliation at 900x620 and 1600x1000. Neither size has page-level overflow or
browser errors. `pnpm check` passes with 25 frontend tests, and `cargo fmt --check`, 57 Rust tests,
and `cargo check` pass; the external DeepWiki test remains ignored by design.
The Issue metadata contract tests cover separate label, assignee, and milestone option caches plus
the exact atomic update command. Rust tests cover input normalization, null milestone serialization,
saved-credential delegation, rejection of pull request numbers, and detection of values GitHub
silently drops. A deterministic desktop fixture verified lazy option loading, selection and clearing,
immediate detail/list cache synchronization, preserved edits after a write-permission failure, and
accessible persistent selection labels at 900x620 and 1600x1000. Both sizes have no page-level
horizontal overflow or browser console errors. `pnpm check` passes with 26 frontend tests;
`cargo fmt --check`, 59 Rust tests, and `cargo check` pass, with the external DeepWiki test ignored
by design.
The pull request mutation contract tests cover exact title/body and ordinary comment commands,
conversation and list reconciliation, terminal-page timeline insertion, and cached comment counts.
Rust tests cover saved-credential delegation and the pull request mutation boundary. A deterministic
desktop fixture verified Markdown previews, successful edit and comment flows, retained input after
write-permission failures, and immediate synchronization back to the account inbox at 900x620 and
1600x1000. Both sizes have no page-level horizontal overflow or browser console errors. `pnpm check`
passes with 29 frontend tests; `cargo fmt --check`, 60 Rust tests, and `cargo check` pass, with the
external DeepWiki test ignored by design.
The pull request review contract test covers the exact head commit, review decision, Markdown body,
latest reviewer state, and terminal timeline insertion. Rust tests cover review-body requirements,
commit ID validation, saved-credential delegation, and Octocrab response mapping. A deterministic
desktop fixture verified the Files changed entry point, blank approval, required comment and
change-request summaries, Markdown preview, retained input after a write-permission failure, and
immediate reviewer/timeline synchronization at 900x620 and 1600x1000. Both sizes have no page-level
horizontal overflow or browser console errors. `pnpm check` passes with 30 frontend tests; `cargo
fmt --check`, 62 Rust tests, and `cargo check` pass, with the external DeepWiki test ignored by
design.
The line-review contract now includes exact path, line, side, and Markdown body arguments. Frontend
tests cover addition, deletion, and context-line coordinate mapping; Rust tests cover comment input
normalization, duplicate rejection, and GitHub's uppercase REST payload. A deterministic desktop
fixture verified gutter entry, Markdown preview, editable pending comments, the pending count, exact
batch submission, and retained drafts after a permission failure. At 900x620 the compact pull request
header raises the changed-files viewport from 33px to 148px; at 900px split Diff content scrolls
locally (514px viewport, 900px content), while both 900px and 1600px have no page-level horizontal
overflow or console errors. `pnpm check` passes with 32 frontend tests; `cargo fmt --check`, 63 Rust
tests, and `cargo check` pass, with the external DeepWiki test ignored by design.
The review-thread query contract uses a pull-request-scoped TanStack infinite-query key and sends the
exact optional GraphQL cursor. Rust tests cover cursor validation, saved-credential delegation, and
mapping of current, pending, resolved, outdated, and viewer-capability fields. A deterministic desktop
fixture verified inline Markdown conversations, an unplaceable outdated thread, a collapsed resolved
thread, and the second cursor request. At 900x620 and 1600x1000 the page width equals the viewport
width, Diff content and conversations remain internally scrollable, and no application console error
appears. `pnpm check` passes with 34 frontend tests; `cargo fmt --check`, 65 Rust tests, and `cargo
check` pass, with the external DeepWiki test ignored by design.
The thread-mutation contract covers the exact GraphQL thread node ID and reply body, deduplicated
comment insertion, resolver-state clearing, and capability updates in the existing infinite-query
cache. Rust tests cover node-ID validation, saved-credential delegation, modern GraphQL reply and
resolution mappings, and resolve-to-reopen state transitions. A deterministic desktop fixture
verified reply submission, resolve and reopen transitions, retained Markdown after a permission
failure, and removal of stale resolver metadata. At 520x620 the editor, inline error, and action row
remain complete with `scrollWidth === clientWidth`; the browser console has no errors or warnings.
`pnpm check` passes with 35 frontend tests; `cargo fmt --check`, 66 Rust tests, and `cargo check` pass,
with the external DeepWiki test ignored by design.
The multi-line review contract maps additions and context to the right side, deletions and old context
to the left side, orders reverse selections, and preserves single-line payloads. Rust validation
requires paired start coordinates on one side and serializes them through the existing review request.
A deterministic desktop fixture verified Shift selection, drag selection, left and right ranges in
unified and split Diff views, editable range labels, and the exact submitted `startLine`, `startSide`,
`line`, and `side` IPC payload. At 900x620 the page stays 900px wide while the 900px split Diff scrolls
inside its 858px viewport; at 1600x1000 the page also has no horizontal overflow. The browser console
has no errors or warnings. `pnpm check` passes with 37 frontend tests; `cargo fmt --check`, 66 Rust
tests, and `cargo check` pass, with the external DeepWiki test ignored by design.
The merge contract covers exact method, optional commit fields, and the displayed head SHA in the
Tauri command; status tests distinguish null mergeability from ready, draft, conflict, and terminal
states. Rust tests cover input normalization, saved-credential delegation, and authoritative
post-merge pull request loading. A deterministic desktop fixture verified merge, squash, and rebase
selection, rebase field removal, exact squash IPC arguments, and retained permission errors. At
480x560 the dialog has no page-level horizontal overflow and scrolls its 660px content inside a
526px viewport; 760px and 1200px layouts remain complete, and the browser console has no errors.
`pnpm check` passes with 40 frontend tests; 67 Rust tests pass with one external DeepWiki test
ignored, and `cargo check` and `git diff --check` pass. Temporary browser artifacts were moved to
Trash after verification.
The pending-review query contract has a pull-request-scoped key and exact Tauri arguments. Mutation
contracts cover summary save, modern line/range coordinates, comment edit/delete IDs, submit,
discard, and authoritative cache replacement. A deterministic desktop fixture restored a GitHub
summary and line comment, filtered the duplicate pending thread, retained edited Markdown after a
write-permission failure, retried with the same review/comment IDs, saved the summary, warned about
an earlier commit, and required a second destructive confirmation. At 900x620 and 520x620 the page
width equals the viewport; the dialog scrolls internally without horizontal overflow. The browser
console had no errors or warnings. `pnpm check` passes with 43 frontend tests; `cargo fmt --check`,
67 Rust tests, and `cargo check` pass, with one external DeepWiki test ignored. Temporary Playwright
and GitHub MCP reference artifacts were moved to Trash after verification.
The pull request state contract covers the exact close/reopen Tauri argument, authoritative detail
updates, and removal from stale repository and account list caches. Rust tests cover Octocrab's
`open`/`closed` payload, saved-credential delegation, and both state transitions. A deterministic
desktop fixture verified close, reopen, retained Markdown after a permission failure, inline error
feedback, and the exact IPC calls at 900x620; 1600x1000 also has no page-level overflow. Neither size
reported browser errors or warnings. `pnpm check` passes with 45 frontend tests; 68 Rust tests pass
with one external DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, and
`git diff --check` pass. Temporary Playwright artifacts were moved to Trash.
The pull request metadata contract covers the exact labels, assignees, and milestone Tauri payload,
authoritative detail replacement, and list-label synchronization. Rust tests cover the shared
Issue/Pull Request shape guard, order-independent replacement verification, nullable milestone
payload, saved-credential delegation, and post-write pull request reload. A deterministic desktop
fixture verified lazy shared option loading, atomic metadata submission, immediate sidebar updates,
and retained selections with pull-request-specific permission feedback. At 900x620 and 1600x1000
the page has no root overflow, and the browser console has no errors or warnings. `pnpm check`
passes with 46 frontend tests; 70 Rust tests pass with one external DeepWiki test ignored, and
`cargo check` passes. Temporary Playwright artifacts were moved to Trash and remain recoverable.
The review-request contract covers exact user and Team arrays for request and removal commands, plus
the repository-scoped Team option cache. Rust tests cover non-empty input, case-insensitive
authoritative verification, saved-credential delegation, Team mapping, and both Octocrab write
paths. A deterministic desktop fixture verified new user requests, re-requesting an approved user,
Team-only removal, immediate sidebar reconciliation, and retained dialog state with permission
feedback. It also caught and fixed a stale TanStack Mutation `variables` value that left the dialog
permanently disabled after success. At 900x620 and 1600x1000 the page dimensions equal the viewport,
and the browser console has no errors or warnings. `pnpm check` passes with 48 frontend tests; 72
Rust tests pass with one external DeepWiki test ignored, and `cargo check` and `git diff --check`
pass. Temporary Playwright artifacts were moved to Trash and remain recoverable.
The pull request review-stage contract covers the exact draft-state Tauri argument and immediate
detail, repository-list, and account-inbox synchronization. Rust tests cover official GraphQL
mutation selection and node input, idempotency, closed-state rejection, stale response detection,
saved-credential delegation, and GraphQL permission/rate-limit mapping. A deterministic desktop
fixture verified Ready for review and Convert to draft success paths, retained state and feedback
after permission failures, confirmation copy, and the exact four IPC calls. At 900x620 and
1600x1000 the page width equals the viewport; the wide confirmation dialog remains centered inside
the viewport, and the browser console has no errors or warnings. `pnpm check` passes with 50
frontend tests; 77 Rust tests pass with one external DeepWiki test ignored, and `cargo fmt --check`
and `cargo check` pass. Temporary Playwright artifacts were moved to Trash and remain recoverable.
The Actions extraction keeps the three existing Tauri commands and frontend query contract stable
while moving every workflow model, remote request, pagination parameter, response mapping, log
policy, Service method, and focused mapping test into `github/actions.rs`. A saved-credential fake
Adapter verifies run, Job, and log delegation through the same Interface used by production. Static
inspection finds no Actions route, raw response model, mapping, or log constant left in the root
module; `github.rs` is now 6,021 lines. `pnpm check` passes with 50 frontend tests; 78 Rust tests pass
with one external DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, filtered strict
Clippy, and `git diff --check` pass. Unfiltered strict Clippy still reports 11 pre-existing warnings
in older command, metadata, sorting, and tray code; the new Actions module adds none.
The Actions write contract sends `cancel`, `rerunAll`, and `rerunFailed` through one registered Tauri
command with exact owner, repository, and run ID arguments. Rust tests cover the camelCase action
contract, official rerun routes, disabled debug logging, authoritative state gating, saved-credential
delegation, and the new OAuth `repo` scope. A deterministic desktop fixture verified cancel
permission failure and retry, failed-Job rerun permission failure and retry, full rerun, immediate
status/attempt/Job reconciliation, and all five exact IPC calls. At 900x620 and 1600x1000 the action
group stays inside the viewport with no root overflow; the browser console has no errors or warnings.
`pnpm check` passes with 53 frontend tests; 83 Rust tests pass with one external DeepWiki test
ignored, and `cargo fmt --check`, `cargo check`, filtered strict Clippy, and `git diff --check` pass.
Temporary Playwright artifacts were moved to Trash and remain recoverable.
The per-Job Actions contract sends the exact owner, repository, run ID, and database Job ID through a
separate registered Tauri command. Rust tests cover the official Job rerun route, disabled debug
logging, completed-state and run-membership validation, and saved-credential delegation. A
deterministic desktop fixture verified that both successful and failed completed Jobs expose the
compact rerun action, a permission failure preserves the detail state, and retry transitions the
authoritative run to queued attempt 2 while refreshing its Jobs. Both requests used the exact same
four IPC arguments; the rerun controls disappear while the run is active. At 900x620 and 1600x1000
the action row has no root overflow, its tooltip remains readable, and the browser console has no
errors or warnings. `pnpm check` passes with 55 frontend tests; 85 Rust tests pass with one external
DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, filtered strict Clippy, and
`git diff --check` pass. The Actions test Adapter now lives beside the production Adapter, reducing
the root `github.rs` to 5,992 lines. Temporary Playwright artifacts were moved to Trash and remain
recoverable.
The manual workflow-dispatch contract covers active workflow inventory, branch and tag references,
typed YAML inputs, exact Tauri arguments, write-permission recovery, and run-list invalidation. Rust
tests cover workflow parsing, all five input types, authoritative revalidation, environment choices,
payload limits, and Octocrab delegation. A deterministic desktop fixture verified required-field
and option validation, permission failure with retained input, successful dispatch, and the queued
run refresh at 900x620 and 1600x1000 with no page overflow or browser errors. `pnpm check` passes with
59 frontend tests; 91 Rust tests pass with one external DeepWiki test ignored, and `cargo fmt
--check`, `cargo check`, filtered strict Clippy, and `git diff --check` pass. The new capability lives
in `github/actions/dispatch.rs`; the root `github.rs` changes only by a stable re-export and remains
5,993 lines. Temporary Playwright artifacts were moved to Trash and remain recoverable.
The workflow-navigation contract keeps repository workflow inventory and each workflow/status/page
run selection in separate TanStack Query keys with exact nullable `workflowId` Tauri arguments. Rust
tests cover active and disabled inventory mapping, stable sorting, both official run routes, and
saved-credential delegation. A deterministic desktop fixture verified searchable wide navigation,
narrow Select navigation, all/single/disabled workflow history, context-aware manual dispatch, empty
state, a rate-limit failure with successful retry, and exact run-filter calls. At 900x620 and
1600x1000 the page dimensions equal the viewport, with no browser errors or warnings. `pnpm check`
passes with 60 frontend tests; 93 Rust tests pass with one external DeepWiki test ignored, and
`cargo fmt --check`, `cargo check`, filtered strict Clippy, and `git diff --check` pass. Temporary QA
files and browser sessions were removed.
The workflow-artifact contract keeps each run and page in a separate TanStack Query entry and sends
the exact run, artifact, and suggested-name arguments to the registered Tauri commands. A live public
read of `cli/cli` run `33054315361` returned seven current artifacts; the run-scoped list and direct
metadata endpoints matched Harbor's ID, name, size, expiration, timestamps, and workflow-run model.
Rust tests cover mapping, selected-run and expiration validation, safe ZIP names, saved credentials,
and the stable expiration IPC code. A deterministic desktop fixture verified loading, empty,
permission failure and retry, long names, expired disabled downloads, download permission recovery,
and the saved-path toast. At 900x620 and 1600x1000 the page width equals the viewport and the browser
console has no errors. `pnpm check` passes with 62 frontend tests; 98 Rust tests pass with one external
DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, filtered strict Clippy, and
`git diff --check` pass. Temporary QA files and browser sessions were removed.
The Actions filter contract keeps option data and every status/branch/event/actor/page run variant in
separate TanStack Query entries with exact Tauri arguments. Rust tests cover optional input
normalization, official query serialization, workflow-aware option mapping, and saved-credential
delegation. A live `cli/cli` API check returned one exact match for a combined workflow, branch,
event, actor, and status query. A deterministic desktop fixture verified filter persistence across
workflow selection, clearing, filtered-empty state, permission recovery, and exact combined IPC
arguments. At 1600x1000 and 900x620 the page has no horizontal overflow; a 240-character branch is
truncated inside a 498px popup whose right edge remains inside the 900px viewport. The browser
console has no errors or warnings. `pnpm check` passes with 62 frontend tests; 101 Rust tests pass
with one external DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, strict Clippy, and
`git diff --check` pass. The Playwright screenshot command timed out after its fixed five-second
limit, but DOM geometry, interactions, viewport sizes, and console state were verified directly.
The Code extraction keeps all existing Tauri commands and frontend data contracts stable while
moving the eight Code workflows, their public models, Service methods, Octocrab and fake Adapters,
REST and GraphQL transport, mappings, safety limits, and ten focused tests into the `github/code`
module (`code.rs` plus `code/tests.rs`).
Static inspection finds no Code request, route, raw response model, mapping, preview policy, or test
Adapter left in the root module; `github.rs` is now 4,688 lines after the following repository
pagination slice. Both saved-credential
delegation tests pass through the new Interface. `pnpm check` passes with 62 frontend tests; 101 Rust
tests pass with one external DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, strict
Clippy, and `git diff --check` pass.
The authenticated repository contract sends an exact positive page number through Tauri and keeps
all pages under one TanStack infinite-query key. Rust mapping retains the returned page and GitHub
`Link`-derived `hasMore` state; page input uses the existing command validator. A deterministic
desktop fixture loaded 100 repositories first, preserved them through a page-two rate-limit failure,
then retried to 135 unique repositories despite one duplicate ID. Search found and opened repository
135, and an explicit two-page refresh preserved that selection. At 900x620 the 135-row list scrolls
inside a 416px viewport with a 10,351px scroll extent, no horizontal overflow, and no console errors
or warnings. `pnpm check` passes with 63 frontend tests; 101 Rust tests pass with one external
DeepWiki test ignored, and `cargo fmt --check`, strict Clippy, and `git diff --check` pass.
The pull request branch-update contract keeps eligibility in a focused cache and sends the exact
displayed `expectedHeadSha` through its registered Tauri command. Rust tests cover the GitHub CLI
comparison query shape, same-repository and fork head refs, missing comparison data, stale/closed/
conflicting guards, official REST request serialization, terminal eligibility, and stable IPC error
codes. A deterministic desktop fixture verified the three-commit behind state, accessible
confirmation, retained permission and conflict errors, the 202 waiting row, three status polls, the
head transition from `abc1234` to `def5678`, cache reconciliation to four commits, and removal of the
now-ineligible update action. At 900x620 the dialog is 512x250 and remains fully inside the viewport;
at 900x620 and 1600x1000 document dimensions equal the viewport. The clean run has no unhandled IPC,
browser errors, warnings, or horizontal overflow. `pnpm check` passes with 68 frontend tests; 108
Rust tests pass with one external DeepWiki test ignored, and `cargo fmt --check`, strict Clippy, and
`git diff --check` pass.
The pull request creation contracts cover the exact comparison cache key, exact base/head/title/body/
draft create payload, and first-conversation cache priming. Rust tests cover Compare response mapping,
single-commit and multi-commit title suggestions, native Octocrab create serialization, empty-branch
guards, stable 422 conflicts, saved-credential delegation, and the registered command path. A
deterministic desktop fixture verified the no-commit state, Markdown preview, draft selection,
retained input after a permission failure, successful retry, exact create arguments, direct detail
navigation, and authoritative list reconciliation. At 1600x1000 and 900x620 the document dimensions
equal the viewport; the narrow creation surface scrolls 1,426px of content inside its 313px viewport
and brings the final action fully on screen. English and Chinese visual checks have no clipped controls,
browser errors, warnings, or horizontal overflow. `pnpm check` passes with 71 frontend tests; 113 Rust
tests pass with one external DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, filtered
strict Clippy, and `git diff --check` pass. Unfiltered Clippy still reports existing many-argument IPC
boundaries plus two unrelated style lints. Temporary QA files and the browser session were removed;
the artifacts were moved to Trash and remain recoverable.
The Issue deep-module extraction preserves the existing Tauri command and serialized model
contracts while reducing the root `github.rs` from 4,717 to 3,535 lines. `pnpm check` passes with 71
frontend tests; 113 Rust tests pass with one external DeepWiki test ignored; `cargo fmt --check`,
`cargo check`, filtered strict Clippy, and `git diff --check` pass. Unfiltered Clippy still reports
the same existing many-argument IPC and internal seams plus the two unrelated style lints.
The Auto-merge contract keeps status in a focused TanStack Query entry and sends exact repository,
pull request number, displayed head SHA, and merge method arguments through the three registered
Tauri commands. Rust tests cover official GraphQL payloads, repository merge-method policy, viewer
capabilities, GitHub Int bounds, stale HEAD and unsupported-method guards, mutation response
verification, ready-to-merge suppression, repository-disabled state, and the separation from Merge
Queue. A deterministic desktop fixture rejected the first enable attempt with a permission error,
retained the selected merge method, succeeded on retry, displayed the authoritative actor and method,
then required confirmation before disabling. Repository-disabled and Merge Queue variants expose no
Auto-merge action; the latter renders the interpolated base branch after a visual check caught and
fixed a leaked translation placeholder. At 900x620 the document and merge panel have no horizontal
overflow, and the 512x338 enable dialog remains fully inside the viewport; the clean browser run has
no errors or warnings. `pnpm check` passes with 74 frontend tests; 124 Rust tests pass with one
external DeepWiki test ignored, and `cargo fmt --check`, `cargo check`, filtered strict Clippy, and
`git diff --check` pass. The production Auto-merge module is 656 lines with 286 test lines separated;
temporary QA artifacts were moved to Trash and remain recoverable.
The Merge Queue contract keeps status in a focused polling cache and sends exact repository, pull
request number, and displayed head SHA arguments through three registered Tauri commands. Rust tests
cover official GraphQL fields and mutation shapes, repository write permission, queue capability,
ready and waiting states, entry metadata, stale-HEAD rejection, mutation identity, and saved-token
delegation. A live read-only query against `cli/cli` confirmed GitHub's current
`viewerPermission`, `isMergeQueueEnabled`, `isInMergeQueue`, and `mergeQueueEntry` schema. `pnpm
check` passes with 77 frontend tests; 133 Rust tests pass with one external DeepWiki test ignored;
`cargo fmt --check`, `cargo check`, filtered strict Clippy, and `git diff --check` pass. Unfiltered
strict Clippy still reports the same 11 older command, metadata, sorting, and tray warnings. Desktop
interaction remains unverified because the browser runtime reported no available browser instance.
The Notifications contract keys pages by participation scope, invokes the three focused Tauri
commands with exact thread actions, and removes handled threads from every cached unread scope. Rust
tests cover partial notification repository payloads, symbolic `HEAD` fallback, supported in-app and
Web destinations, page and thread-ID validation, saved-token reads, and saved-token writes. A live
read-only request confirmed that GitHub returns thread IDs as strings, current subject types, and a
partial repository without `default_branch`; an empty unread response and a one-item `all=true`
shape were both handled without exposing notification content. `pnpm check` passes with 80 frontend
tests; 137 Rust tests pass with one external DeepWiki test ignored; `cargo fmt --check`, `cargo
check`, filtered strict Clippy, and `git diff --check` pass. Desktop interaction remains unverified
because the in-app browser runtime reported no available browser instance on a second consecutive
goal turn.
The account Issues contract keys every authored, assigned, and mentioned state/search/sort/page
variant independently and invokes one focused Tauri command with the exact scope. Rust tests cover
scope enforcement, useful repository narrowing, negated qualifier sanitization, repository context,
pull-request rejection, and saved-token delegation. A live read-only request returned three open
authored Issues and confirmed the expected non-PR item plus `repository_url` shape. Comment, content,
metadata, and state writes now reconcile repository and account caches through the same Issue
mutation boundary; state tests cover stale-list removal and matching-list updates. `pnpm check`
passes with 81 frontend tests; 141 Rust tests pass with one external DeepWiki test ignored; `cargo
fmt --check`, `cargo check`, filtered strict Clippy, and `git diff --check` pass. Unfiltered strict
Clippy still reports the same 11 older command, metadata, sorting, and tray warnings. Desktop
interaction remains unverified because the in-app browser runtime reported no available browser
instance on a third consecutive goal turn; the main goal remains active because other slices can
continue without that environment.
The Discussions contract keeps categories, list filters, conversations, and poll results in focused
repository-scoped TanStack Query entries with exact nullable cursors. Mutation tests cover exact node
IDs, root comments versus replies, edit reconciliation, answer/upvote/poll state, full Discussion
removal, leaf removal, and parent-comment tombstones. Rust tests cover category and comment scope,
GraphQL Int bounds, list variables, nested replies, deletion capabilities, poll mapping, close
reasons, mutation payloads, and saved-token delegation. A live read-only query against
`docker-mailserver/docker-mailserver#2908` returned its four-option, ten-vote poll, a 19-reply thread,
and every viewer/delete field Harbor maps; the exact poll-vote and both deletion mutations also
passed GitHub schema validation behind `@skip(if: true)` without executing a write. That check caught
and fixed a real GraphQL field conflict by aliasing summary comment counts away from the paginated
`comments` field. `pnpm check` passes with 92 frontend tests; 149 Rust tests pass with one external
DeepWiki test ignored; Rust format, `cargo check`, filtered strict Clippy, and `git diff --check`
pass. Discussions split into an 8.26 kB list chunk and 31.90 kB detail chunk, leaving the main page at
491.18 kB. Desktop interaction for Merge Queue, Notifications, account Issues, and Discussions
remains unverified because the browser runtime reported no available browser instance on a fifth
consecutive goal turn; other GitHub slices can continue without it.
The Releases contract keeps list pages and stable release IDs in separate TanStack Query entries,
primes complete detail records from REST list results, routes notification subjects only from API
identities, sends exact read and write arguments through registered Tauri commands, and synchronizes
release and asset changes across every cached list and detail. Rust tests cover release and asset
mapping, mutation validation, immutable state, ownership and uploaded-state guards, trusted encoded
upload URLs, permission and rate-limit errors, safe shared filenames, saved-token delegation, and
official asset routes. A live read-only check of `cli/cli` release `v2.98.0` confirmed immutable
state, its templated `uploads.github.com` URL, 22 assets, digests, source archives, and download
counts; fetching asset `522857887` returned 1,950 bytes, exactly matching its declared size. `pnpm
check` passes with 98 frontend tests; 157 Rust tests pass with one external DeepWiki test ignored;
Rust format, `cargo check`, filtered strict Clippy, and `git diff --check` pass. Releases split into a
7.20 kB list chunk and 20.36 kB detail chunk; the shared home chunk is 492.86 kB. A deterministic
Playwright fixture verified the list, exact draft creation payload, Markdown form, mutable and
immutable detail states, streamed-upload entry point, asset and Release confirmations, and cache
return paths at 900x620. Visual inspection caught and fixed a narrow-detail title squeeze; the clean
rerun has `scrollWidth === clientWidth` with no browser errors or warnings. Earlier Merge Queue,
account Issues, and Discussions interaction checks remain pending under the in-app browser
environment that was unavailable during those slices.
Notification target contracts now cover exact Workflow Run, Check Suite, suite-run, and stable
subject-ID Tauri arguments. Rust tests cover repository-scoped subject paths, unstable commit refs,
direct run mapping, Check Suite mapping, and official routes. A live read-only `cli/cli` run
`33148922932` confirmed its suite `89830797438`, head SHA, direct run fields, three suite-scoped Check
Runs, 77 commit-wide checks, commit metadata, and Code contents at that SHA. `pnpm check` passes with
99 frontend tests; 160 Rust tests pass with one external DeepWiki test ignored; Rust format, `cargo
check`, `git diff --check`, and Clippy pass with the same 11 older command, metadata, pending-review,
and tray warnings and no warning in the new modules. Workflow Run and Check Suite details remain 1.45
kB and 2.52 kB lazy chunks; Code is now a shared 32.84 kB lazy chunk and the home chunk fell from
492.86 kB to 464.66 kB. A deterministic Playwright fixture verified notification page-2 restoration,
Jobs, logs, artifacts, suite-only checks, detached-SHA Code browsing, exact IPC arguments, and
`scrollWidth === clientWidth` at 900x620 and 1600x1000 with no browser errors or warnings.
The Security contract keeps each alert family, filter page, detail, and evidence collection in
focused TanStack Query entries and reconciles authoritative close or reopen responses across lists.
Rust tests cover repository routes, family state filters, current Dependabot risk fields, newer Code
Scanning reasons, Secret Scanning locations, mutation validation, and the no-secret IPC guarantee.
Live read-only requests against `cli/cli` exercised the real permission and feature-disabled error
shapes. `pnpm check` passes with 103 frontend tests; 171 Rust tests pass with one external DeepWiki
test ignored; Rust format, `cargo check`, `git diff --check`, and Clippy pass with the same 11 older
warnings and no new warning. Security stays split into 7.85 kB list and 19.74 kB detail lazy chunks.
A deterministic Playwright fixture verified all three families, evidence, required close reasons,
reopen, exact mutation arguments, native notification routing, unsupported notification fallback,
and inbox return. At 900x620 and 1600x1000, `scrollWidth === clientWidth`; Secret Scanning exposed no
secret literal, and the browser reported zero errors and zero warnings. Screenshots and the fixture
remain under `output/playwright/` for recovery.
The Profile contract covers exact Tauri commands and arguments, viewer and selected-user cache
aliases, contribution, relationship, and activity query separation, public-field normalization, and
follow-count reconciliation. Rust tests cover official routes, profile and contribution mappings,
generic activity events, personal-identity guards, safe usernames, and command-boundary profile
validation. `pnpm check` passes with 122 frontend tests; 209 Rust tests pass with one external
DeepWiki test ignored; Rust format, `cargo check`, and `git diff --check` pass. A deterministic
Playwright fixture verified contribution rendering, profile editing, follow and unfollow state, and
viewer-count reconciliation at 1600x1000 and 900x620. The narrow edit dialog stays within the
viewport and scrolls internally; both sizes have no page-level horizontal overflow, and the browser
reports zero errors and zero warnings. Screenshots and the reusable fixture remain under
`output/playwright/` for recovery.
The Discovery contract covers exact Tauri search and feed arguments, kind-specific sort guards,
GitHub query preservation, forced Issue, pull request, and personal-user result types, the 1,000-item
search ceiling, incomplete-result state, event mapping, and the received-events page boundary.
`pnpm check` passes with 123 frontend tests; 217 Rust tests pass with one external DeepWiki test
ignored; Rust format, `cargo check`, and `git diff --check` pass. A deterministic Playwright fixture
verified the feed, all five search kinds, exact native navigation into Issue, profile, repository,
and source-file details, and state restoration at 1600x1000 and 900x620. Both sizes have no
page-level overflow, and the browser reports zero errors and zero warnings.

## Decisions

- Keep repository Insights behind the focused three-method `GitHubInsightsClient`. Reuse Octocrab's
  community metrics API and authenticated transport, while owning only the statistics and Traffic
  routes Octocrab does not wrap. Represent GitHub's asynchronous statistics generation and
  unavailable histories explicitly, poll only while building, and keep Traffic in a separate query
  because it requires push access. Treat Wiki as a separate `.wiki.git` repository rather than
  pretending the Contents API covers it.
- Define the requested GitHub Web parity as the personal-developer product: personal accounts,
  personal repositories, including personal-repository collaborators, and API-supported developer
  workflows. Exclude organization and Team administration, Enterprise identity and policy,
  organization billing, and organization advanced security. Keep an explicit GitHub Web fallback for
  sensitive or browser-only account operations that GitHub does not expose to an OAuth desktop
  client; do not fake them with local state.
- Keep reactions behind one `GitHubReactionClient` and GitHub's shared `Reactable` GraphQL contract.
  Require the caller's exact closed subject kind, compare every node to the selected repository ID,
  and use read-before-write desired state so retries are idempotent. Batch visible subjects through
  `nodes(ids:)`, use `reactors.totalCount`, retain Discussion upvotes separately, and restrict
  Releases to their documented six reaction values.
- Keep discovery behind `GitHubDiscoveryClient`. Preserve raw GitHub search syntax as GitHub CLI
  does, but own tab result discriminators, kind-valid sorts, and the 1,000-result boundary. Surface
  `incomplete_results` rather than implying the result set is complete. Use authenticated
  `received_events` for the developer feed and state its 30-day, 300-event, and eventual-delivery
  limits instead of inventing a local ranking model. Reuse existing native details for every result
  type that has a stable identity.
- Keep profile and social behavior behind `GitHubProfileClient`. Use REST for profiles, follows, and
  public events, GraphQL only for `ContributionsCollection`, reject organization profiles at the
  boundary, reread authoritative state after writes, and request `user` so profile editing and
  follow workflows have their documented OAuth permissions.
- Keep workflow-artifact listing and downloads behind `GitHubWorkflowArtifactClient`; use Octocrab's
  native endpoints, verify current metadata before downloading, and open Save As before fetching the
  archive so cancelling never transfers artifact bytes.
- Keep repository Security behind `GitHubSecurityClient`, with one stable tagged IPC model across
  Dependabot, code scanning, and secret scanning. Reuse Octocrab authentication and transport but
  own focused raw response models where Octocrab's public models lag GitHub fields or could expose a
  secret. Always request hidden secrets, map family-specific states and reasons explicitly, and
  route notifications natively only when their API resource path supplies an exact repository and
  alert number.
- Keep ordinary Auto-merge behind `GitHubPullRequestAutoMergeClient`; query repository policy and
  viewer capabilities through GitHub's official GraphQL schema, send the displayed head OID when
  enabling, verify mutation identity and method, and reread authoritative state after every write.
  Treat Merge Queue as a separate workflow rather than presenting queued pull requests as ordinary
  Auto-merge.
- Keep Merge Queue behind `GitHubPullRequestMergeQueueClient`; use GitHub's current queue capability
  and entry fields plus the direct enqueue and dequeue mutations. Do not route queue writes through
  ordinary Auto-merge or GitHub CLI's current shared path, which can fail when a ruleset requires a
  queue while repository Auto-merge is disabled.
- Keep Notifications behind `GitHubNotificationClient`; reuse Octocrab's native list, mark-read, and
  mark-all-read methods and add only GitHub's missing mark-done route. Poll the unread server view at
  a conservative one-minute interval, cache by participation scope and page, and never model read,
  Saved, or Done inboxes that the public API cannot identify. Reuse existing Issue, pull request,
  Discussion, Release, Actions, Checks, and Code details for supported subjects. Parse only exact
  repository-scoped API paths; load Workflow Runs and Check Suites by numeric ID, keep Commit SHAs
  detached from branch selection, and preserve the Inbox scope and page while a detail is open.
  Keep security and unknown subject destinations explicit until their Harbor modules exist.
- Keep Checks behind the focused three-method `GitHubCheckClient`; share one result presentation
  while keeping commit-wide checks, suite metadata, and suite-scoped Check Runs in separate queries.
  Do not substitute every check on a commit for the selected suite.
- Keep account Issues behind the existing `GitHubIssueClient` and native Issue detail rather than
  adding another client or conversation model. Enforce authored, assigned, or mentioned scope on the
  server; allow repository, organization, user, and label qualifiers only as narrowing terms. Carry
  repository identity from search results, use symbolic `HEAD` for Markdown context, and reconcile
  repository and account caches through the shared Issue mutation helpers.
- Keep Discussions behind `GitHubDiscussionClient` and GitHub's official GraphQL node IDs. Cache
  categories separately, paginate list and top-level comments by cursor, preserve one nested reply
  level as GitHub models it, and use viewer capability fields to show reversible actions. Reuse the
  existing Markdown editor/renderer and shadcn feedback primitives; update Infinite Query pages from
  authoritative mutation responses before invalidating them. Alias summary comment counts so they
  can coexist with paginated comment arguments in one GraphQL operation. Poll votes must verify the
  selected option belongs to the fetched poll; destructive writes must verify viewer capability and
  repository/discussion scope. Preserve GitHub's deleted-comment tombstone when replies remain.
  Lazy-load the tab and notification detail so a repository-only feature does not inflate Harbor's
  startup path.
- Keep Releases behind `GitHubReleaseClient`; use Octocrab's native list, detail, create, update, and
  delete builders plus narrow binary transfer code for assets and archives. Reread the selected
  release before scoped operations, verify identity, asset ownership, readiness, immutability, and
  downloaded byte length, and reuse Harbor's Save As writer plus shared filename policy. Follow
  GitHub CLI's upload strategy: encode the returned hypermedia URL, stream the native-selected file,
  reject non-GitHub upload hosts, and keep the official under-2-GiB boundary. Immutable published
  releases may edit only their title and notes; their assets stay locked, but the whole Release may
  still be deleted after confirmation. Seed and reconcile stable list/detail caches from returned
  records, lazy-load both repository and notification entry points, and route a Release notification
  natively only from the API subject URL's numeric ID.
- Treat GitHub-native parity as the product foundation; Discover, DeepWiki, and issue agents build on
  top of it rather than substituting for incomplete GitHub workflows.
- Measure completeness by end-to-end user jobs, not by the presence of tabs or static screens.
- Finish the already-started repository areas in this order: Issues, Pull Requests, Code depth, then
  Actions. Revisit broader repository tabs and account-wide surfaces after these core workflows.
- Reuse Octocrab, TanStack Query, shadcn/Radix, and GitHub's documented API behavior; do not duplicate
  client, cache, or component infrastructure.
- Keep Issue writes behind narrow commands. Reuse Octocrab's native endpoints,
  reject pull request numbers before mutation, update active cache data from GitHub's returned record,
  and invalidate related queries afterward.
- Keep the complete Issue backend behind one `GitHubIssueClient` Interface. Its production and test
  Adapters, models, search-scope policy, REST mappings, and focused tests belong together; the root
  GitHub module only composes this Interface and re-exports the stable types consumed by commands.
- Share one accessible title/body form between creation and editing, reuse Harbor's sanitized Markdown
  renderer for preview, and rely on Octocrab's native Issue builders instead of adding another form or
  API abstraction.
- Keep Issue metadata in one atomic update boundary, reuse repository-scoped option queries, and
  verify GitHub's response because its API can silently ignore values when the caller lacks push
  access.
- Reuse the shared title/body and comment forms for pull requests. Update content through Octocrab's
  native Pull Requests builder; use GitHub's Issue comments API for ordinary pull request conversation
  comments, but verify the number is a pull request before writing.
- Synchronize pull request mutations into the active conversation, repository list, and account inbox
  before invalidation. Keep commits, checks, and changed-file caches outside the focused mutation
  invalidation boundary.
- Place review submission in Files changed, matching GitHub Web. Use the three documented review
  decisions and require a summary only for comment and change-request reviews.
- Submit new reviews through Octocrab against the displayed head commit. When GitHub already has the
  viewer's pending review, submit that review by ID instead of creating a duplicate. Append GitHub's
  returned review to the existing conversation and review-summary caches before focused invalidation.
- Use `react-diff-view`'s `renderGutter` and `widgets` extension points for line comments instead of
  introducing another Diff renderer. Map insert and context lines to GitHub's right side and deleted
  lines to its left side.
- Persist line-comment drafts in the viewer's GitHub pending review rather than component state or
  local storage. Use GitHub node IDs to hide the duplicate pending thread, preserve numeric IDs for
  REST edits/deletes, and clear the focused pending-review cache only after submit or discard succeeds.
- Read review conversations through a separate cursor-paginated GraphQL query instead of coupling
  them to REST file pagination. Preserve thread node IDs and viewer capabilities for subsequent
  mutations, and reuse `react-diff-view` widgets to place current line threads.
- Reply through GitHub's current `addPullRequestReviewThreadReply` mutation and resolve or reopen
  through the dedicated thread mutations. Render only actions GitHub says the viewer can perform,
  then merge the returned thread state into the existing cache instead of inventing optimistic
  resolver metadata.
- Build multi-line comments from `react-diff-view` change keys on one Diff side. Keep the last line in
  the existing `line` and `side` fields, add start coordinates only for a real range, and anchor the
  shared comment widget at the range end so single-line drafts and submitted threads stay compatible.
- Merge through Octocrab's native pull request builder. Always send the displayed head SHA so GitHub
  rejects a stale confirmation, omit editable commit fields for rebase as GitHub CLI does, and load
  the authoritative pull request after success before synchronizing existing TanStack Query caches.
- Keep pending-review transport, pagination, authorization checks, mappings, service methods, and
  test doubles behind the focused `GitHubPendingReviewClient` sub-interface. Continue extracting new
  Pull Request behavior by domain instead of adding implementation bodies to the root `github.rs`.
- Keep pull request editing, state changes, comments, reviews, and merge behavior behind the focused
  `GitHubPullRequestMutationClient` seam with Octocrab and fake Adapters. Close and reopen through the
  official pull request update endpoint, trust the returned record, and remove state-changed items
  from cached source lists before invalidation.
- Route Issue and pull request assignee, label, and milestone replacement through one deep metadata
  module because GitHub models these pull request fields as Issue metadata. Verify the complete
  returned Issue-shaped record, then reload the authoritative pull request before updating existing
  caches; reuse the repository option queries and one accessible editor instead of duplicating a PR
  form.
- Keep review-request reads and writes behind `GitHubPullRequestReviewerClient`. Use Octocrab's
  native REST request and removal methods one reviewer or Team at a time, then reload and verify the
  authoritative pull request before cache reconciliation. Reuse assignable users as the people
  option source, keep visible repository Teams in their own cache, and let a current request override
  an older review decision in presentation.
- Keep review-stage changes behind one `GitHubPullRequestLifecycleClient` method even though GitHub
  exposes separate GraphQL mutations. Hide node lookup, idempotency, verification, and authoritative
  reload inside the deep module; place Ready for review and Convert to draft where GitHub Web teaches
  users to expect them.
- Split the root GitHub module by complete business capability, not by dumping models and helper
  functions into miscellaneous files. Extract one vertical slice at a time with stable IPC and
  frontend contracts. Actions is the first completed extraction: keep its six-method Interface,
  production Octocrab Adapter, fake Adapter, Service methods, transport models, mappings, and tests
  together rather than adding a generic HTTP wrapper or exposing its internal seams.
- Keep pull request branch status and update transport behind one focused two-method Interface. Use
  GitHub CLI's minimal GraphQL base/head comparison to avoid relying on undocumented
  `mergeable_state` precedence, and send GitHub's documented REST `expected_head_sha` guard. Treat
  202 as asynchronous acceptance and reconcile only after an authoritative head change.
- Keep pull request creation behind its own two-method Interface. Reuse the existing Code overview
  branch cache, Octocrab's Compare API and native create builder, recheck that the head still has
  commits immediately before writing, map GitHub's 422 response to a stable conflict, and trust the
  successful create response instead of risking a false failure through an immediate second read.
  Prime the returned conversation before invalidation so navigation is immediate and reconciliation
  remains authoritative.
- Keep Code behind one cohesive `GitHubCodeClient` Interface. Move overview, history, tags, blame,
  search, contents, preview, and download together with both Adapters and their policies; leave the
  shared byte download result in the root because Actions artifacts also use it.
- Keep Commit detail in the existing `GitHubCodeClient` rather than introducing a second client or
  HTTP stack. Use the official authenticated REST endpoint because it returns authoritative commit
  metadata and paged changed files together, follow Link headers rather than guessing from page
  length, cap navigation at GitHub's 3,000-file boundary, and require a full SHA at the Tauri edge.
  Share only the read-only Diff parser and renderer with pull request files; keep review controls in
  the pull request workflow.
- Keep authenticated repositories in one infinite-query cache. Show the first 100 immediately,
  follow GitHub's native page links sequentially in the background, deduplicate by immutable
  repository ID, retain loaded pages on later failures, and refetch loaded pages without discarding
  the current selection.
- Model run cancellation and both rerun variants as one Actions Interface method with a typed action.
  Read the authoritative run before writing, reuse Octocrab's native cancel method, and implement only
  the missing official rerun routes. Treat the accepted response as asynchronous: refetch run and Job
  caches instead of inventing a completed client-side state.
- Keep manual workflow dispatch behind its own three-method Actions sub-interface. Load workflow YAML
  at the selected reference, derive GitHub's typed input form from `workflow_dispatch`, revalidate the
  authoritative configuration before writing, and use Octocrab's native dispatch builder rather than
  expanding the root client or adding another HTTP wrapper.
- Keep workflow inventory separate from dispatch options so Actions navigation does not eagerly load
  every branch and tag. Include disabled workflows for history, scope run queries with an optional
  workflow ID, and keep every cached run variant under the existing repository run root so dispatch
  and rerun invalidation still reconcile all views.
- Send Actions run filters through GitHub's documented workflow-run query parameters rather than
  filtering a client-side page. Keep option discovery behind a focused one-method Interface, reuse
  the existing complete branch loader, derive event and actor choices from the latest 100 runs, and
  keep option failures independent from the status-filtered run list.
- Request the OAuth App's `repo` scope because GitHub gives no-scope tokens only public read access
  and Harbor's core repository workflows include writes. Also request `workflow` because GitHub can
  require it when a Release target modifies `.github/workflows/`. Keep GitHub's response as the
  authority because scopes cannot grant rights the signed-in user does not have and users may grant
  less than requested.
- Keep Projects behind a personal-owner Interface. Resolve project numbers only through `viewer`,
  verify GitHub's `/users/{login}/projects/{number}` identity before every write, and request the
  `project` OAuth scope because current GraphQL fields reject otherwise-capable repository tokens
  without `read:project`. Reuse native Issue and pull request details for linked content, and keep
  table, board, and roadmap overflow local to their content surfaces.
- Keep repository relationships behind `GitHubRepositoryRelationshipsClient`. Use GitHub's exact
  Star endpoints and distinguish them from repository notifications; represent missing explicit
  Watch subscriptions as Participating, use `DELETE` to restore that default, and map All activity
  and Ignore to their documented flag pairs. List Starred repositories with GitHub's timestamp media
  type, reuse the existing repository workspace, and reconcile its caches by immutable repository ID.
  Create Forks only in the signed-in personal account through Octocrab's native builder, never expose
  an organization target, and follow GitHub CLI's one-minute timestamp guard when distinguishing a
  newly accepted Fork from an existing one.
- Keep Issue and pull request lock and subscription state behind one focused
  `GitHubConversationClient` because GitHub models them through the same Issue-or-pull-request node.
  Reuse Octocrab's native REST lock routes, use the existing authenticated GraphQL transport only for
  `updateSubscription`, verify exact kind and number before writes, and reload authoritative state
  afterward. Derive lock visibility from the personal repository's viewer permission and preserve an
  existing Ignored subscription until the user explicitly subscribes.
- Keep personal repository creation and lifecycle settings behind
  `GitHubRepositorySettingsClient`. Resolve ownership from the authenticated user, never accept an
  organization destination, verify template and default-branch choices against authoritative GitHub
  data, and verify every returned setting after writes. Require explicit consequence flags for
  visibility and archive transitions, the exact full repository name for deletion, and the
  `delete_repo` OAuth scope for new connections. Keep personal-repository collaborators in the
  product, but do not surface organization transfer, organization collaborator administration,
  billing, organization rulesets, or organization security administration.
- Keep owner-side personal repository access behind the focused five-method
  `GitHubRepositoryAccessClient`. Reuse Octocrab's paginated collaborator listing and existing
  authenticated transport, adding only its missing official invite, invitation-list, cancellation,
  and removal routes. Verify the signed-in user owns the personal repository before every operation,
  accept only GitHub's personal read/write collaborator role, and recheck collaborator state after a
  removal. Email invitations remain an explicit GitHub Web fallback because the REST collaborator
  route accepts a username, not an email address.
- Keep personal Gists behind `GitHubGistClient`. Reuse Octocrab's native Gist operations and add
  only its missing official Starred-list and comment routes. Validate Gist IDs, full revision SHAs,
  reserved file names, unique file sets, comment scope, and personal ownership before writes; verify
  returned Star, Fork, file, and comment identities. Request the `gist` OAuth scope, keep public and
  secret creation distinct, and never offer an edit when GitHub truncated a file because Harbor
  cannot safely reconstruct the missing content.
- Keep repository file and branch writes behind `GitHubCodeMutationClient`. Use one Git tree and one
  commit for create, edit, rename, move, or delete; guard writes with the displayed blob and branch
  SHAs, never force-update refs, and verify the authoritative ref and file state after success. Use
  the Contents API only to initialize an empty repository, where no Git ref exists. Keep protected
  branch policy on GitHub's server and surface its conflict or permission response instead of
  recreating organization ruleset administration in Harbor.
