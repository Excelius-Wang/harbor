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

## Shared behavior

`WorkspacePageHeader` owns the 24 px list title and header spacing. `WorkspaceStaleNotice` explicitly labels retained data after failure. `useListScroll` stays in the parent view and passes `viewportRef`/`onViewportScroll` to the production ScrollArea; it stores positions by query only for that parent lifetime. This does not persist page state across an app restart or across unmounted primary workspaces.

## Native and external gates

Native material observation is still pending. A compiled preview process alone is not screenshot evidence; the computer-control tool could not read its window. Browser screenshots verify in-page composition only. A second temporary native build used the unchanged production window configuration with `visible: true`, a separate identifier (`com.harbor.ui-preview-visible`) and the controlled preview URL. It compiled successfully, but the computer-control tool reported `cgWindowNotFound` even after launch. The earlier process sample shows its main thread waiting in the normal AppKit event loop; that is diagnostic evidence, not material acceptance. No production native configuration was changed.

CodeRabbit was verified on [PR #81](https://github.com/Excelius-Wang/harbor/pull/81): actual `coderabbitai` reviews and a successful CodeRabbit status exist there. This proves the integration has run in the repository; it does not count as review of this branch. This task still requires its own PR and review on the final commit.
