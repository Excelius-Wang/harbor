# Harbor UI migration evidence

## Phase-one delivery boundary — 2026-09-06

The user requested a phase-one cutoff after the Gist action module, followed by one PR, actual CodeRabbit review/fixes and merge. This supersedes the original requirement to finish every visual variant before delivering a PR. Preserve the remaining items below for the next session; phase-one delivery does not establish full-site acceptance.

The Packages restore/mutation batch was completed on 2026-09-07 (see UI_VERIFICATION.md). Deferred work now starts with remaining Issue lifecycle/comment/candidate states, nested Discussion replies, archived repository/Pages conditions and release/code transfer feedback. Recent repository/conversation/Project/Gist action changes still need browser acceptance. Native background/transparency/accessibility verification and final validation of guide values also remain open. [Selected historical browser captures](verification/ui-phase-one/README.md) are available for remote review.

Status: in progress. A source inventory is not visual acceptance. Every row below remains pending until its production UI and applicable states have been inspected.

## Delivery gates

- [x] Inspect dirty worktree and preserve existing developer-trending work and references.
- [x] Create `refactor/unified-harbor-ui` from `03709c2` and inspect remote/open PRs.
- [x] Read selected guide and open sidebar-04, LeonAnd, and both Vorssaint images.
- [x] Baseline `pnpm check` (454 tests, lint, formatting, build) and Rust `cargo check` pass.
- [ ] Same-content before/after captures in `output/playwright/`.
- [ ] Formal tokens and shared navigation/control/overlay migration.
- [x] React production-component gallery includes all local primitive families and their major states, with usage examples and browser verification.
- [ ] All owned pages and overlays inspected and migrated (inventory below).
- [ ] Light/dark, English/Chinese, 900 px/wide desktop, long text and dense lists.
- [ ] Keyboard, menu search, focus, scroll containment, list/detail return/cache behavior.
- [ ] Loading, empty, error, stale refresh, disabled and selected states.
- [ ] Cool, neutral and bright detailed backgrounds; native Tauri observation.
- [ ] Reduced transparency and reduced motion.
- [ ] Update AGENTS.md and design guide with implemented entry points and verified values.
- [ ] Final `pnpm check`, required native checks and necessary final-head CI.
- [ ] PR created, actual CodeRabbit review received, valid issues fixed and reverified, final-head review checked.
- [ ] Deliver PR URL, final SHA, actual screenshots and review disposition; merge the phase-one PR after actual CodeRabbit review, valid fixes and final checks.

## Entry coverage

