# Harbor UI verification record

This record separates rendered evidence from source migration. The project-wide completion gate remains open in [UI_MIGRATION_CHECKLIST.md](UI_MIGRATION_CHECKLIST.md).

## Repository, Issue and PR batch

Production entry points inspected: repository browser/code overview, Issue inbox/detail/edit/preview, PR inbox/conversation/checks/files/review dialog, and the repository Issue list. All screenshots use controlled fixtures from the real React workspace, not substituted page markup.

| Check | Evidence / result |
| --- | --- |
| Before captures | `output/playwright/ui-before-{repositories,issues,issue-detail,pulls,pull-detail}-dark-1440.png`. Some early detail captures include their actual loading states; populated captures must not be compared with those as if content were identical. |
| Populated core matrix | `ui-{repositories,issues,issue-detail,issue-edit,issue-edit-preview,pulls,pull-detail,pull-checks,pull-files,pull-review}-{dark,light}-{900,1440}.png`. Captured at 900 × 620 and 1440 × 900; waited for skeletons to finish and rejected visible missing-fixture errors. |
| Recent layout fixes | Recaptured repository/Issue detail and edit preview after fixing the breadcrumb overlap and the warm code-block fill. The 900 px repository captures also reflect naturally wrapped descriptions and the compact PR-link filter label. |
| Chinese fallback states | `ui-{repositories,issues,pulls}-{loading,empty,error}-zh-light-900.png`. The fixture error message remains synthetic English text; product headings/actions are translated. |
| Stale refresh | `ui-issues-stale-light-900.png`: after a successful initial response, refresh fails, the explicit retained-result notice appears and the previous rows remain visible. |
| Return filters | Browser checks entered `workspace` in Issues and `controls` in PRs, opened details and returned; the respective text inputs retained their values. |
| Return scroll | Reproduced Issue list position `144 → 0`; after `useListScroll`, the browser assertion verifies equal nonzero positions before/after return. The real ScrollArea integration regression also verifies separate positions for different queries. |
| Forms and keyboard | Opened Issue edit and its Markdown preview, opened PR review, closed with Escape, and reached/clicked Cancel in a scrollable compact dialog. No real business mutation was submitted. |
| Repository create | `ui-repository-create-light-900.png`: opened the production form with controlled creation options; inspected focus, private/public choice and scroll containment. Submission remains covered by existing interaction logic, not a real API call. |
| Checks | `pnpm check`: 458 tests across 101 files, formatting, lint, TypeScript and Vite build pass. Local log `/private/tmp/harbor-ui-pages-check.log`. Build retains the existing chunk-size advisory. |

This batch does **not** prove every advanced Issue relationship, PR lifecycle, inline-review or repository management flow. Those remain separately pending in the inventory. Some earlier captures predate later title/copy refinements; refresh selected final delivery screenshots after all migrations.

## Notifications, profile and More workspaces

Production Notifications, profile, Projects, Gists and Packages now share page headers, semantic row selection and readable metadata. Gist source/comment surfaces and Project board items use the shared reading material. The three split workspaces now use the same `80rem` media condition as their CSS navigation/layout breakpoint.

