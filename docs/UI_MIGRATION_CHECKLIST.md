# Harbor UI migration evidence

Status: in progress. A source inventory is not visual acceptance. Every row below remains pending until its production UI and applicable states have been inspected.

## Delivery gates

- [x] Inspect dirty worktree and preserve existing developer-trending work and references.
- [x] Create `refactor/unified-harbor-ui` from `03709c2` and inspect remote/open PRs.
- [x] Read selected guide and open sidebar-04, LeonAnd, and both Vorssaint images.
- [x] Baseline `pnpm check` (454 tests, lint, formatting, build) and Rust `cargo check` pass.
- [ ] Same-content before/after captures in `output/playwright/`.
- [ ] Formal tokens and shared navigation/control/overlay migration.
- [x] React production-component gallery established with minimal usage examples (additional component/state coverage remains below).
- [ ] All owned pages and overlays inspected and migrated (inventory below).
- [ ] Light/dark, English/Chinese, 900 px/wide desktop, long text and dense lists.
- [ ] Keyboard, menu search, focus, scroll containment, list/detail return/cache behavior.
- [ ] Loading, empty, error, stale refresh, disabled and selected states.
- [ ] Cool, neutral and bright detailed backgrounds; native Tauri observation.
- [ ] Reduced transparency and reduced motion.
- [ ] Update AGENTS.md and design guide with implemented entry points and verified values.
- [ ] Final `pnpm check`, required native checks and necessary final-head CI.
- [ ] PR created, actual CodeRabbit review received, valid issues fixed and reverified, final-head review checked.
- [ ] Deliver PR URL, final SHA, actual screenshots and review disposition; leave PR unmerged.

## Entry coverage

| Entry | Owned scope | Migration / visual evidence |
| --- | --- | --- |
| Workspace | Window/title bar, primary navigation, More menu, command palette, context rail and Agent sheet | Pending |
| Notifications | Inbox, filters, retained results, target detail | Inbox matrix, stale notice and mark-all dialog verified; destination variants/invitations pending |
| Issues | Inbox/repository lists, details, timeline, metadata, relationships, all actions/forms | Inbox/detail/edit/preview and return checks done; advanced actions still pending |
| Pull requests | Inbox/repository lists, details, commits, files/diff, reviews, checks, merge/lifecycle forms | Inbox/detail/commits/files, lifecycle dialogs, creation drafts and review variants verified; native/final delivery gates remain |
| Repositories | Owned/starred lists, create/access/invitations, repository shell and tabs | Core browser, code and create-form capture done; other tabs/actions pending |
| Discovery | Trending repositories/developers, developer feed, search and result/detail returns | Pending |
| Code | Tree, file/preview/blame, history/commits/comments, branches/tags/search and edit dialogs | Core/read/action/state matrices, focus and list/detail return verified; broader mutation audit remains |
| Wiki | Page list, reading/editing/history and dialogs | Page/read/editor/history and core state matrix verified; comparison/revert/offline variants pending |
| Releases | Lists/details/create/edit and assets | List/detail/create/edit/delete/asset-delete and return/state matrix verified; artifact transfer states pending |
| Discussions | Lists/details, comments/reactions/polls and forms | List/detail/forms/poll, comment dialogs and return/state matrices verified; nested replies and mutation variants pending |
| Actions | Workflows/runs/jobs/artifacts/logs/check suites and controls | List/detail/log/dispatch/disable, return and core states verified; rerun/delete/running and artifact action variants pending |
| Security | Alert lists/details and actions | Three alert kinds/detail, close form, filters/return and core states verified |
| Insights | Charts, summaries, loading/empty/error | Overview/contributors/traffic, named keyboard charts/tooltips and both-theme states verified |
| Repository settings | General/access/topics/taxonomy/pages/invitations and forms | Forms, Pages, taxonomy, invitations, visibility and return/state matrices verified; archived/deployment variants pending |
| Projects | Lists/detail fields/items and dialogs | Table/board/roadmap and create/add/settings/status dialogs verified; remaining field/draft action variants pending |
| Gists | Lists/detail/editor and files/comments | List/files/revisions/comments, editor/delete and stale/return matrix verified; mutation state variants pending |
| Packages | Lists/details and actions | List/detail/version-delete dialog and stale matrix verified; restore/mutation variants pending |
| Profile/account | Profile data/edit, connection/authentication dialogs | Profile/read/edit matrix verified; authentication and follow-failure feedback pending |
| Settings window | Theme/language/shortcut/account controls | Pending |
| About/update | Version/release info, progress, error, update dialogs/toasts | Pending |
| Third-party web | Preserve third-party presentation; inspect Harbor launch/switch controls | Pending |

## First migration batch

`NavigationButton` now owns all primary rows, including More/account/settings. Focused workspace tests (5), TypeScript and ESLint pass. Browser More menu opens its three destinations and closes with Escape. Shared palette/control/overlay defaults are implemented and gallery examples inspected in both themes. Full feature and native acceptance remain pending.