| Entry | Owned scope | Migration / visual evidence |
| --- | --- | --- |
| Workspace | Window/title bar, primary navigation, More menu, command palette, context rail and Agent sheet | Window/context matrices, keyboard/focus, pending/error/private and long-answer states verified; native material gate remains |
| Notifications | Inbox, filters, retained results, target detail | Inbox/stale/dialog matrix, nine additional destination routes, highlighted invitation and returns verified |
| Issues | Inbox/repository lists, details, timeline, metadata, relationships, all actions/forms | Lifecycle/comment/candidate matrix (400 captures) verified on 2026-09-09; external delivery and native/final gates remain |
| Pull requests | Inbox/repository lists, details, commits, files/diff, reviews, checks, merge/lifecycle forms | Inbox/detail/commits/files, lifecycle dialogs, creation drafts and review variants verified; native/final delivery gates remain |
| Repositories | Owned/starred lists, create/access/invitations, repository shell and tabs | Core browser, code and create-form capture done; other tabs/actions pending |
| Discovery | Trending repositories/developers, developer feed, search and result/detail returns | Core/state/filter and eight nonzero return paths verified in both themes/languages/sizes |
| Code | Tree, file/preview/blame, history/commits/comments, branches/tags/search and edit dialogs | Core/read/action/state matrices, focus and list/detail return verified; broader mutation audit remains |
| Wiki | Page list, reading/editing/history and dialogs | Page/read/editor plus complete history/comparison/restore, raw/truncated and offline/permission matrices verified with controlled responses |
| Releases | Lists/details/create/edit and assets | List/detail/create/edit/delete/asset-delete and return/state matrix verified; artifact transfer states pending |
| Discussions | Lists/details, comments/reactions/polls and forms | List/detail/forms/poll, comment dialogs and return/state matrices verified; nested reply lifecycle, guarded pending/error writes and final-width read states verified on 2026-09-09; PR review/merge pending |
| Actions | Workflows/runs/jobs/artifacts/logs/check suites and controls | List/detail/log/dispatch/disable and returns verified; run/suite metadata, jobs/logs/artifacts and rerun/cancel/delete/download UI matrices verified with controlled responses |
| Security | Alert lists/details and actions | Three alert kinds/detail, close form, filters/return and core states verified |
| Insights | Charts, summaries, loading/empty/error | Overview/contributors/traffic, named keyboard charts/tooltips and both-theme states verified |
| Repository settings | General/access/topics/taxonomy/pages/invitations and forms | Forms, Pages, taxonomy, invitations, visibility and return/state matrices verified; archived/deployment variants pending |
| Projects | Lists/detail fields/items and dialogs | Prior core matrix verified; new pending/draft/permission/empty-choice fixes and stateful fixtures pass code checks, visual action matrix pending |
| Gists | Lists/detail/editor and files/comments | Prior core matrix verified; editor/comment draft retention, pending guards and scoped failure recovery implemented with stateful action fixtures; new visual states pending |
| Packages | Lists/details and actions | Delete/restore success, pending, permission/conflict/retry, read states and filter/scroll return verified on 2026-09-07; native acceptance remains |
| Profile/account | Profile data/edit, connection/authentication dialogs | Profile/read/edit and auth availability/login/disconnect/follow pending/error matrices verified |
| Settings window | Theme/language/shortcut controls | Native-size/common-size browser matrices, keyboard, OS theme and failure/pending states verified |
| About/update | Version/release info, progress, error, update dialogs/toasts | Both native/common sizes and languages, long notes, loading/error/up-to-date and focus return verified; native material gate remains |
| Third-party web | Preserve third-party presentation; inspect Harbor launch/switch controls | Owned opener controls audited; ten browser-recorded destinations verified. Native observation remains a separate gate |

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
| `src/pages/about.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/pages/home.tsx` | Audited shared material, layout, keyboard and asynchronous context handling | Context/auth matrix in UI_VERIFICATION.md; native material gate remains |
| `src/pages/settings.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/components/language-toggle.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/components/main-title-bar.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/components/mode-toggle.tsx` | Localized checked theme menu and icon positioning | Gallery theme switching, keyboard/focus and scroll verification |
| `src/components/shortcut-input.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/components/theme-provider.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/components/title-bar.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/alert-dialog.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/alert.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/avatar.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/badge.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/breadcrumb.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/button.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/card.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/chart.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/checkbox.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/collapsible.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/command.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/dialog.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/dropdown-menu.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/empty.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/field.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/input.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/label.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/pagination.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/popover.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/progress.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/radio-group.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/scroll-area.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/select.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/separator.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/sheet.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/skeleton.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/sonner.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/spinner.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/table.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/tabs.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/textarea.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/ui/tooltip.tsx` | Audited shared semantic material, layout and applicable accessibility defaults | Complete gallery matrix and feature matrices in UI_VERIFICATION.md; native material gate remains |
| `src/components/updater-dialog.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/components/window-frame.tsx` | Audited shared material, layout and keyboard controls | Settings/About/titlebar matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-actions-artifacts.tsx` | Audited; readable execution rows, narrow header and inset feedback | Execution core/state/mutation matrices in UI_VERIFICATION.md |
| `src/features/github/github-actions-detail.tsx` | Audited; readable execution rows, narrow header and inset feedback | Execution core/state/mutation matrices in UI_VERIFICATION.md |
| `src/features/github/github-actions-dispatch-dialog.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-filters.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-job-actions.tsx` | Audited; shared execution surfaces, status and action feedback | Execution core/state/mutation and notification-route matrices in UI_VERIFICATION.md; native material remains separate |
| `src/features/github/github-actions-run-actions.tsx` | Audited; shared execution surfaces, status and action feedback | Execution core/state/mutation and notification-route matrices in UI_VERIFICATION.md; native material remains separate |
| `src/features/github/github-actions-run-delete.tsx` | Audited; shared execution surfaces, status and action feedback | Execution core/state/mutation and notification-route matrices in UI_VERIFICATION.md; native material remains separate |
| `src/features/github/github-actions-run-detail.tsx` | Audited; shared execution surfaces, status and action feedback | Execution core/state/mutation and notification-route matrices in UI_VERIFICATION.md; native material remains separate |
| `src/features/github/github-actions-shared.tsx` | Audited; shared execution surfaces, status and action feedback | Execution core/state/mutation and notification-route matrices in UI_VERIFICATION.md; native material remains separate |
| `src/features/github/github-actions-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-workflow-controls.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-actions-workflow-navigation.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-check-suite-detail.tsx` | Audited; shared execution surfaces, status and action feedback | Execution core/state/mutation and notification-route matrices in UI_VERIFICATION.md; native material remains separate |
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
| `src/features/github/github-connection-dialog.tsx` | Audited shared material, layout, keyboard and asynchronous context handling | Context/auth matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/github/github-conversation-comment-actions.tsx` | Source reviewed; Issue/PR mutation adapter and reconciliation preserved | Core comment dialogs rendered; remaining action variants pending |
| `src/features/github/github-conversation-controls.tsx` | Retained-query notice, 11 px label; recovery regression passes | New notice and advanced mutation variants await browser QA |
| `src/features/github/github-discovery-view.tsx` | Audited shared rows, metadata, source labels, filters and cached return/state handling | Discovery core/state/return/filter matrices in UI_VERIFICATION.md |
| `src/features/github/github-discussion-comment-minimize.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-comment.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-detail.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-form-dialog.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-poll.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-discussion-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-execution-status.tsx` | Audited; semantic status icons preserved | Actions/check-suite/PR matrices in UI_VERIFICATION.md |
| `src/features/github/github-file-blame.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-file-diff.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-file-preview.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-gist-detail.tsx` | Independent comment drafts, scoped errors/pending controls and guarded delete confirmations | Interaction recovery cases pass; new action visual matrix pending |
| `src/features/github/github-gist-editor-dialog.tsx` | Pending dismissal/input guard, refresh-safe drafts, named visibility group | Focused draft/dismissal cases pass; new visual states pending |
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
| `src/features/github/github-issue-pin-action.tsx` | Source reviewed; identity, permission, refresh and three-Issue guards preserved | Nine interaction cases pass; controlled pin states ready, visual matrix pending |
| `src/features/github/github-issue-project-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-relation-ui.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-relationship-actions.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-relationships.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-row.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-shared.tsx` | Source reviewed; shared semantic badges, data label colors, localized dates and guarded pagination retained | Rendered in existing Issue/core matrices; remaining final-state acceptance follows the owning pages |
| `src/features/github/github-issue-state-action.tsx` | Audited; shared split action and Radix menu retained | Close-reason menu in both themes/sizes; pending/success lifecycle states remain |
| `src/features/github/github-issue-taxonomy-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-issue-timeline.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-issue-tracking.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-transfer.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-type-action.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-issue-view.tsx` | Query-specific scroll recovery integrated | Repository Issue list captured; remaining filter/action states pending |
| `src/features/github/github-markdown-editor.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-notifications.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-packages-view.tsx` | Stale recovery, pending guards, narrow loading/error return and pane layout | Delete/restore/read/return acceptance in UI_VERIFICATION.md (2026-09-07); native acceptance remains |
| `src/features/github/github-pinned-issues.tsx` | Audited; compact relation rows, shared stale feedback and action focus/draft handling applied where needed | Issue action core/state and draft/duplicate matrices in UI_VERIFICATION.md; candidate and mutation variants remain explicit there |
| `src/features/github/github-profile-editor-dialog.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-profile-view.tsx` | Audited and migrated in Notifications/More batch | Core matrix and listed dialogs/states in UI_VERIFICATION.md; advanced variants remain explicit there |
| `src/features/github/github-project-dialogs.tsx` | Pending guards, draft retention, read-only and empty-choice states implemented | Fourteen Project UI cases pass; current field/draft visual matrix pending |
| `src/features/github/github-project-shared.tsx` | Audited; existing semantic option colors retained | Board/table/roadmap and field-edit captures |
| `src/features/github/github-project-view.tsx` | Permissions reach field/item/draft actions; pending archive/delete guards and wrapping text | Prior core captures plus current integration checks; new visual states pending |
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
| `src/features/github/github-reaction-bar.tsx` | Compact stale Retry, retained empty read-only feedback, keyboard description; recovery regressions pass | New stale/pending states await browser QA |
| `src/features/github/github-reactions-provider.tsx` | Source reviewed; exposes refresh state; batching, optimistic updates and rollback preserved | Core reaction rows rendered; new query/mutation variants pending |
| `src/features/github/github-readme.tsx` | Audited; sanitizer, safe dimensions and relative/external routing preserved | README/conversation/release and Wiki Markdown/source matrices; shared reading typography |
| `src/features/github/github-release-create.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-detail.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-edit-dialog.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-form.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-release-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-repository-access-card.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-browser.tsx` | Audited shared surfaces / layout in repository batch | Core evidence in UI_VERIFICATION.md; advanced states pending |
| `src/features/github/github-repository-create-dialog.tsx` | Linked labels, pending/dismissal guards, inline/resettable failure and retained optional templates | Recovery/pending regressions pass; new states await browser QA |
| `src/features/github/github-repository-invitations-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-pages-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-relationship-actions.tsx` | Shared controls/stale feedback, Fork guards, repository identity isolation, failed Star count recovery | Six repository UI regressions and controlled write fixtures pass; visual matrix pending |
| `src/features/github/github-repository-settings-view.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-repository-topics.tsx` | Audited; shared surfaces, readable metadata and retained-data feedback applied where needed | Administration core/state and supplemental dialog/return matrices verified; remaining variants explicit in UI_VERIFICATION.md |
| `src/features/github/github-security-detail.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-security-shared.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-security-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-source-code.tsx` | Audited; shared source/reading/metadata/feedback applied where needed | Code core/state/action/return matrices in UI_VERIFICATION.md; broader mutation audit remains |
| `src/features/github/github-trending-developers.tsx` | Audited shared rows, metadata, source labels, filters and cached return/state handling | Discovery core/state/return/filter matrices in UI_VERIFICATION.md |
| `src/features/github/github-trending-filters.tsx` | Audited shared rows, metadata, source labels, filters and cached return/state handling | Discovery core/state/return/filter matrices in UI_VERIFICATION.md |
| `src/features/github/github-wiki-history-dialog.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/github/github-wiki-view.tsx` | Audited; shared material/metadata/feedback applied where needed | Repository-tab matrix and listed states/actions in UI_VERIFICATION.md; advanced variants are recorded there |
| `src/features/workspace/harbor-rail.tsx` | Audited shared material, layout, keyboard and asynchronous context handling | Context/auth matrix in UI_VERIFICATION.md; native material gate remains |
| `src/features/workspace/harbor-workspace.tsx` | Audited shared material, layout, keyboard and asynchronous context handling | Context/auth matrix in UI_VERIFICATION.md; native material gate remains |

