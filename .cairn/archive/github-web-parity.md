# GitHub Web parity

## Goal

Bring the complete GitHub Web workflow needed by an individual developer into Harbor, with native
GitHub APIs and selected web fallbacks. Done means each in-scope workflow has loading, empty, error,
permission, navigation, and primary interaction coverage. Organization administration, Enterprise
controls, and organization-level advanced security remain out of scope.

## Current state

PRs #1 through #73 are merged. [PR #27](https://github.com/Excelius-Wang/harbor/pull/27)
delivered native Issue-template discovery and controlled selection as merge commit
`b52c391d92ba6fdd1b379cf544650c8b500cb794`. The separate Dependabot remediation PRs #30 and
#31 merged as `f9b0a3` and `aa0b814`; the GitHub Dependabot API reported zero open alerts before
and after the next slice.

[PR #32](https://github.com/Excelius-Wang/harbor/pull/32) added an existing same-repository Issue
as a sub-issue through merge commit `aae61b21574215b7f36411e539acbca3b30f6f62`; its reviewed head
was `743aca4942e6ba8cee5e40cc9a478af002ac6894`. The backend resolves both parent and child as
Issues in the exact current repository, rejects pull requests, self-reference, and any existing
child parent before it sends `replace_parent: false`. The UI exposes only a same-repository Issue
number, never the GitHub database ID, and refreshes both Issues' relationship and detail caches on
success. Independent Standards and Spec reviews found zero hard/unresolved findings after the
cache refresh was added.

[PR #33](https://github.com/Excelius-Wang/harbor/pull/33) removed one displayed existing
same-repository child from the current parent Issue through merge commit
`6c58619c677e78d39d61c6a4b4622fcb885c198e`; its reviewed head was
`5968d9cece3b6e90b7108c1c3de8c4d1af9d44ac`. The UI confirms that only the relationship is removed,
never the child Issue. The backend resolves both Issues from their visible numbers, verifies the
child's authoritative parent and global database ID before the write, sends GitHub's exact DELETE
payload, and confirms the child has no parent after HTTP 200. Success and every error path refresh
both Issues' relationship and detail caches. Cross-repository children stay readable and navigable
without a removal action. Independent Standards and Spec reviews both reported zero findings.

[PR #35](https://github.com/Excelius-Wang/harbor/pull/35) added up/down reordering for adjacent
same-repository sub-issues on the currently loaded page through merge commit
`058e1df9a0fea87522a04951d468c8dda84c50c1`; its reviewed head was
`f039ca31a0d8011216a0f2b2fed463c3ce2be882`. The frontend sends only visible Issue numbers, the
loaded page, and before/after placement. The backend reloads the parent Issue and authoritative page,
rejects missing, cross-repository, non-adjacent, or stale pairs, resolves both database IDs, sends one
exact PATCH payload, verifies the returned Issue identity, and reloads the page to confirm the new
adjacent order. Cross-repository and cross-page ordering stays unchanged. Both independent reviews
reported zero findings, and all four CodeQL checks passed.

The Issue creation policy reads `.github/ISSUE_TEMPLATE/config.yml`, validates bounded contact-link
text and HTTP(S) URLs, and retains the native blank-Issue form only when policy or verified viewer
permission permits it. It also reads a bounded `.github/ISSUE_TEMPLATE` directory: only supported
Markdown metadata (`name`, `about`, `title`, `labels`, `assignees`) pre-fills Harbor's native form
and its existing create request; YAML Forms and invalid or unknown Markdown metadata go to the exact
GitHub template URL. This avoids partially reimplementing GitHub form validation, adds no OAuth
scope, and keeps issue content writes behind the focused `github/issue/content.rs` module.

On current merged `main` at `911148ff04756ecfa21b715021836fbd3d223c73`, which contains PR #35
followed by the independently merged CodeQL remediation PR #34, `pnpm check` passes 63 frontend
files and 302 tests with a successful production build. Rust library tests pass 441 cases with two
intentional external-service ignores. Rustfmt, `cargo check`, and `git diff --check` pass. Clippy
reports exactly the 15 pre-existing warnings and
none in this slice. All four PR #35 CodeQL checks succeeded. The PR remote branch, local feature
branch, and both feature/merged-main temporary worktrees are absent.

[PR #36](https://github.com/Excelius-Wang/harbor/pull/36) creates one new blank Issue directly as a
child of the current Issue in the exact same repository through merge commit
`bcaea3656f0b13fa16e4226faa3603b41e05d815`; its reviewed head was
`c32b94f28fc7e9d088ac7040d5079c1bb7f6b245`. The backend uses one atomic
GraphQL `createIssue` mutation with `parentIssueId`, preflights repository/parent identity, Issues and
blank-Issue policy, and viewer capability, then verifies the created Issue identity and authoritative
parent relationship without falling back to separate REST create/attach writes. The UI reuses the
existing Markdown title/body form, retains entered content on failure, refreshes both relationship
and detail identities plus Issue lists, and sends template-required repositories to GitHub before an
existing Issue can be attached. Focused tests cover atomicity, no fallback after mutation failure,
permissions, policy, identity/postflight checks, cache refresh, restricted policy, and retained form
content. The first Spec review found one rate-limit-title P1; two regression tests fixed both policy
and write paths, after which exact-head Standards and Spec reviews reported zero findings. All four
CodeQL checks passed.

On merged `main` at `bcaea3656f0b13fa16e4226faa3603b41e05d815`, `pnpm check` passes 63
frontend files and 307 tests with a successful production build.
Rust library tests pass 448 cases with two intentional external-service ignores. `cargo check`,
Rustfmt, and `git diff --check` pass. Clippy reports exactly the 15 pre-existing warnings and none in
this slice. The GitHub Dependabot API reported zero open alerts before Draft, Ready, merge, and after
merge. The feature/merged-main worktrees, local feature branch, and remote branch are removed; the
remote has no open PRs.

The former clean-main worktree `/private/tmp/harbor-github-web-parity-next-20260830` remains checked
out at `5be2a25`, so it is not current main. This primary worktree remains on local recovery branch
`checkpoint/github-actions-administration-20260830` at `7e2084f` with concurrent user/other-session
changes. Do not reset, stash, clean, or use the primary worktree for source edits. Root `CAIRN.md`
currently points to this work item; preserve unrelated README and archive changes. For future slices,
fetch `origin/main` and create a fresh independent feature worktree from its current descendant.

PRs #32, #33, #35, and #36 complete add, remove, current-page adjacent reordering, and direct new
child creation in the exact same repository, with no reparenting. Cross-page or cross-repository
reordering and otherwise changing the hierarchy remain separate because GitHub writes can cross
repositories under one owner, replace an existing parent, or trigger secondary rate limits.
Marking or unmarking a duplicate is likewise separate because it changes the canonical work item and
needs explicit target-search and undo semantics.

[PR #37](https://github.com/Excelius-Wang/harbor/pull/37) covers only undoing the current Issue's
existing duplicate mark; selecting and marking a new canonical Issue remains a later slice. It
merged as `13e0b48fbcdf0dc8088a257afcc62538b4e2191a`; its reviewed head was
`ea86af3d9a63465b990f279464e739ed3ead814e`. The backend reloads the authoritative source
Issue, canonical node ID, repository identity, and viewer permission before sending one
`unmarkIssueAsDuplicate` mutation with retries disabled. It validates the mutation response and both
GraphQL and REST postflight reads; unconfirmed writes report a state conflict that may have
persisted. The frontend exposes the action only with repository write permission, keeps read-only
duplicate references navigable, confirms that the current Issue stays closed, and refreshes source,
canonical, state-capability, list, and inbox caches. The first Spec review found two P1s: GitHub
removed the `stateReason(enableDuplicate: true)` argument on 2025-10-01, and postflight permission/rate-limit
errors were being collapsed into state conflicts. Both are fixed with unargumented `stateReason`
across duplicate and shared Issue-state queries, explicit postflight error preservation, and
regression tests. Exact corrected-head Standards and Spec reviews reported zero findings. A
pre-existing full-suite flake in the lazy Markdown security preview reproduced twice under parallel
load; its test now prewarms the actual lazy module, after which the focused test and two consecutive
full frontend runs passed. On merged `main` at `13e0b48`, `pnpm check` passes 64 frontend files and
313 tests with a production build; Rust library
tests pass 459 cases with two intentional ignores; `cargo check`, Rustfmt, and `git diff --check`
pass; Clippy reports exactly the 15 pre-existing warnings. All four CodeQL checks passed. Dependabot
reported zero open alerts before Draft, Ready, merge, and after merge. The feature/merged-main
worktrees, local feature branch, and remote branch are removed; the remote has no open PRs.

[PR #38](https://github.com/Excelius-Wang/harbor/pull/38) marks an open current Issue as a duplicate
of one explicitly selected same-repository Issue. It merged as
`f12fa593266eca99fd9c7cea868dec4997903a2f`; its reviewed head was
`5f43cf2d9438ba487c0679026f6b7ba572cfad9d`. The UI follows GitHub Web's `Duplicate of #number`
model: it reuses the existing Issue detail query to preview the candidate title before confirmation,
hides the action unless the authoritative state capability allows closing, and never sends a
canonical Node ID. The backend re-resolves the exact source, repository, and canonical Issue,
rejects self-reference and a canonical Issue that is itself a duplicate, then sends one
retry-disabled `closeIssue` mutation with `stateReason: DUPLICATE` and `duplicateIssueId`. It verifies
the mutation plus GraphQL and REST postflights. Focused Rust duplicate tests pass 25 cases; focused
frontend interaction/cache tests pass seven. Exact-head Standards and Spec reviews both reported
zero findings, and all four CodeQL checks passed. On merged `main` at `f12fa59`, `pnpm check` passes
65 frontend files and 318 tests with a production build; Rust library tests pass 469 cases with two
intentional ignores; `cargo check`, Rustfmt, and `git diff --check` pass; Clippy reports exactly the
15 pre-existing warnings. Dependabot reported zero open alerts before Draft, Ready, merge, and after
merge. The feature/merged-main worktrees and local/remote feature branches are removed.

[PR #39](https://github.com/Excelius-Wang/harbor/pull/39) gives Issue-linked pull requests native
Harbor navigation while retaining a separate canonical GitHub link. It merged as
`4b1d765db379adf6024d15ba7abfaa1b9b5b4b52`; its reviewed head was
`3910ed2d3b47c742fab4344bd7c906544771ef8d`. The backend returns the already validated linked
repository as structured owner/name/full-name/URL identity, so the frontend never parses a display
string. The Issue detail opens same- or cross-repository linked pull requests through the existing
native PR detail and returns to the source Issue; the adjacent external button remains independent.
Focused frontend tests pass seven cases and focused linked-PR Rust tests pass five. Exact-head
Standards and Spec reviews both reported zero findings, and all four CodeQL checks passed. On merged
`main` at `4b1d765`, `pnpm check` passes 65 frontend files and 319 tests with a production build;
Rust library tests pass 469 cases with two intentional ignores; `cargo check`, Rustfmt, and
`git diff --check` pass; Clippy reports exactly the 15 pre-existing warnings. Dependabot reported
zero open alerts before Draft, Ready, merge, and after merge. The feature/merged-main worktrees and
local/remote feature branches are removed.

[PR #40](https://github.com/Excelius-Wang/harbor/pull/40) extends PR #38's duplicate action to an
explicitly selected cross-repository canonical Issue. It merged as
`375f5492e4f9a8eaa995c357c68bc337c7303ce7`; its reviewed head was
`c6df912e2c9efd9f283e84fc2303241dc3b7e8f6`.
The UI accepts either a same-repository positive Issue number or an exact GitHub Issue URL, previews
the exact owner/repository/number through the existing Issue detail query, rejects the current Issue,
and binds confirmation and submission to the reviewed target. The backend validates source and
canonical repositories independently in one GraphQL preflight, retains the retry-disabled
`closeIssue` write, and verifies exact canonical node/repository/number identity in postflight.
Issue-to-Issue relationships only are in scope; pull-request targets remain invalid. Local focused
tests pass nine frontend cases, 29 Rust duplicate cases, and the saved-connection regression.
Full `pnpm check` passes 65 frontend files and 321 tests with a production build; Rust tests pass
473 cases with two intentional ignores. `cargo check`, Rustfmt, and `git diff --check` pass, and
Clippy reports exactly the 15 pre-existing warnings.
The first two Spec reviews found URL exactness P2s: the shared parser first ignored empty path
components, then still relied on `new URL()` after it had normalized explicit default ports and empty
credential syntax away. The parser now matches the unnormalized input against the exact HTTPS GitHub
Issue form and regression tests reject double/trailing slashes, extra paths, credentials, ports,
queries, fragments, wrong hosts/protocols, and pull-request URLs. Corrected-head Standards and Spec
reviews both reported zero findings, and all four CodeQL checks passed. On merged `main` at
`375f549`, `pnpm check` passes 65 frontend files and 321 tests with a production build; Rust tests
pass 473 cases with two intentional ignores. `cargo check`, Rustfmt, and `git diff --check` pass;
Clippy reports exactly the 15 pre-existing warnings. Dependabot reported zero open alerts before
Draft, Ready, merge, and after merge. The feature/merged-main worktrees and local/remote feature
branches are removed; the remote has no open PRs.

[PR #41](https://github.com/Excelius-Wang/harbor/pull/41) adds repository Issue pinning through
squash merge `e44f63ea164cbdd8fc61e4ae75d1da64aa820cc6`; its reviewed head was
`9ade63ae743e04d97c9ff244df31a96288fe6adf`. The focused `github/issue_pin.rs` interface owns
bounded reads plus retry-disabled Pin/Unpin writes. It rejects cross-repository, duplicate, stale,
over-capacity, read-only, mismatched response, ambiguous write, and unconfirmed postflight states.
The frontend shares one pinned cache between the Issue list and detail action, keeps list failures
local, preserves loaded pins on background failure, hides controls without write permission, and
disables Pin at GitHub's three-Issue limit. The compact empty state uses the repository's existing
shadcn `Empty` composition. Exact-head Standards and Spec reviews both reported zero findings, and
all four CodeQL checks passed.

On merged `main` at `e44f63e`, `pnpm check` passes 67 files and 331 tests with a production build;
Rust tests pass 484 cases with two intentional ignores. `cargo check`, Rustfmt, and
`git diff --check` pass; Clippy reports exactly the 15 pre-existing warnings. The GitHub Dependabot
API reported zero open alerts before Draft, Ready, merge, and after merge. The feature/merged-main
worktrees and local/remote feature branches are removed; the remote has no open PRs. Comment
pinning, Issue transfer/deletion/cloning, and organization Issue fields remain separate slices.

[PR #42](https://github.com/Excelius-Wang/harbor/pull/42) permanently deletes the current Issue
through squash merge `e8fa356edca59100d89e12e27b086645dc0109f2`; its corrected reviewed head was
`c451ce31c71365d4f9ebb7918cdc6b67741440cd`. GitHub's current documentation limits deletion to
repository admins/owners and requires explicit confirmation. The live GraphQL schema exposes
non-null `Issue.viewerCanDelete`, the exact `deleteIssue(issueId)` mutation, and the source
repository in the response. The bounded implementation shows a destructive action only for an exact
authoritative deletable Issue, re-resolves repository and Issue identity before one retry-disabled
mutation, validates the returned repository, confirms the original Node ID no longer resolves,
reconciles Issue/list/inbox/pinned caches, and navigates away. Issue transfer, cloning, comment
deletion, organization policy management, and bulk deletion remain separate; no new OAuth scope was
needed.
The focused `github/issue_delete.rs` module now returns authoritative delete status, requires both
repository `ADMIN` and `viewerCanDelete`, validates the exact Issue Node ID, sends one retry-disabled
`deleteIssue` mutation, verifies the returned repository, and accepts only an exact missing-node
postflight while preserving permission/rate-limit errors. The UI uses shadcn `AlertDialog`, removes
the deleted Issue from detail/list/inbox/pinned caches, and navigates away only after confirmed
success. Focused tests pass nine Rust transport cases and seven frontend interaction cases. The
corrected head distinguishes a stale preflight identity (`githubIssueStateConflict`) from an
ambiguous deletion and invalidates the current Issue detail cache on uncertain writes. Exact-head
Standards and Spec reviews on `e44f63e...c451ce3` both report zero findings. Full `pnpm check` passes
68 files and 338 tests with a production build; Rust tests pass 494 cases with two intentional
ignores. `cargo check`, Rustfmt, and `git diff --check` pass; Clippy reports exactly the 15
pre-existing warnings. All four PR #42 CodeQL checks pass.

PR #43 added Issue transfer and merged as
`b1aad8b9bcd519d072b91bf83ebed31deffea537`; its corrected reviewed head was
`54ae912023c7e5830f399b4ff82a6a07e411bde9`. GitHub's current contract permits only open Issue
transfers between repositories owned by the same user or organization, requires write access to
both repositories, and forbids private-to-public transfers. The live GraphQL schema exposes
`transferIssue(issueId, repositoryId, createLabelsIfMissing)` and returns the transferred Issue.
This bounded slice performs authoritative source/target preflight, sends one retry-disabled mutation,
confirms the original Issue identity and target by node and number, reconciles source
list/inbox/detail/pinned caches, and navigates to the transferred Issue. Focused tests pass 11 Rust
transport/error cases and six frontend parser/cache/interaction cases; the corrected head rejects a
mismatched mutation Issue Node ID and refreshes source/target caches when the write outcome is
ambiguous. Exact-head Standards and Spec reviews on `e8fa356...54ae912` report zero P0/P1/P2
findings; the only P3 data-clump suggestion is accepted as a low-priority follow-up.
On merged `main` at `b1aad8b`, serial `pnpm check` passes 69 files and 344 tests (343 passed, one
existing skipped) with a production build; Rust tests pass 505 cases with two intentional ignores.
`cargo check`, Rustfmt, and `git diff --check` pass; Clippy reports exactly the 15 pre-existing
warnings. All four CodeQL checks passed, and the GitHub Dependabot API reported zero open alerts
before Draft, Ready, merge, and after merge. The feature/verification worktrees, local feature
branch, and remote branch are removed; the remote has no open PRs.

PR #44 added pin and unpin controls for GitHub Issue timeline comments and merged as
`1ce5a38c68c76808ffcfb9034adbbea37d483c2f`; its final reviewed head was
`61d58a1bb3f7dad18edbd133a0875d6cfb2913b5`. The backend reads authoritative `isPinned`,
`viewerCanPin`, and `viewerCanUnpin` fields, scopes the feature to Issue comments, guards the
displayed revision and current pin state, sends one retry-disabled `pinIssueComment` or
`unpinIssueComment` mutation, verifies the returned identity and state, and refreshes Issue caches
on conflicts or uncertain writes. The frontend exposes controls only for authoritative capability,
shows progress and visible failures for standalone pin actions, and keeps PR Conversation comments
out of the Issue-only pin scope. Exact-head Standards and Spec reviews both reported zero findings;
the final review also covered the no-retry transport and uncertain-write regression. On merged
`main` at `1ce5a38`, serial `pnpm check` passes 70 files and 347 tests with a production build;
Rust library tests pass 507 cases with two intentional ignores. `cargo check`, Rustfmt, and
`git diff --check` pass; Clippy reports exactly the 15 pre-existing warnings. All four CodeQL
checks passed. Dependabot reported zero open alerts before Draft, Ready, merge, and after merge;
there are no open PRs. The feature/verification worktrees, local feature branch, and remote branch
are removed.

PR #45 added a bounded same-repository GitHub Issue cloning flow and merged as
`63dffc03922939c887e04ff082c57990c27648da`; its final reviewed head was
`b1b9e7a78fff1cc2cdfbf7e0c7496122130c33b5`. The backend performs an authoritative open-Issue,
blank-Issue policy, and triage-capability preflight, then sends one retry-disabled `createIssue`
mutation with editable title/body and verifies the created Issue's node, number, repository, URL,
content, and open state. The original remains unchanged. The frontend keeps the form content
editable, exposes the action only when the authoritative capability allows it, retains entered content
on failure, navigates to the verified clone, and refreshes Issue caches. Postflight permission and
rate-limit errors remain explicit, while ambiguous writes tell the user to refresh. Focused Rust
and frontend tests cover the contract, guards, identity/content verification, no-retry behavior,
cache invalidation, and error UX. Exact-head Standards and Spec reviews both reported zero findings;
all four CodeQL checks passed. On merged `main` at `63dffc0`, `pnpm check` passes 72 frontend files
and 349 tests with a production build; Rust library tests pass 514 cases with two intentional
ignores. `cargo check`, Rustfmt, and `git diff --check` pass; Clippy reports exactly the 15
pre-existing warnings. Dependabot reported zero open alerts before Draft, Ready, merge, and after
merge; there are no open PRs. The feature/verification worktrees, local feature branch, and remote
branch are removed.

PR #46 added bounded assignment and clearing of an existing repository Issue type and merged as
`20acbc8029b32548318c44660b5a1a3695cadd3c`; its final reviewed head was
`9a5868c2ac7e9f27ab4a0ad74fd66ea3499c075a`. The backend loads repository Issue types through the
official REST endpoint, reads the Issue's authoritative `viewerCanType` capability and identity,
preflights stale/current/available type IDs, sends one retry-disabled `updateIssueIssueType`
mutation, and verifies the returned and postflight type state. Clearing uses the official nullable
type ID. The frontend adds the selector to Issue metadata, keeps a disabled current type visible,
gates writes on the nullable capability (failing closed), localizes permission/rate-limit/state
errors, and refreshes type/detail caches after success or failure. Focused tests cover the five-call
HTTP sequence, no-retry 503 behavior, nullable capability, postflight/error preservation, cache
invalidation, and mutation UX. Exact-head Standards and Spec reviews both
reported zero findings; all four CodeQL checks passed. On merged `main` at `20acbc8`, `pnpm check`
passes 74 frontend files and 352 tests with a production build; Rust library tests pass 523 cases
with two intentional ignores. `cargo check`, Rustfmt, and `git diff --check` pass; Clippy reports
exactly the 15 pre-existing warnings. Dependabot reported zero open alerts before Draft, Ready,
merge, and after merge; there are no open PRs. The feature/verification worktrees, local feature
branch, and remote branch are removed.

PR #47 added a bounded Issue-to-personal-Project assignment action and merged as
`75a77e4a0a01704013f7b1fdb442744844caf289`; its final reviewed head was
`9ee92ec9d23c1c5bbefbe9faae871a1cf3cbc314`. The frontend exposes the action from Issue metadata,
loads only open personal Projects on demand with cursor pagination and a visible load-more state,
and reuses the verified `addProjectV2ItemById` path with the authoritative Issue URL. Projects
without viewer write capability are disabled; loading, empty, retryable error, permission, and
rate-limit states remain visible. Success and failure reconcile Issue timeline/detail and Project
caches. Focused interaction tests cover canonical URL assignment, cache invalidation, localized
permission failure, and two-page pagination. Exact-head Standards and Spec reviews both reported
zero findings; all four CodeQL checks passed. On merged `main` at `75a77e4`, `pnpm check` passes
75 frontend files and 356 tests with a production build; Rust library tests pass 523 cases with two
intentional ignores. `cargo check`, Rustfmt, and `git diff --check` pass; Clippy reports exactly
the 15 pre-existing warnings. Dependabot reported zero open alerts before Draft, Ready, merge, and
after merge; there are no open PRs. The feature/verification worktrees, local feature branch, and
remote branch are removed.

PR #48 added the Issue Development linked-branch workflow and merged as
`0e8f315aa283e3962ef3ebda3bf9d567a162a857`; its final reviewed head was
`507de59d136b39176e648b3f3a523e02444aefd5`. The backend uses GitHub GraphQL's official
`createLinkedBranch` and `deleteLinkedBranch` mutations, creates from the authoritative default
branch revision, retains repository identity through response/postflight checks, reconciles all
bounded linked-branch pages, and disables retries for writes. The frontend exposes the Issue
Development card with optional branch naming, bidirectional pagination/load-more, permission,
loading, empty, stale-data, retry, and localized rate-limit states; unlinking removes only the
relationship and never deletes the branch. Organization/Enterprise administration remains out of
scope. Focused linked-branch Rust tests pass 9 cases and frontend interaction tests pass 5 cases;
exact-head Standards and Spec reviews reported zero findings; all four CodeQL checks passed. On
merged `main` at `0e8f315`, `pnpm check` passes 76 frontend files and 361 tests with a production
build; Rust library tests pass 532 cases with two intentional ignores. `cargo check`, Rustfmt, and
`git diff --check` pass; Clippy reports exactly the 15 pre-existing warnings. Dependabot reported
zero open alerts before Draft, Ready, merge, and after merge; the remote has no open PRs. The
feature/verification worktrees, local feature branch, and remote branch are removed.

PR #49 added cross-repository Issue linked-branch destinations and merged as
`618d033e553aa705a0e11c47a3d85807bce5ee36`; its final reviewed head was
`abaa77860f65473013221fddb81ad499a2e413d7`. The backend parses one bounded `owner/repository`
destination, resolves and verifies its repository identity, default branch name and commit OID,
requires destination `WRITE`/`MAINTAIN`/`ADMIN`, sends GitHub's official `repositoryId` and OID
inputs, and validates the returned branch plus all paginated postflight links. Same-repository
creation keeps the source default-revision guard. The frontend adds a localized destination
repository field, keeps source read-only Issues able to target a writable repository, preserves
permission/rate-limit error categories, and invalidates source and destination code caches after
success or an ambiguous write. The linked-branch GraphQL contract moved into its own module.
Focused linked-branch Rust tests pass 12 cases, the repository parser test passes, and frontend
interaction tests pass 6 cases. Exact-head Standards and Spec reviews on
`0e8f315...abaa778` both reported zero findings; all four CodeQL checks passed. On merged `main` at
`618d033`, `pnpm check` passes 76 frontend files and 362 tests with a production build; Rust
library tests pass 536 cases with two intentional ignores. `cargo check`, Rustfmt, and
`git diff --check` pass; Clippy reports exactly the 15 pre-existing warnings. Dependabot reported
zero open alerts before Draft, Ready, merge, and after merge; the remote has no open PRs. The
feature/merged-main worktrees, local feature branch, and remote branch are removed.

PR #50 added an explicit Issue-to-Discussion GitHub Web fallback and merged as
`69ffa584260cefd1277ec3a9027b60893cba3d19`; its final reviewed head was
`a55663afc07bbc8042e9d193e182c0aec26128aa`. The open-Issue action uses the existing safe
external-link helper, explains that GitHub owns Discussion category selection and confirmation,
and opens the exact canonical Issue URL without a native mutation, cache write, or new OAuth scope.
English and Simplified Chinese dialog/action copy and focused interaction coverage are included.
Exact-head Standards and Spec reviews both reported zero findings, and all four CodeQL checks
passed. On merged `main` at `69ffa58`, `pnpm check` passes 77 frontend files and 363 tests with a
production build; Rust library tests pass 536 cases with two intentional ignores. `cargo check`,
Rustfmt, and `git diff --check` pass; Clippy reports exactly the 15 pre-existing warnings.
Dependabot reported zero open alerts before Draft, Ready, merge, and after merge; the remote has no
open PRs. The feature/merged-main worktrees, local feature branch, and remote branch are removed.

Issue-to-Discussion conversion remains an explicit GitHub Web fallback: the public GraphQL schema
exposes no conversion mutation, so Harbor does not emulate it with an unsafe multi-write sequence.

[PR #51](https://github.com/Excelius-Wang/harbor/pull/51) added native minimize/unminimize controls
for Issue conversation comments, Pull Request conversation comments, and submitted Pull Request
review comments, merging as `7529e195d2b18648569301cbe8c5f4176e58971c`; its final reviewed head was
`45d6db07e2ab46c9b5140bff90d326b4df95002b`. The backend reads GitHub's authoritative
`viewerCanMinimize`/`viewerCanUnminimize` capabilities, sends the official GraphQL
`minimizeComment`/`unminimizeComment` mutations with all seven `ReportedContentClassifiers`,
disables retries for writes, and guards repository/comment identity, displayed revision, current
minimized state, mutation identity, and postflight state. Postflight read failures are surfaced as
uncertain writes so Issue and review-comment caches refresh; the UI keeps minimized content collapsed
in sync with server state while preserving manual show-content expansion. Discussions, commit comments,
and gist comments remain separate slices, and no new OAuth scope was added. Exact-head Standards and
Spec reviews both reported zero findings, and all four CodeQL checks passed. On merged `main` at
`7529e19`, `pnpm check` passes 78 frontend files and 365 tests with a production build; Rust library
tests pass 540 cases with two intentional ignores. `cargo check`, Clippy, Rustfmt, and
`git diff --check` pass. Dependabot reported zero open alerts before Draft, Ready, merge, and after
merge; the remote has no open PRs. The feature/merged-main worktrees, local feature branch, and
remote branch are removed.

[PR #52](https://github.com/Excelius-Wang/harbor/pull/52) added native minimize/unminimize controls
for GitHub Discussion comments, including loaded nested replies, merging as
`a050674742f71fd92b98ceb4e448459cd997d6a9`; its final reviewed head was
`893a9c167a3e659f61e20feb91f3ca5419a5ca3f`. The backend reuses the official GraphQL
`minimizeComment`/`unminimizeComment` mutations with all seven classifiers, disables retries for
the write path, and preflights the selected repository, discussion number, comment identity,
revision, minimize state, deletion state, and viewer capabilities before postflight verification.
The frontend exposes the action only from authoritative capability fields, refreshes the full
Discussion after success or an uncertain write, keeps minimized content state synchronized, and
uses localized may-have-persisted messaging. Exact-head Standards and Spec reviews both reported
zero findings, and all four CodeQL checks passed. On merged `main` at `a050674`, `pnpm check` passes
79 frontend files and 367 tests with a production build; Rust library tests pass 545 cases with two
intentional ignores. `cargo check`, Rustfmt, `git diff --check`, and non-fatal Clippy verification
pass, with 11 pre-existing Clippy warnings and none in this slice. Dependabot reported
zero open alerts before Draft, Ready, merge, and after merge; the remote has no open PRs. The
feature worktree, local feature branch, and remote branch are removed.

[PR #53](https://github.com/Excelius-Wang/harbor/pull/53) added native minimize/unminimize controls
for GitHub Commit comments and merged as `374dae723dbd584969ca362923f5df1541ce4a3c`; its final
reviewed head was `5bd926e2a4e927e6f83cd2df1d636c3cb1802dbb`. CommitComment now exposes the official
Minimizable capabilities (`isMinimized`, `minimizedReason`, `viewerCanMinimize`, and
`viewerCanUnminimize`), uses guarded numeric and Node IDs plus revision and expected-state checks,
shares the GraphQL minimize/unminimize path, disables retries for writes, verifies postflight state,
and keeps the minimized UI collapsible with localized reason text and cache synchronization. The
transport's no-retry behavior has a regression probe. Exact-head Standards and Spec reviews both
reported zero findings, and all four CI/CodeQL checks passed. The follow-up test-only PR
[#54](https://github.com/Excelius-Wang/harbor/pull/54) merged as `c4d888969644899375f94cfbd13dabce580784ec`
to remove a Clippy-obfuscated test helper without changing runtime behavior; its exact-head reviews
also reported zero findings. On merged `main` at `c4d8889`, `pnpm check` passes 79 frontend files
and 368 tests with a production build; the focused CommitComment Rust tests pass 21 cases, and
`cargo check`, Rustfmt, and `git diff --check` pass. Full Rust tests passed 549 cases with two
intentional ignores before the test-only follow-up; normal Clippy remains at the existing baseline
warnings with no new warning. Dependabot reports zero open alerts and the remote has no open PRs;
the CommitComment feature/verification worktrees and remote branches are removed.

[PR #55](https://github.com/Excelius-Wang/harbor/pull/55) added owner-scoped personal repository
Topics management through GitHub's official REST `GET`/`PUT /repos/{owner}/{repo}/topics` endpoints,
merging as `90baa66da9f9aae809eaa30955b83ba1631afaa0`; its final reviewed head was
`e4b6e3e8b019a391b933778eaef12aea7f94446f`. The backend validates the signed-in personal owner,
normalizes GitHub's lowercase topic vocabulary, bounds the list to 20 names of at most 50
characters, sends an exact `{"names": [...]}` replacement payload with retries disabled, and
confirms both the write response and a fresh postflight read. The frontend adds a repository
settings Topics card with loading, empty, initial/background error, retry, validation, clear-all,
cache synchronization, and English/Simplified Chinese copy. Topic names are explicitly disclosed as
public, including for private repositories. An edit-start snapshot prevents stale overwrites;
stale snapshots and ambiguous writes use separate stable IPC error codes, and stale failures
refetch/rebase the baseline while preserving the draft for a safe retry. Focused Rust and frontend
tests cover routes, headers, exact payloads, owner scope, no-retry behavior, stale snapshots,
uncertain postflight failures, cache behavior, and error messaging. Exact-head Standards and Spec
reviews both reported zero findings, and the latest CodeRabbit review generated no actionable
comments. All PR CodeQL checks passed.

On merged `main` at `90baa66`, `pnpm check` passes 81 frontend files and 376 tests with a successful
production build. Rust library tests pass 558 cases with two intentional external-service ignores;
`cargo check`, Rustfmt, and `git diff --check` pass. Clippy exits successfully with the same 15
pre-existing warnings and no new warning in this slice. Dependabot reports zero open alerts after
merge, there are no open PRs, and the PR #55 feature/merged-main worktrees, local feature branch,
and remote branch are removed.

The attempted Issue dependency audit produced no source changes: Issue blocked-by/blocking reads
and writes already landed in PRs #22 and #23. The clean no-op worktree
`/private/tmp/harbor-issue-dependencies-read-20260902` was removed and must not be mistaken for
unfinished implementation.

[PR #56](https://github.com/Excelius-Wang/harbor/pull/56) added native GitHub Issue task-list
tracking and merged as `edc8fef4cb45c896c05d1b0b6e8633414bbdfb74`. The read-only GraphQL path covers
both `trackedIssues` and `trackedInIssues`, with strict source/target identity, canonical URL,
self-reference, duplicate-node, and pagination-cursor validation. The Issue detail UI renders
both independently paginated directions with loading, empty, permission/error/retry states,
localized English/Simplified Chinese copy, and native cross-repository navigation. Exact-head
Standards and Spec reviews reported zero findings; CodeQL checks passed and CodeRabbit generated
no actionable comments. On merged `main` at `edc8fef`, `pnpm check` passes 83 frontend files and
380 tests with a successful production build; Rust library tests pass 566 cases with two
intentional ignores, `cargo check`, Rustfmt, and `git diff --check` pass, and Clippy exits with
the same 16 pre-existing warnings (including the existing issue-transfer test warning) and no
new warning in this slice. Dependabot reports zero open alerts, there are no open PRs, and the
PR #56 feature/verification worktrees, local feature branch, and remote branch are removed.

At the 2026-09-02 startup audit, `origin/main` is `edc8fef4cb45c896c05d1b0b6e8633414bbdfb74`,
GitHub reports zero open PRs and zero open Dependabot alerts, and the primary worktree remains
the user-owned recovery branch with unrelated uncommitted README/Cairn changes. Current GitHub
Web documentation still exposes repository Issue filtering by close reason (`reason:completed`,
`reason:"not planned"`) and by Issue type; `github-issue-view.tsx` currently exposes neither,
while `issue.rs` has no close-reason filter in `GitHubIssueFilters`. Existing Issue close-reason
state, type assignment, and relationship features were verified on `origin/main`; no duplicate
implementation is planned. The selected next slice is the read-only repository Issue close-reason
filter: it uses the existing Search API, adds no OAuth scope or write, and is isolated from
Dependabot/high-risk administration.

Implementation was developed in the independent worktree `/private/tmp/harbor-issue-close-reason-filter-20260902`
on branch `feature/issue-close-reason-filter-20260902`, based directly on `origin/main`; that
worktree is now removed. The full
frontend suite passes (84 files, 384 tests, typecheck, lint, and production build); Rust library
tests pass 567 cases with two intentional ignores, and `cargo check`, Rustfmt, and `git diff
--check` pass. Clippy exits successfully with the repository's existing 15 warnings; no new warning
was introduced by this slice. Commits `070e9f9`, `5860585`, and `b961db9` were reviewed on their
exact pushed heads (Standards and Spec: 0 findings), passed all CodeQL checks and CodeRabbit, and
squash-merged as PR #57 commit `8294fd9cf4eac6709423ba8f2e8fd7247b56aa32`. The merged-main
worktree reproduced the full frontend/Rust verification; Dependabot remains at zero open alerts,
the remote has no open PRs, and the feature worktrees/local branch were removed.

Harbor uses a classic OAuth App for scope-based personal workflows, rejects GitHub App client IDs
and `ghu_` tokens, and honors GitHub's normalization of `read:packages` into `write:packages`.
Harbor-owned code is `AGPL-3.0-only`; preserve `NOTICE`, canonical source attribution, and
`THIRD_PARTY_NOTICES.md`. Do not print, copy, or commit `.env.local`, access tokens, client secrets,
refresh tokens, or Keychain contents.

At the 2026-09-02 follow-on audit on merged `main` at
`8294fd9cf4eac6709423ba8f2e8fd7247b56aa32`, the official GitHub Web workflow still exposed
repository Issue filtering by milestone. Harbor already had the native repository milestone
endpoint/query and `GitHubIssue.milestone` display data, but the Issue list filter state, search
qualifier, cache key, and UI did not yet connect them. The selected next slice was therefore the
read-only repository Issue milestone filter: bounded title input, existing milestone data, no OAuth
scope or write, and no change to the Issue-to-Discussion fallback or documented high-risk
exclusions. That slice is now merged as PR #58; the linked pull-request and Issue type filters were
then completed as PRs #59 and #60 below.

Implementation was completed in the independent worktree `/private/tmp/harbor-issue-type-filter-20260902`
on branch `feature/issue-milestone-filter-20260902`, based directly on `origin/main`. Exact reviewed
head `1a38635` added bounded Unicode-safe milestone titles, exact escaped search qualifiers,
collision-free numeric selector values, stale-filter reset after taxonomy changes, responsive
open/closed filter layouts, query-key isolation, and milestone-aware cache reconciliation. PR #58
merged by squash as `bacd5ac40082c7b8fec3d78e6ad434da26db1d59`. On fresh merged `main`, `pnpm check`
passes 84 frontend files and 389 tests with a production build; Rust library tests pass 568 cases
with two intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and Clippy pass (15
existing warnings). Exact-head Standards and Spec re-reviews report zero findings. Dependabot is at
zero open alerts and there are no open PRs; the feature/merged-main worktrees and local/remote
feature branch are removed.

The next audit on 2026-09-02 used the current GitHub Web documentation, which exposes the
read-only repository Issue qualifier `linked:pr` for Issues linked to a pull request by a closing
reference. Harbor's existing Search API, Issue cache path, and linked pull-request detail
navigation were reused. Issue type and organization/Enterprise administration remain larger or
excluded follow-ups. PR #59 implements this bounded filter in final reviewed head `74a0aea` with
localized UI, optional IPC compatibility, conservative cache invalidation when relationship
membership is not present in `GitHubIssue`, and safe 900/1040px responsive breakpoints. Standards
and Spec reviews both report zero findings on the final head; the CodeRabbit overflow finding was
fixed and re-reviewed. PR #59 merged by squash as `ff21a3923a063e861b2a1b973b79b5a8f4935369`. On
a fresh merged `main` worktree, frontend verification passes 84 files and 391 tests with a
production build; Rust tests pass 568 cases with two intentional ignores, `cargo check`, Clippy
(15 existing warnings), Rustfmt, and `git diff --check` pass. Dependabot remains at zero open
alerts, there are no open PRs, and the feature/merged-main worktrees plus local/remote feature
branch are removed.

The next audit on 2026-09-02 used the current GitHub Web Issue search and repository Issue Types
documentation. Harbor now supports the native repository `type:"…"` qualifier in the Issue list,
with a repository Issue type catalog, localized selector, bounded/escaped input, query-key
isolation, and conservative cache invalidation after type mutations. A missing repository type
catalog (GitHub 404, which covers personal repositories without an organization-level catalog) is
treated as an empty catalog; permission and rate-limit errors remain visible. Implementation was
completed in `/private/tmp/harbor-issue-type-filter-20260902` on branch
`feature/issue-type-filter-20260902`; exact reviewed head `2d6ed5b` had zero Standards/Spec findings
after review and no actionable CodeRabbit comments. PR #60 merged by squash as
`a4a14de203832b021c22a3ffa130baf3e354f050`. On a fresh merged `main` worktree, frontend
verification passes 84 files and 393 tests with a production build; Rust tests pass 569 cases
with two intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and Clippy pass with the
repository's existing 15 warnings. Dependabot remains at zero open alerts and there are no open
PRs; the feature/merged-main worktrees and local/remote feature branch are removed.

The following evidence-first audit used GitHub Web's Pull Request Reviews filter documentation.
PR #61 adds the native repository review-status selector for `review:none`, `review:required`,
`review:approved`, and `review:changes_requested`. Implementation was completed in the independent
worktree `/private/tmp/harbor-pr-review-filter-20260902`; exact reviewed head `b24cd8d` passed
independent Standards and Spec reviews with no P0-P2 findings. The selected review qualifier owns
the conflicting `review:` term in the free-form query, including parenthesized negative terms;
the value is carried through the Tauri command, TanStack Query key, cache behavior, responsive UI,
English/Simplified Chinese locales, and interaction tests. PR #61 squash-merged as
`fdce542cdb4a81c48bd0dd6bdc42552913395cdf`. On a fresh merged `main` worktree, frontend
verification passes 85 files and 394 tests with a production build; Rust library tests pass 570
cases with two intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and Clippy pass
with the repository's existing 15 warnings. GitHub Actions, CodeQL, and CodeRabbit checks passed;
Dependabot reports zero open alerts and there are no open PRs. The PR #61 feature, merged-main,
and audit worktrees plus its local and remote feature branch are removed. GitHub Web also exposes
`reviewed-by`, `user-review-requested`, and `team-review-requested` qualifiers, and malformed
advanced grouped boolean expressions remain a separate follow-up rather than part of this bounded
selector.

The next evidence-first audit used GitHub Web's Pull Request search documentation, which exposes
the native merge-state qualifiers `is:merged` and `is:unmerged`. Harbor now has a repository PR
merge-status selector with the documented qualifiers, Tauri IPC and query-key isolation, localized
English/Simplified Chinese UI, and interaction/Rust coverage. PR #62 was developed in the
independent worktree `/private/tmp/harbor-pr-merge-filter-20260902`; exact final reviewed head
`a60eb58` passed independent Standards and Spec reviews with no P0-P2 findings after fixing the
merged/open state coupling and responsive breakpoints. Selecting Merged switches to Closed, while
switching back to Open clears that incompatible filter; Unmerged remains valid for either state.
PR #62 squash-merged as `984b749437d5602dd89522cf3ea55d5492e5ab92`. On a fresh merged `main`
worktree, frontend verification passes 85 files and 395 tests with a production build; Rust
library tests pass 571 cases with two intentional ignores, `cargo check`, Rustfmt,
`git diff --check`, and Clippy pass with the repository's existing 15 warnings. Actions, CodeQL,
and CodeRabbit checks passed; Dependabot reports zero open alerts and there are no open PRs. The
PR #62 feature, merged-main, and audit worktrees plus its local and remote feature branch are
removed.

The next audit used GitHub Web's Pull Request search documentation, which exposes the native
checks-status qualifiers `status:success`, `status:failure`, and `status:pending`. Harbor now
supports these three repository PR filters through Tauri IPC, isolated query keys, responsive
layouts, English/Simplified Chinese labels, and focused interaction/Rust tests. PR #63 was
developed in `/private/tmp/harbor-pr-status-filter-20260902`; exact reviewed head `0a99ebd` passed
independent Standards and Spec reviews with no P0-P2 findings. PR #63 squash-merged as
`2b063ab65621d3c4a88999891832722898bee1c0`. On the fresh merged-main worktree, frontend
verification passes 85 files and 396 tests with a production build; Rust library tests pass 572
cases with two intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and Clippy pass
with the repository's existing 15 warnings. Actions, CodeQL, and CodeRabbit checks passed;
Dependabot reports zero open alerts and there are no open PRs. The PR #63 feature and merged-main
worktrees plus its local and remote feature branch are removed.

The next evidence-first audit used the current GitHub Web sorting documentation, which exposes seven
Issue/PR sort choices: newest/oldest created, most/least commented, newest/oldest updated, and most
added reactions. PR #64 completed these choices for both repository lists and personal Issue/PR
inboxes. The existing `updated`/descending default remains compatible; new ascending values and
`reactions` map to the Search API's `sort` plus `order` parameters. English/Simplified Chinese
labels, accessible sort controls, Issue ascending and PR reactions interaction tests, and complete
Rust mapping tests are included. Exact-head Standards and Spec reviews reported no P0-P2 findings;
the only notes were accepted low-priority duplicated UI/mapping smells. PR #64 squash-merged as
`20ce59f2515224b28d218e5e53168b1a4690878f`. On a fresh merged-main worktree, frontend verification
passes 85 files and 398 tests with a production build; Rust library tests pass 574 cases with two
intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and Clippy pass with the repository's
existing 15 warnings. Actions, CodeQL, and CodeRabbit checks passed; Dependabot reports zero open
alerts and there are no open PRs. The PR #64 feature, merged-main worktrees, local feature branch,
and remote feature branch are removed.

The next evidence-first audit used the current GitHub Web Pull Request search documentation,
which exposes the native `is:draft` qualifier. PR #65 added a repository Pull Requests Draft
status selector, owns conflicting `is:draft` terms when selected, and carries the filter through
the Tauri command, TanStack Query key, pagination reset, localized UI, and interaction/Rust tests.
The responsive layout keeps the search field and six selectors in one row only once the container
can fit them, while narrower widths continue to wrap. Exact-head Standards and Spec reviews first
found and then cleared one P2 layout regression; the final head `adc3d23` had no P0-P2 findings and
only accepted low-priority duplication notes. PR #65 squash-merged as
`3e4553186f499ba3268bec9dfe2704c54be44c89`. On a fresh merged-main worktree, frontend verification
passes 85 files and 399 tests with a production build; Rust library tests pass 576 cases with two
intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and Clippy pass with the repository's
existing 15 warnings. Actions, CodeQL, and CodeRabbit checks passed; Dependabot reports zero open
alerts and there are no open PRs. The PR #65 feature, merged-main worktrees, local feature branch,
and remote feature branch are removed.

The next evidence-first audit used the current GitHub Web Pull Request search documentation,
which exposes the native `linked:issue` qualifier for pull requests linked to an Issue. PR #66
added a repository Pull Requests selector for that qualifier, owns conflicting `linked:` terms in
free-form search, and carries the filter through the Tauri command, optional IPC argument,
TanStack Query key, pagination reset, responsive UI, English/Simplified Chinese locales, and
interaction/Rust tests. The exact initial review caught a P1 where the default frontend omitted a
required boolean; final head `713a114` changed the command to `Option<bool>` with a `false`
fallback, and exact-head Standards/Spec re-reviews reported no P0-P2 findings. PR #66
squash-merged as `d04df621ed2299c42c1fad2af3e264e3e78ec29f`. On a fresh merged-main worktree,
frontend verification passes 85 files and 400 tests with a production build; Rust library tests
pass 577 cases with two intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and
Clippy pass with the repository's existing 15 warnings. Actions, CodeQL, and CodeRabbit checks
passed; Dependabot reports zero open alerts and there are no open PRs. The PR #66
feature/merged-main worktrees, local feature branch, and remote feature branch are removed.

The next evidence-first audit used the current GitHub Web Issue search documentation, which
supports the `assignee` qualifier and `@me` shortcut for the signed-in user. PR #67 added an
“Assigned to me” option beside the existing All and Unassigned repository Issue filters, emitting
`assignee:@me` through the native Search API. The value is carried through the existing Tauri
enum, query key, pagination reset, localized UI, and interaction/Rust coverage. Because the
frontend cannot independently determine the viewer's current assignee identity, assigned-to-me
repository list caches now invalidate after Issue mutations and a regression test covers removing
an assignee. Exact-head Standards and Spec reviews first found and then cleared that cache P2; the
final head `3ce1331` had no P0-P2 findings. PR #67 squash-merged as
`48760adbcadc5ebf6345e290c72e9085b7226c1c`. On a fresh merged-main worktree, frontend
verification passes 85 files and 402 tests with a production build; Rust library tests pass 578
cases with two intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and Clippy pass
with the repository's existing 15 warnings. Actions, CodeQL, and CodeRabbit checks passed;
Dependabot reports zero open alerts and there are no open PRs. The PR #67 feature/merged-main
worktrees, local feature branch, and remote feature branch are removed.

The next evidence-first audit used the current GitHub Web Pull Request search documentation, which
exposes `user-review-requested:@me` for direct review requests to the signed-in user. PR #68 added
the repository Pull Requests “Review requested” selector, keeping the broader review-requested
inbox scope unchanged and leaving team-review requests as a separate follow-up. The direct qualifier
owns conflicting `review-requested:`, `user-review-requested:`, and `team-review-requested:` terms
in free-form search, including negated/parenthesized forms. The value is carried through the
optional Tauri IPC argument, TanStack Query key, pagination reset, localized English/Simplified
Chinese UI, responsive 1440px layout, and focused interaction/Rust tests. Exact pushed head
`a8e0087` received independent Standards and Spec reviews with zero P0-P3 findings; PR #68
squash-merged as `b01c96129309ffc1555cdf6120f9b91eac7cf95b`. On a fresh merged-main worktree,
frontend verification passes 85 files and 403 tests with a production build; Rust library tests
pass 579 cases with two intentional ignores, `cargo check`, Rustfmt, `git diff --check`, and
Clippy pass with the repository's existing warnings. Actions, CodeQL, and CodeRabbit checks passed;
Dependabot reports zero open alerts and there are no open PRs. The PR #68 feature/merged-main
worktrees, local feature branch, and remote feature branch are removed.

The next evidence-first audit used GitHub Web's default repository Issue filter for work created by
the signed-in user. PR #69 added the native `author:@me` “Created by me” selector while preserving
arbitrary author searches when the selector is off. When selected, it owns conflicting `author:`
terms, including negated/parenthesized variants. The filter uses an optional Tauri IPC argument with
a false default, an isolated TanStack Query key, pagination/repository reset behavior, localized
English/Simplified Chinese UI, and responsive 1180/1320px layouts. Because cached Issue data cannot
independently prove the current viewer identity, created-by-me list pages invalidate after Issue
mutations and avoid unsafe optimistic insertion. Exact pushed head `9c22840` passed independent
Standards and Spec reviews with zero P0-P3 findings. CodeRabbit completed without inline or
actionable code comments; its docstring-coverage warning is not a repository requirement, and local
Clippy passed. PR #69 squash-merged as `3b833bbbcb3718c5f1bcd7f0c8cbd50e00be69c2`.
On a fresh merged-main worktree, frontend verification passes 85 files and 405 tests with a
production build; Rust library tests pass 580 cases with two intentional ignores. `cargo check`,
Rustfmt, `git diff --check`, and Clippy pass with the repository's existing warnings. Actions and
CodeQL passed; Dependabot reports zero open alerts and there are no open PRs. The PR #69
feature/merged-main worktrees, local feature branch, and remote feature branch are removed.

The next evidence-first audit used GitHub Web's default repository Pull Request filter for work
created by the signed-in user. PR #70 added the native `author:@me` “Created by me” selector while
preserving arbitrary author searches when the selector is off. When selected, it owns conflicting
`author:` terms, including negated/parenthesized variants. The filter uses an optional Tauri IPC
argument with a false default, an isolated TanStack Query key, pagination/repository reset behavior,
localized English/Simplified Chinese UI, and a responsive 1600px layout for the added selector.
Exact pushed head `4b6c57b` passed independent Standards and Spec reviews with zero P0-P3 findings.
CodeRabbit completed with no actionable code comments; its docstring-coverage warning is not a
repository requirement, and local Clippy passed. PR #70 squash-merged as
`c8b312b7ee6b2286ecf53469f6bea447c2517e3f`. On a fresh merged-main worktree, frontend verification
passes 85 files and 406 tests with a production build; Rust library tests pass 581 cases with two
intentional ignores. `cargo check`, Rustfmt, `git diff --check`, and Clippy pass with the
repository's existing warnings. Actions and CodeQL passed; Dependabot reports zero open alerts and
there are no open PRs. The PR #70 feature/merged-main worktrees, local feature branch, and remote
feature branch are removed.

The next evidence-first audit used GitHub Web's repository Issue filter for work mentioning the
signed-in user. PR #71 added the native `mentions:@me` “Mentioning me” selector and owns conflicting
`mentions:` terms, including negated and parenthesized variants, while preserving arbitrary mention
searches when the selector is off. The filter uses an optional Tauri IPC argument with a false
default, an isolated TanStack Query key, pagination/repository reset behavior, localized
English/Simplified Chinese UI, and responsive 1320/1460px layouts. Mention-filtered pages invalidate
after Issue mutations; the existing `invalidateRepositoryIssue` path also covers comment
create/update/delete changes that may add or remove a mention. Exact pushed head `faebf39` passed
independent Standards and Spec reviews with zero P0-P3 findings. CodeRabbit completed with no inline
or actionable code comments; its docstring-coverage warning and failed hosted Clippy helper are not
repository requirements, and local Clippy passed. PR #71 squash-merged as
`80d3e7f0b0606aaae724915755550a98c0d3d1d1`. On a fresh merged-main worktree, all 85 frontend test
files and 408 tests pass in resource-bounded batches with a successful production build; Rust
library tests pass 582 cases with two intentional ignores. `cargo check`, Rustfmt,
`git diff --check`, and Clippy pass with the repository's existing warnings. Actions and CodeQL
passed; Dependabot reports zero open alerts and there are no open PRs. The PR #71 feature/merged-main
worktrees, local feature branch, and remote feature branch are removed.

The next evidence-first audit used GitHub Web's default repository Pull Request filters for work
assigned to or mentioning the signed-in user. PR #72 added native “Assigned to me” and “Mentioning
me” selectors using `assignee:@me` and `mentions:@me`. A selected filter owns conflicting
`assignee:`, exact `no:assignee`, or `mentions:` terms, including negated and parenthesized forms.
Both values use optional false-default Tauri IPC arguments, isolated TanStack Query keys,
pagination/repository reset behavior, accessible English/Simplified Chinese shadcn Selects, and an
aligned 1640px responsive layout. Initial exact-head Standards/Spec reviews on `fa013ad` found two
P2 issues: `no:assignee` could contradict the personal filter, and the form/search breakpoints were
misaligned. Regression tests and fixes produced final reviewed head `28fe305`, which passed both
exact-head re-reviews with zero P0-P3 findings. CodeRabbit returned no inline or actionable comments;
its docstring-coverage warning and hosted Clippy helper failure are not repository requirements, and
local Clippy passed. PR #72 squash-merged as
`a0f5b1c1bd0469f63045cac9a5ca82642f4815c6`. On a fresh merged-main worktree, `pnpm check` passes
85 frontend files and 411 tests with a production build; Rust library tests pass 584 cases with two
intentional ignores. `cargo check`, Rustfmt, `git diff --check`, and Clippy pass with the repository's
existing 15 warnings. Actions, CodeQL, and CodeRabbit checks passed; Dependabot reports zero open
alerts and there are no open PRs. The PR #72 feature/merged-main worktrees, local feature branch,
and remote feature branch are removed.

The final evidence-first audit used GitHub's generally available global Pull Request dashboard,
which lists “Involves me” beside Authored, Assigned, and Review requested as a built-in personal
view. A live read-only Search API request confirmed `involves:@me` without new permissions. PR #73
added that scope to Harbor's personal Pull Request inbox, made the enforced scope own conflicting
`involves:` terms including negated/parenthesized forms, and preserved the existing scope/state/
query/sort/page query contract. The accessible tab, scope-specific empty state, interaction test,
and English/Simplified Chinese copy are complete. Exact pushed head `eda8e14` passed independent
Standards and Spec reviews with zero P0-P3 findings. CodeRabbit returned zero inline comments and
explicitly reported no actionable comments; its docstring warning and hosted Clippy helper failure
are not repository requirements, and local Clippy passed. PR #73 squash-merged as
`cf186113e41fa472e59367e25d8e93d556aed58f`. On a fresh merged-main worktree, `pnpm check` passes
86 frontend files and 412 tests with a production build; Rust library tests pass 584 cases with two
intentional ignores. `cargo check`, Rustfmt, `git diff --check`, and Clippy pass with the repository's
existing 15 warnings. All remote Actions, JavaScript/TypeScript, Rust, CodeQL, and CodeRabbit checks
passed; Dependabot reports zero open alerts and there are no open PRs. The PR #73 feature/merged-main
worktrees, local feature branch, and remote feature branch are removed.

The completion audit now covers GitHub's current core individual-developer paths: personal
notifications, repositories, Issues, Pull Requests, Projects, Packages, Gists, profile/discovery;
repository code, releases, Issues, Pull Requests, Discussions, Actions, security, Insights, Wiki,
Pages, access, and personal settings; and the documented daily Issue/PR lifecycle, relationship,
review, merge, search, default personal-filter, sort, loading, empty, error, permission, and
navigation behaviors. Remaining advanced search qualifiers stay available through free-form search.
GitHub-persisted saved views remain a Web fallback because current public REST and GraphQL docs do
not expose their persistence API. Public-preview additions, organization/Enterprise administration,
Codespaces, branch protection/rulesets, deployment environments, secrets/variables, organization
Issue fields, and Issue-to-Discussion conversion remain deliberately outside this completed personal
scope.

## Next action

None — complete

## Verification

For each focused slice, run `pnpm check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --lib`,
`cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`. Run independent
Standards and Spec reviews on the exact pushed head, fix every finding, then use a Draft PR, Ready
state, squash merge, merged-`main` verification, and remote branch deletion.

Success: PR #73 implementation, exact-head Standards/Spec reviews (0 P0-P3 findings),
pre-Draft Dependabot zero-alert gates, Draft/Ready PR lifecycles, all CI/CodeQL checks, CodeRabbit
review, squash merge, merged-main verification, and feature-branch/worktree cleanup all pass.
Dependabot reports zero open alerts and the remote has no open PRs. Fresh GitHub Web evidence and the
merged source inventory show no remaining low-risk core personal workflow gap inside the agreed
scope; saved views and Issue-to-Discussion remain Web fallbacks, and the documented high-risk or
organization/Enterprise capabilities remain excluded.
