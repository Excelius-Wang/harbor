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
| Pull requests | Inbox/repository lists, details, commits, files/diff, reviews, checks, merge/lifecycle forms | Inbox/conversation/checks/files/review dialog captured; advanced review/lifecycle pending |
| Repositories | Owned/starred lists, create/access/invitations, repository shell and tabs | Core browser, code and create-form capture done; other tabs/actions pending |
| Discovery | Trending repositories/developers, developer feed, search and result/detail returns | Pending |
| Code | Tree, file/preview/blame, history/commits/comments, branches/tags/search and edit dialogs | Pending |
| Wiki | Page list, reading/editing/history and dialogs | Pending |
| Releases | Lists/details/create/edit and assets | Pending |
| Discussions | Lists/details, comments/reactions/polls and forms | Pending |
| Actions | Workflows/runs/jobs/artifacts/logs/check suites and controls | Pending |
| Security | Alert lists/details and actions | Pending |
| Insights | Charts, summaries, loading/empty/error | Pending |
| Repository settings | General/access/topics/taxonomy/pages/invitations and forms | Pending |
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
| `src/components/ui/chart.tsx` | Pending | Pending |
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
| `src/features/github/github-actions-artifacts.tsx` | Pending | Pending |
| `src/features/github/github-actions-detail.tsx` | Pending | Pending |
| `src/features/github/github-actions-dispatch-dialog.tsx` | Pending | Pending |
| `src/features/github/github-actions-filters.tsx` | Pending | Pending |
| `src/features/github/github-actions-job-actions.tsx` | Pending | Pending |
| `src/features/github/github-actions-run-actions.tsx` | Pending | Pending |
| `src/features/github/github-actions-run-delete.tsx` | Pending | Pending |
| `src/features/github/github-actions-run-detail.tsx` | Pending | Pending |
| `src/features/github/github-actions-shared.tsx` | Pending | Pending |
| `src/features/github/github-actions-view.tsx` | Pending | Pending |
| `src/features/github/github-actions-workflow-controls.tsx` | Pending | Pending |
| `src/features/github/github-actions-workflow-navigation.tsx` | Pending | Pending |
| `src/features/github/github-check-suite-detail.tsx` | Pending | Pending |
| `src/features/github/github-code-branch-dialogs.tsx` | Pending | Pending |
| `src/features/github/github-code-delete-file-dialog.tsx` | Pending | Pending |
| `src/features/github/github-code-file-dialog.tsx` | Pending | Pending |
| `src/features/github/github-code-history.tsx` | Pending | Pending |
| `src/features/github/github-code-search.tsx` | Pending | Pending |
| `src/features/github/github-code-tags.tsx` | Pending | Pending |
| `src/features/github/github-code-view.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-comment-actions.tsx` | Pending | Pending |
| `src/features/github/github-comment-form.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-commit-comment-card.tsx` | Pending | Pending |
| `src/features/github/github-commit-comment-composer.tsx` | Pending | Pending |
| `src/features/github/github-commit-comment-diff.tsx` | Pending | Pending |
| `src/features/github/github-commit-comments-workspace.tsx` | Pending | Pending |
| `src/features/github/github-commit-detail.tsx` | Pending | Pending |
| `src/features/github/github-commit-list.tsx` | Pending | Pending |
| `src/features/github/github-connection-dialog.tsx` | Pending | Pending |
| `src/features/github/github-conversation-comment-actions.tsx` | Pending | Pending |
| `src/features/github/github-conversation-controls.tsx` | Pending | Pending |
| `src/features/github/github-discovery-view.tsx` | Pending | Pending |
| `src/features/github/github-discussion-comment-minimize.tsx` | Pending | Pending |
| `src/features/github/github-discussion-comment.tsx` | Pending | Pending |
| `src/features/github/github-discussion-detail.tsx` | Pending | Pending |
| `src/features/github/github-discussion-form-dialog.tsx` | Pending | Pending |
| `src/features/github/github-discussion-poll.tsx` | Pending | Pending |
| `src/features/github/github-discussion-view.tsx` | Pending | Pending |
| `src/features/github/github-execution-status.tsx` | Pending | Pending |
| `src/features/github/github-file-blame.tsx` | Pending | Pending |
| `src/features/github/github-file-diff.tsx` | Pending | Pending |
| `src/features/github/github-file-preview.tsx` | Pending | Pending |
| `src/features/github/github-gist-detail.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-gist-editor-dialog.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-gist-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-insights-view.tsx` | Pending | Pending |
| `src/features/github/github-issue-clone-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-convert-discussion-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-create-subissue-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-create.tsx` | Pending | Pending |
| `src/features/github/github-issue-delete-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-dependencies.tsx` | Pending | Pending |
| `src/features/github/github-issue-dependency-actions.tsx` | Pending | Pending |
| `src/features/github/github-issue-detail.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-duplicate.tsx` | Pending | Pending |
| `src/features/github/github-issue-edit-dialog.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-form.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-inbox.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-linked-branches.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-linked-pull-requests.tsx` | Pending | Pending |
| `src/features/github/github-issue-mark-duplicate-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-metadata.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-pin-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-project-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-relation-ui.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-relationship-actions.tsx` | Pending | Pending |
| `src/features/github/github-issue-relationships.tsx` | Pending | Pending |
| `src/features/github/github-issue-row.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-shared.tsx` | Pending | Pending |
| `src/features/github/github-issue-state-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-taxonomy-view.tsx` | Pending | Pending |
| `src/features/github/github-issue-timeline.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-tracking.tsx` | Pending | Pending |
| `src/features/github/github-issue-transfer.tsx` | Pending | Pending |
| `src/features/github/github-issue-type-action.tsx` | Pending | Pending |
| `src/features/github/github-issue-view.tsx` | Query-specific scroll recovery integrated | Repository Issue list captured; remaining filter/action states pending |
| `src/features/github/github-markdown-editor.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-notifications.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-packages-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-pinned-issues.tsx` | Pending | Pending |
| `src/features/github/github-profile-editor-dialog.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-profile-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-project-dialogs.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-project-shared.tsx` | Audited; existing semantic option colors retained | Board/table/roadmap and field-edit captures |
| `src/features/github/github-project-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-pull-request-auto-merge.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-base-edit.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-branch-update.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-checks.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-commits.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-create.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-detail.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-edit-dialog.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-file-view-state.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-files-error.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-files.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-inbox.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-inline-comment.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-lifecycle.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-maintainer-editability.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-merge-panel.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-merge-queue.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-metadata.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-review-dialog.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-review-dismissal.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-review-thread.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-reviewers.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-row.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-pull-request-shared.tsx` | Pending | Pending |
| `src/features/github/github-pull-request-view.tsx` | Query-specific scroll recovery integrated | Repository Issue list captured; remaining filter/action states pending |
| `src/features/github/github-reaction-bar.tsx` | Pending | Pending |
| `src/features/github/github-reactions-provider.tsx` | Pending | Pending |
| `src/features/github/github-readme.tsx` | Pending | Pending |
| `src/features/github/github-release-create.tsx` | Pending | Pending |
| `src/features/github/github-release-detail.tsx` | Pending | Pending |
| `src/features/github/github-release-edit-dialog.tsx` | Pending | Pending |
| `src/features/github/github-release-form.tsx` | Pending | Pending |
| `src/features/github/github-release-view.tsx` | Pending | Pending |
| `src/features/github/github-repository-access-card.tsx` | Pending | Pending |
| `src/features/github/github-repository-browser.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-repository-create-dialog.tsx` | Pending | Pending |
| `src/features/github/github-repository-invitations-view.tsx` | Pending | Pending |
| `src/features/github/github-repository-pages-view.tsx` | Pending | Pending |
| `src/features/github/github-repository-relationship-actions.tsx` | Pending | Pending |
| `src/features/github/github-repository-settings-view.tsx` | Pending | Pending |
| `src/features/github/github-repository-topics.tsx` | Pending | Pending |
| `src/features/github/github-security-detail.tsx` | Pending | Pending |
| `src/features/github/github-security-shared.tsx` | Pending | Pending |
| `src/features/github/github-security-view.tsx` | Pending | Pending |
| `src/features/github/github-source-code.tsx` | Pending | Pending |
| `src/features/github/github-trending-developers.tsx` | Pending | Pending |
| `src/features/github/github-trending-filters.tsx` | Pending | Pending |
| `src/features/github/github-wiki-history-dialog.tsx` | Pending | Pending |
| `src/features/github/github-wiki-view.tsx` | Pending | Pending |
| `src/features/workspace/harbor-rail.tsx` | Pending | Pending |
| `src/features/workspace/harbor-workspace.tsx` | Pending | Pending |

| `src/features/workspace/navigation-button.tsx` | Extracted and reused by all primary controls | Gallery + More menu; full workspace matrix pending |
| `src/dev/component-gallery.tsx` | Production component examples | Light/dark controls, dialog and command captures; additional examples pending |

## Repository batch evidence

See [UI_VERIFICATION.md](UI_VERIFICATION.md) for exact captures and scope limits. `pnpm check` passes 458 tests. Core lists use shared page headers and result rows; body/editor surfaces use stable cool fills. Issue/PR inbox stale results are explicitly labeled. Returning from details now restores scroll per query, with browser and integration regression evidence. Remaining pages/actions must still be checked individually.

## Notifications and More batch

The five entry pages and 48 core view captures, 40 action-dialog captures, 15 Chinese state captures and five stale captures are recorded in [UI_VERIFICATION.md](UI_VERIFICATION.md). Shared controlled-overlay focus return was fixed after a real keyboard reproduction. These checks do not close the native, authentication, advanced repository/action or external review gates.