| `src/features/workspace/navigation-button.tsx` | Extracted and reused by all primary controls, including Settings | Gallery, More menu, window and context matrices verified |
| `src/dev/component-gallery.tsx` | All local primitive families use production components | 192 gallery and 72 preference/background captures; browser assertions in UI_VERIFICATION.md |

## Repository batch evidence

See [UI_VERIFICATION.md](UI_VERIFICATION.md) for exact captures and scope limits. `pnpm check` passes 458 tests. Core lists use shared page headers and result rows; body/editor surfaces use stable cool fills. Issue/PR inbox stale results are explicitly labeled. Returning from details now restores scroll per query, with browser and integration regression evidence. Remaining pages/actions must still be checked individually.

## Notifications and More batch

The five entry pages and 48 core view captures, 40 action-dialog captures, 15 Chinese state captures and five stale captures are recorded in [UI_VERIFICATION.md](UI_VERIFICATION.md). Shared controlled-overlay focus return was fixed after a real keyboard reproduction. These checks do not close the native, authentication, advanced repository/action or external review gates.

## Repository-tab batch

Actions, Releases, Wiki, Insights and Security now have 72 core captures, 40 scoped state captures, 32 action-dialog captures and chart/return checks. Full-source lint is now part of `pnpm check`; previous unquoted glob coverage was incomplete. The native preview bootstrap no longer overwrites the readonly bridge, but an actual native visual pass remains outstanding. Details and limits are in [UI_VERIFICATION.md](UI_VERIFICATION.md).