| Check | Evidence / result |
| --- | --- |
| Same-content before views | `ui-before-{notifications,profile,projects,gists,packages}-dark-1440.png`, captured with the new read fixtures before this batch's page changes. |
| Populated matrix | 48 captures: `ui-{notifications,profile,projects,project-table,project-board,project-roadmap,gists,gist-detail,gist-revisions,gist-comments,packages,package-detail}-{light,dark}-{900,1440}.png`. Dimensions are 900 × 620 / 1440 × 900. Capture waits for skeletons and disables finite CSS transitions so the selected tab matches the visible view. |
| Chinese states | `ui-{notifications,profile,projects,gists,packages}-{loading,empty,error}-zh-light-900.png`. Product labels use Chinese; synthetic record/error text remains English. Empty profile mode retains the profile while emptying activity and connection lists. |
| Stale results | `ui-{notifications,profile,projects,gists,packages}-stale-light-900.png`. All five entry pages retain previously loaded content and visibly report the failed refresh. Two production-component interaction regressions additionally verify Gist/Project detail stays mounted after a failed refresh and recovers on Retry. |
| Dialog matrix | 40 captures: `ui-{notifications-mark-all,profile-edit,project-create,project-add-item,project-settings,project-field-edit,gist-create,gist-edit,gist-delete,package-delete-version}-{light,dark}-{900,1440}.png`. Each was opened through its page action, tabbed through and closed using Cancel. Tall compact dialogs were scrolled to reach their footer; a screenshot near the top is not a claim that the entire form fits without scrolling. |
| Keyboard return | Browser reproduction found controlled Dialogs without a Radix Trigger lost opener focus. Shared Dialog, AlertDialog and Sheet now preserve a connected opener, respecting custom autofocus handlers. Five regressions cover all three overlays, custom return and ordinary Radix Trigger use. Browser profile editor passes 30 Tab steps, Escape, and focus return to Edit profile. |
| Breakpoints / return | At 1240 px the three More workspaces keep their list visible until a selection. At 1280 px they show the list with the selected detail, without widening the window. Gist filtering retains `workspace` after detail/back. Notifications now reuse per-query list-scroll storage; this batch does not claim a new nonzero Notification-scroll browser assertion. |
| Preview boundary | `src/dev/more-fixtures.ts` supplies typed read fixtures. Unknown writes are rejected. A regression preserves a known `null` response (no pending PR review) as distinct from an unimplemented command. Production bundles contain neither fixture identity nor preview error text. |
| Checks | 466 tests across 103 files. Final batch log: `/private/tmp/harbor-ui-more-check.log`. Full format/lint/test/build checks and `tsc -b` pass; the Vite config now uses a synchronous typed factory and no obsolete Node-global suppression. |

The matrix covers core views and the listed dialogs. Notification destination variants/invitations, authentication, profile follow-failure feedback, remaining Project field kinds/draft actions and mutation UI state variants remain in the project-wide audit. Static fixture records prove rendering and local interaction, not GitHub API correctness. Existing mutation/query tests continue to run unchanged.

## Repository tabs: Actions, Releases, Wiki, Insights and Security

All five production tabs now have controlled read fixtures. The migration uses shared rows, reading surfaces and stale-result notices; existing query keys, mutations and native GitHub fallbacks remain in place. Workflow and release lists restore their local scroll positions on detail return. Metadata is at least 11 px; job logs use 13 px monospace.

| Check | Evidence / result |
| --- | --- |
| Before views | `ui-before-repo-{actions,releases,wiki,insights,security}-dark-1440.png`, using the same fixture records before this batch's feature changes. The Insights before image caught its old chart entry animation; it is not a settled bar-geometry reference. |
| Core matrix | 72 captures: `ui-repo-{actions,action-detail,action-log,releases,release-detail,release-create,wiki,wiki-history,wiki-edit,insights,insights-contributors,insights-traffic,security-dependabot,security-code-scanning,security-secret-scanning,security-detail-dependabot,security-detail-code-scanning,security-detail-secret-scanning}-{light,dark}-{900,1440}.png`. Dimensions: 900 × 620 and 1440 × 900. |
| Scoped states | 40 captures: `ui-repo-{actions,releases,wiki,insights,security}-{loading,empty,error,stale}-zh-{light,dark}-900.png`. Named IPC commands receive the requested fixture state while parent repository navigation remains usable. Loading checks target visible skeletons because the compact Actions navigation also contains a hidden desktop skeleton. |
| Action dialogs | 32 captures: `ui-repo-{workflow-disable,workflow-dispatch,release-edit,release-delete,release-asset-delete,wiki-create,wiki-delete,security-close}-{light,dark}-{900,1440}.png`. Opened from actual page actions; checked modal focus and reached Cancel, including scrolling long forms. No live business write was sent. |
| Charts | Removed lengthy chart entry animations. Corrected the obsolete tick selector after browser inspection found actual ticks still used Recharts' `rgb(102, 102, 102)`. Browser assertions now verify all ticks use Harbor's muted text color in both themes and sizes. Charts have accessible names; keyboard ArrowRight opens the real tooltip. Four `ui-repo-chart-tooltip-{light,dark}-{900,1440}.png` captures verify the shared tooltip surface. The 12 Insights core images were recaptured after the tick fix. |
| Return behavior | Browser assertions verify equal nonzero scroll positions after returning from workflow-run and release details. Security retains the selected High severity filter after detail/back. Captures: `ui-repo-{actions,releases,security}-return-light-900.png`. |
| Retained detail regressions | Four production-view tests exercise failed Wiki overview/page, security-detail and workflow-job refreshes. Content remains mounted, the stale notice appears and Retry recovers. Native event listeners are mocked in the DOM tests. |
| Lint coverage | The previous unquoted shell glob missed deeply nested feature files. `lint` and `lint:fix` now quote the glob so ESLint traverses the complete source tree. Fixed dependency warnings without resetting a Pages configuration draft on build-status polls. Wiki's intentional control-character rejection has narrowly documented rule exceptions; no global rules were disabled. Earlier successful `pnpm check` runs used the old lint scope. |
| Checks | `pnpm check` passes 471 tests across 104 files plus full-source lint, formatting, TypeScript and build. `tsc -b` also passes. Log: `/private/tmp/harbor-repo-check.log`; the existing bundle-size advisory remains. |

