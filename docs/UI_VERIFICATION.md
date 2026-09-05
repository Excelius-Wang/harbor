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

## Shared behavior

`WorkspacePageHeader` owns the 24 px list title and header spacing. `WorkspaceStaleNotice` explicitly labels retained data after failure. `useListScroll` stays in the parent view and passes `viewportRef`/`onViewportScroll` to the production ScrollArea; it stores positions by query only for that parent lifetime. This does not persist page state across an app restart or across unmounted primary workspaces.

## Native and external gates

Native material observation is still pending. A compiled preview process alone is not screenshot evidence; the computer-control tool could not read its window. Browser screenshots verify in-page composition only.

CodeRabbit was verified on [PR #81](https://github.com/Excelius-Wang/harbor/pull/81): actual `coderabbitai` reviews and a successful CodeRabbit status exist there. This proves the integration has run in the repository; it does not count as review of this branch. This task still requires its own PR and review on the final commit.