## Execution and notification destinations

The advanced Actions and notification route batch is verified with 504 current captures, four execution/checks regression cases and two additional preview isolation/state tests. PR checks and Discussion headers were verified in both entry contexts. Final checks pass523 tests/116 files and separate tsc. Exact states, screenshots, harness corrections and native limits are recorded in [UI_VERIFICATION.md](UI_VERIFICATION.md).

## Wiki history and shared notice wrapping

Wiki history/comparison/restore and offline/permission variants now have248 current captures and seven additional regression/fixture cases. The shared stale notice stacks Retry in a narrow rail and remains inline in wider PR checks. Final full check530 tests/117 files and separate tsc pass. Evidence and remaining boundaries are in [UI_VERIFICATION.md](UI_VERIFICATION.md).


## Resumed Issue acceptance — 2026-09-09

Issue lifecycle/comment/candidate implementation and the 400-capture browser matrix pass. Browser reproduction found and fixed broad Issue cache writes corrupting relation caches, failed-refresh draft loss, deletion dismissal/recovery gaps and wide title crowding. The final 626-test check and scoped matrices are recorded in the latest UI_VERIFICATION.md section. The six requested frontend phases and final native/delivery gates remain open; PR #87 has merged the workflow documentation at `aa1ba45`; its branches are cleaned up.

## Resumed delivery — Discussion replies (2026-09-09)

Issue PR #88 is merged, its final content is verified and its branches are cleaned up. The independent Discussion branch now has nested reply success/pending/error, deleted-parent preservation, minimization, permission/closed/read states and keyboard focus evidence. The repository header and Discussion viewport width defects found at 900 px are fixed. See UI_VERIFICATION.md for the 200-capture scope and final checks. External delivery and the later archived/Pages, transfer, recent-action and shared/native gates remain open.
