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

Read fixtures and screenshots do not establish live API success. Remaining variants include workflow rerun/delete/running-state and artifact actions, Wiki comparison/revert/offline variants, and the broader advanced-action audit. Repository administration and Discussions have not yet had their visual migration. Copy in final delivery images will be refreshed after all batches.

## Shared behavior

`WorkspacePageHeader` owns the 24 px list title and header spacing. `WorkspaceStaleNotice` explicitly labels retained data after failure. `useListScroll` stays in the parent view and passes `viewportRef`/`onViewportScroll` to the production ScrollArea; it stores positions by query only for that parent lifetime. This does not persist page state across an app restart or across unmounted primary workspaces.

## Native and external gates

Native material observation is still pending. The installed Tauri 2.11.5 runtime defines IPC bridge methods as readonly; its test `mockIPC` assigns them. That made the earlier native preview bootstrap invalid. The ui-preview Vite transform now routes only application imports through `src/dev/preview-core.ts`; native window/event SDK calls retain the real bridge, and only browser preview uses `mockIPC`. A readonly-bridge isolation test verifies native forwarding while rejecting unknown application business commands. Curl confirms ordinary development still imports the SDK and production bundles exclude fixtures.

A cold launch of the diagnostic app still returned `cgWindowNotFound` in the computer-control tool. Native WebKit logs report a visible, non-hidden window that is occluded; no native screenshot or translucency pass is claimed. The diagnostic binary was verified to contain the 1423 preview URL, and production native configuration was not changed. The original development process was preserved. The user has a pending visibility question; occlusion alone does not identify its cause.

CodeRabbit was verified on [PR #81](https://github.com/Excelius-Wang/harbor/pull/81): actual `coderabbitai` reviews and a successful CodeRabbit status exist there. This proves the integration has run in the repository; it does not count as review of this branch. This task still requires its own PR and review on the final commit.