Read fixtures and screenshots do not establish live API success. Remaining variants include workflow rerun/delete/running-state and artifact actions, Wiki comparison/revert/offline variants, and the broader advanced-action audit. Repository administration and Discussions are covered in the next batch below. Copy in final delivery images will be refreshed after all batches.

## Repository administration and Discussions

Repository settings, collaborators/invitations, topics, Pages, labels/milestones and Discussions now use the shared material and feedback patterns. Received repository invitations reuse the shared page header. Discussion rows retain query-specific scroll position; title and metadata sizes match the rest of the workspace. Discussion bodies, comments and polls use stable reading surfaces. Upvote controls have accessible names and toggle state.

| Check | Evidence / result |
| --- | --- |
| Before views | `ui-before-admin-{settings,discussions}-dark-1440.png`. The discussion fixture originally failed to apply the `discussionState` argument, so its before image includes four records while the corrected default open filter contains three. Do not describe those list images as identical filter results. |
| Core and dialogs | 120 captures: `ui-admin-{discussions,discussion-create,discussion-detail,discussion-edit,discussion-close,discussion-delete,discussion-comment,discussion-poll,discussion-poll-selected,settings,collaborator-add,collaborator-remove,topics,general,settings-lower,repository-archive,repository-delete,pages,pages-domain,pages-history,pages-disable,labels,label-create,label-edit,label-delete,milestones,milestone-create,milestone-edit,received-invitations,invitation-decline}-{light,dark}-{900,1440}.png`. Actual production entry paths, 900 × 620 / 1440 × 900, waiting for visible skeletons. Modal focus and Escape closing checked. |
| Chinese states | 38 captures: `ui-admin-{discussions,settings,pages,labels,invitations}-{loading,empty,error,stale}-zh-{light,dark}-900.png`, excluding the inapplicable empty settings object. Parent repository data stays populated; only named IPC queries receive the state. For views without a Refresh button, stale UI is triggered through the real query client's invalidation. |
| Narrow tables | Visual inspection found milestone actions outside the narrow pane. `harbor-adaptive-table` stacks cell groups below 720 px of container width, retaining native table headers for assistive technology. Labels and milestones use it; the four table core captures were refreshed. |
| Draft and recovery regressions | Six production-component tests cover failed settings/collaborator/invitation/topic refreshes, Pages configuration and Discussion list refresh. They verify mounted content, unpublished input values, explicit stale notices and recovery through Retry. Initial collaborator/invitation errors also have independent retry controls. |
| Preview lifecycle | Controlled administration fixtures are read-only. Duplicate synthetic build timestamps were corrected after a React key warning; fixture hot updates now reload the preview bridge/root cleanly. These changes do not enter the production bundle. |
| Checks | `pnpm check` passes 477 tests across 105 files, full-source lint, formatting, TypeScript and production build. Log: `/private/tmp/harbor-admin-check.log`. |

Supplementary checks produced 48 captures: `ui-admin-{discussion-closed,discussion-return,comment-reply,comment-edit,comment-delete,comment-minimize,comment-minimized-open,invitation-cancel,repository-visibility,pages-workflow-source,milestone-actions,milestone-delete}-{light,dark}-{900,1440}.png`. The browser verifies equal scroll positions after discussion detail/back (nonzero at 900 px), retained All states filtering and milestone action bounds within the pane. Visibility, default-branch and Pages source selectors gained explicit label associations after the accessible-name check exposed the missing linkage.

Remaining advanced variants include nested discussion replies, pending/successful mutation feedback, archived repository settings and additional Pages health/deployment conditions; these stay in the final action audit. No live repository, invitation, poll or comment was changed by this preview.

## Code, history, commits and file actions

Code history, tags, search, file/Blame reading, commit metadata and comment surfaces now share the workspace materials and readable type sizes. Code is 13 px; the shared Diff is 12 px. Existing syntax colors remain owned by the highlighter. File headers wrap identity, metadata and actions without hiding the filename at 900 px.