Before captures: `output/playwright/ui-before-discovery-{dark,light}-{900,1440}.png`. These show the actual browser desktop-only error state; populated before/after fixture captures are now available. Discovery matrix: `ui-discovery-{light,dark}-{cool,neutral,bright}-{900,1440}.png`, at 900 × 620 and 1440 × 900. Gallery dialog/command checks also captured. Native acceptance remains pending.

## Shared material batch

- `pnpm check`: 457 tests across 100 files, formatting, lint, TypeScript and build pass. Log: `/private/tmp/harbor-ui-shared-check.log`.
- Native dev build compiles with an isolated preview identifier; CUA window access timed out repeatedly. No native visual acceptance claimed.
- Preview IPC isolation has two tests, including rejecting unknown GitHub writes and forwarding only native window/event calls.
- [Component reference and preview instructions](UI_COMPONENTS.md) document shared entry points and implemented token values. Feature migration remains pending; inherited CSS is not render proof.

## Baseline evidence

Local logs: `/private/tmp/harbor-ui-baseline-check.log`, `/private/tmp/harbor-ui-baseline-cargo.log`.
Build reports a chunk-size advisory; no failing baseline gate. These are local evidence locations, not remote-review links.

## Source-level inventory

Generated from existing JSX-bearing production files at task start. Each file must be audited even when a shared primitive supplies its eventual appearance. Interaction test files are tracked separately by the existing test suite.

| Production source | Source audit | Render / states evidence |
| --- | --- | --- |
| `src/pages/about.tsx` | Pending | Pending |
| `src/pages/home.tsx` | Pending | Pending |
| `src/pages/settings.tsx` | Pending | Pending |
| `src/components/language-toggle.tsx` | Pending | Pending |
| `src/components/main-title-bar.tsx` | Pending | Pending |
| `src/components/mode-toggle.tsx` | Pending | Pending |
| `src/components/shortcut-input.tsx` | Pending | Pending |
| `src/components/theme-provider.tsx` | Pending | Pending |
| `src/components/title-bar.tsx` | Pending | Pending |
| `src/components/ui/alert-dialog.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/alert.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/avatar.tsx` | Pending | Pending |
| `src/components/ui/badge.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/breadcrumb.tsx` | Pending | Pending |
| `src/components/ui/button.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/card.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/chart.tsx` | Tick selector, semantic colors, focus and tooltip migrated | Insights named charts and keyboard tooltip matrix verified |
| `src/components/ui/checkbox.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/collapsible.tsx` | Pending | Pending |
| `src/components/ui/command.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/dialog.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/dropdown-menu.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/empty.tsx` | Pending | Pending |
| `src/components/ui/field.tsx` | Pending | Pending |
| `src/components/ui/input.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/label.tsx` | Pending | Pending |
| `src/components/ui/pagination.tsx` | Pending | Pending |
| `src/components/ui/popover.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/progress.tsx` | Pending | Pending |
| `src/components/ui/radio-group.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/scroll-area.tsx` | Pending | Pending |
| `src/components/ui/select.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/separator.tsx` | Pending | Pending |
| `src/components/ui/sheet.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/skeleton.tsx` | Pending | Pending |
| `src/components/ui/sonner.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/spinner.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/table.tsx` | Pending | Pending |
| `src/components/ui/tabs.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/textarea.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/ui/tooltip.tsx` | Shared defaults audited and migrated | Gallery basics inspected; feature-specific states pending |
| `src/components/updater-dialog.tsx` | Pending | Pending |
| `src/components/window-frame.tsx` | Pending | Pending |
| `src/features/github/github-actions-artifacts.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-detail.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-dispatch-dialog.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-filters.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-job-actions.tsx` | Pending | Pending |
| `src/features/github/github-actions-run-actions.tsx` | Pending | Pending |
| `src/features/github/github-actions-run-delete.tsx` | Pending | Pending |
| `src/features/github/github-actions-run-detail.tsx` | Pending | Pending |
| `src/features/github/github-actions-shared.tsx` | Pending | Pending |
| `src/features/github/github-actions-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-workflow-controls.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-workflow-navigation.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-check-suite-detail.tsx` | Pending | Pending |
| `src/features/github/github-code-branch-dialogs.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-code-delete-file-dialog.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-code-file-dialog.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-code-history.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-code-search.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-code-tags.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-code-view.tsx` | Shared surfaces plus parent-owned query state and scroll recovery | Code, history, search, file, Blame and action matrix verified |
| `src/features/github/github-comment-actions.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-comment-form.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-commit-comment-card.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-commit-comment-composer.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-commit-comment-diff.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-commit-comments-workspace.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-commit-detail.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-commit-list.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-connection-dialog.tsx` | Pending | Pending |
| `src/features/github/github-conversation-comment-actions.tsx` | Pending | Pending |
| `src/features/github/github-conversation-controls.tsx` | Pending | Pending |
| `src/features/github/github-discovery-view.tsx` | Pending | Pending |
| `src/features/github/github-discussion-comment-minimize.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-comment.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-detail.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-form-dialog.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-poll.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-execution-status.tsx` | Pending | Pending |
| `src/features/github/github-file-blame.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-file-diff.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-file-preview.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-gist-detail.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-gist-editor-dialog.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-gist-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-insights-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-issue-clone-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-convert-discussion-action.tsx` | Audited; shared confirmation primitives retained | Both themes/sizes and Escape focus return; GitHub conversion not submitted |
| `src/features/github/github-issue-create-subissue-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-create.tsx` | Migrated template/form surface hierarchy and stale policy feedback | Template selection and draft scenarios in UI_VERIFICATION.md; restricted/external and mutation variants remain |
| `src/features/github/github-issue-delete-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-dependencies.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-dependency-actions.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-detail.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-duplicate.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-edit-dialog.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-form.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-inbox.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-linked-branches.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-linked-pull-requests.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-mark-duplicate-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-metadata.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-pin-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-project-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-relation-ui.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-relationship-actions.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-relationships.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-row.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-shared.tsx` | Pending | Pending |
| `src/features/github/github-issue-state-action.tsx` | Audited; shared split action and Radix menu retained | Close-reason menu in both themes/sizes; pending/success lifecycle states remain |
| `src/features/github/github-issue-taxonomy-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-issue-timeline.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-tracking.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-transfer.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-type-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-view.tsx` | Query-specific scroll recovery integrated | Repository Issue list captured; remaining filter/action states pending |
| `src/features/github/github-markdown-editor.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-notifications.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-packages-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-pinned-issues.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-profile-editor-dialog.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-profile-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-project-dialogs.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-project-shared.tsx` | Audited; existing semantic option colors retained | Board/table/roadmap and field-edit captures |
| `src/features/github/github-project-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-pull-request-auto-merge.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-base-edit.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-branch-update.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-checks.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-commits.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-create.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-detail.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-edit-dialog.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-file-view-state.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-files-error.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-files.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-inbox.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-inline-comment.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-lifecycle.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-maintainer-editability.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-merge-panel.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-merge-queue.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-metadata.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-review-dialog.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-review-dismissal.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-review-thread.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-reviewers.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-row.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-pull-request-shared.tsx` | Audited shared materials, metadata and retained-state feedback | PR lifecycle/review matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-pull-request-view.tsx` | Audited shared PR surfaces, controls and readable metadata | PR core/lifecycle/review/inline matrices and applicable state checks in UI_VERIFICATION.md |
| `src/features/github/github-reaction-bar.tsx` | Pending | Pending |
| `src/features/github/github-reactions-provider.tsx` | Pending | Pending |
| `src/features/github/github-readme.tsx` | Pending | Pending |
| `src/features/github/github-release-create.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-detail.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-edit-dialog.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-form.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-repository-access-card.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-browser.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-repository-create-dialog.tsx` | Pending | Pending |
| `src/features/github/github-repository-invitations-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-pages-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-relationship-actions.tsx` | Pending | Pending |
| `src/features/github/github-repository-settings-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-topics.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-security-detail.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-security-shared.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-security-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-source-code.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-trending-developers.tsx` | Pending | Pending |
| `src/features/github/github-trending-filters.tsx` | Pending | Pending |
| `src/features/github/github-wiki-history-dialog.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-wiki-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/workspace/harbor-rail.tsx` | Pending | Pending |
| `src/features/workspace/harbor-workspace.tsx` | Pending | Pending |

| `src/features/workspace/navigation-button.tsx` | Extracted and reused by all primary controls | Gallery + More menu; full workspace matrix pending |
| `src/dev/component-gallery.tsx` | Production component examples | Light/dark controls, dialog and command captures; additional examples pending |

## Repository batch evidence

See [UI_VERIFICATION.md](UI_VERIFICATION.md) for exact captures and scope limits. `pnpm check` passes 458 tests. Core lists use shared page headers and result rows; body/editor surfaces use stable cool fills. Issue/PR inbox stale results are explicitly labeled. Returning from details now restores scroll per query, with browser and integration regression evidence. Remaining pages/actions must still be checked individually.

## Notifications and More batch

The five entry pages and 48 core view captures, 40 action-dialog captures, 15 Chinese state captures and five stale captures are recorded in [UI_VERIFICATION.md](UI_VERIFICATION.md). Shared controlled-overlay focus return was fixed after a real keyboard reproduction. These checks do not close the native, authentication, advanced repository/action or external review gates.

## Repository-tab batch

Actions, Releases, Wiki, Insights and Security now have 72 core captures, 40 scoped state captures, 32 action-dialog captures and chart/return checks. Full-source lint is now part of `pnpm check`; previous unquoted glob coverage was incomplete. The native preview bootstrap no longer overwrites the readonly bridge, but an actual native visual pass remains outstanding. Details and limits are in [UI_VERIFICATION.md](UI_VERIFICATION.md).