| Check | Evidence / result |
| --- | --- |
| Before views | `ui-before-code-{history,commit,tags,search,file,blame}-dark-1440.png`, captured before feature changes using typed read fixtures. Initial file syntax highlighting was not yet settled; do not treat the plain before capture as a syntax-color comparison. |
| Core matrix | 56 captures: `ui-code-{history,commit,diff,split-diff,tags,tag-archive,search,file,blame,file-edit,file-delete,search-return,file-create,markdown-create-preview}-{light,dark}-{900,1440}.png`. File/Blame captures wait for actual highlighted tokens; the matrix was refreshed after correcting the compact file header. |
| Chinese states | 48 captures: `ui-code-{history,commit,tags,search,file,blame}-{loading,empty,error,stale}-zh-{light,dark}-900.png`. Empty file mode is a real empty text DTO. Query invalidation triggers retained-data errors in panes without a dedicated Refresh action. |
| Actions | 24 captures: `ui-code-{branch-create,branch-delete,commit-comment-edit,commit-comment-delete,commit-comment-minimize,inline-comment}-{light,dark}-{900,1440}.png`. Real menus, forms and inline comment controls were opened. Tall forms remain scrollable; the images do not claim every field fits in one viewport. |
| Return behavior | Reproduced `workspace` search → file → return → empty search input before the fix (`ui-before-code-search-return-reset-dark-1440.png`). Search input, submitted query and page now live in the parent; history page is retained per reference/path. Four integration tests cover unsubmitted search text, paginated history through a commit/source-file excursion, and history/tag retry recovery. Browser cache fixtures with 20 rows verify equal nonzero search/history scroll positions after detail return: `ui-code-{search,history}-scroll-return-light-900.png`. |
| Menu focus | The opening menu item is detached when a branch dialog opens. The shared focus hook now retains the linked menu trigger as a fallback, including ancestor menu triggers. A real DropdownMenu/Dialog regression passes alongside the five existing overlay tests. Browser branch-dialog checks wait for Radix's close-focus lifecycle and verify return to Manage branches. |
| File fallbacks / shared Diff | Eight `ui-code-file-{binary,tooLarge}-{light,dark}-{900,1440}.png` captures use controlled cache DTOs. Four `ui-pull-files-after-code-{light,dark}-{900,1440}.png` captures verify the shared Diff size in the PR workspace. |
| Checks | `pnpm check`: 482 tests in 106 files, complete-source lint, formatting, TypeScript and production build pass. Separate `tsc -b` passes. Logs `/private/tmp/harbor-code-check.log` and `/private/tmp/harbor-code-tsc.log`. The existing comment-refresh test was updated for the shared notice/Retry wording while retaining its write-lock and recovery assertions. |

The fixture handler still rejects unknown business writes. Live GitHub mutation success is not established by these images. Broader pending/success/error action variants, primary workspace/window controls and native/external gates remain in the project checklist.

## Shared behavior

`WorkspacePageHeader` owns the 24 px list title and header spacing. `WorkspaceStaleNotice` explicitly labels retained data after failure. `useListScroll` stays in the parent view and passes `viewportRef`/`onViewportScroll` to the production ScrollArea; it stores positions by query only for that parent lifetime. This does not persist page state across an app restart or across unmounted primary workspaces.

## Native and external gates

Native material observation is still pending. The installed Tauri 2.11.5 runtime defines IPC bridge methods as readonly; its test `mockIPC` assigns them. That made the earlier native preview bootstrap invalid. The ui-preview Vite transform now routes only application imports through `src/dev/preview-core.ts`; native window/event SDK calls retain the real bridge, and only browser preview uses `mockIPC`. A readonly-bridge isolation test verifies native forwarding while rejecting unknown application business commands. Curl confirms ordinary development still imports the SDK and production bundles exclude fixtures.

A cold launch of the diagnostic app still returned `cgWindowNotFound` in the computer-control tool. Native WebKit logs report a visible, non-hidden window that is occluded; no native screenshot or translucency pass is claimed. The diagnostic binary was verified to contain the 1423 preview URL, and production native configuration was not changed. The original development process was preserved. The user has a pending visibility question; occlusion alone does not identify its cause.

CodeRabbit was verified on [PR #81](https://github.com/Excelius-Wang/harbor/pull/81): actual `coderabbitai` reviews and a successful CodeRabbit status exist there. This proves the integration has run in the repository; it does not count as review of this branch. This task still requires its own PR and review on the final commit.
