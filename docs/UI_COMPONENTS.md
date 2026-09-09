# Harbor UI components and preview

The component gallery uses production React components and `src/index.css`. It is available only from the development server at `/ui-components`. It is an implementation reference, not a static design mockup.

```sh
pnpm dev:ui --port 1423
```

Open `http://localhost:1423/ui-components` for controls, navigation, filters, forms, tables, charts, dialogs, sheets and feedback states. Switch theme/language using the production controls in the gallery. Open `http://localhost:1423/` for the real workspace with controlled discovery data.

The preview replaces the HTML entry only when Vite is **serving** in `ui-preview` mode. Normal development and production builds use the regular application entry. Fixtures now cover discovery, repository/code, Issue and PR core reads. Other commands still fail visibly until their fixtures are added. Fixtures are intercepted through Tauri's official `mockIPC` interface. Unknown business commands fail visibly; no GitHub mutation falls through to a real backend. Native window calls may pass through when running a native preview. Fixture data is synthetic and does not verify real GitHub API responses.

| Query parameter | Values | Purpose |
| --- | --- | --- |
| `state` | `populated`, `loading`, `empty`, `error`, `stale` | Controlled query state; `stale` fails repeat requests after initial success |
| `background` | `cool`, `neutral`, `bright` | Browser-only environment behind the transparent window |

Example: `http://localhost:1423/?state=error&background=bright`.

Browser backgrounds are test environments, not application decoration. Native previews retain the real desktop background. Browser captures cannot prove native translucency.

## Shared entry points

| Need | Entry | Usage |
| --- | --- | --- |
| Primary navigation row | `src/features/workspace/navigation-button.tsx` | Pass `icon`, translated `label`, `active`, and button events. All primary, More, account and settings rows share this component. |
| Compact action | `src/components/ui/button.tsx` | Use `variant` and `size`; keep feature classes for layout. |
| Inputs | `input.tsx`, `textarea.tsx`, `select.tsx` | Use `Field` + `FieldLabel`; invalid and disabled states remain native. |
| Menu / popover | `dropdown-menu.tsx`, `popover.tsx`, `select.tsx` | Elevated material is supplied by the primitive. Do not add a second opaque fill. |
| Searchable language filter | `src/features/github/github-trending-filters.tsx` | Production filter composition; `harbor-filter-menu` keeps compact command rows. |
| Modal / sheet / command | `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `command.tsx` | Titles and descriptions live inside the dialog content; shared material and scrim are defaults. |
| Group / feedback | `card.tsx`, `alert.tsx`, `badge.tsx`, `progress.tsx` | Thin group surfaces and semantic GitHub states. |
| Reading surface | `harbor-reading` | Stable fill for code or long reading when necessary. Do not add blur to nested groups. |

All primitive paths in this table are under `src/components/ui/` unless qualified otherwise. Continue using Radix keyboard behavior and the local Lucide icon family.

## Material implementation status

The shared stylesheet now implements a cool blue-gray family, neutral navigation selection and a single elevated material. The first discovery and component captures validate browser composition; native and full-page acceptance remain in progress. The design guide's historical candidate tables are not a declaration that every listed value shipped.

- Main fill: light `rgb(233 241 249 / 82%)`, dark `rgb(29 43 62 / 76%)`.
- Elevated fill: light `rgb(243 248 253 / 86%)`, dark `rgb(43 59 81 / 90%)`.
- Text: light `#202e40`, dark `#edf3fa`; primary actions/links: light `#2358aa`, dark `#80b8ff`.
- `destructive` is a state/text color. `destructive-solid` supplies filled destructive buttons with `destructive-foreground` so text contrast does not depend on the state color.
- Standard controls remain 6–8 px rounded; menus 12 px; dialogs 16 px. Native window clipping remains unchanged.
- Reduced transparency removes CSS backdrop filters and disables native window vibrancy through `ThemeProvider`. Reduced motion retains static progress feedback.

Use the stylesheet as the exact token source. Full migration and verification evidence is tracked in [the migration checklist](UI_MIGRATION_CHECKLIST.md).

## Current evidence

`output/playwright/` contains actual browser captures, including `ui-before-populated-*`, `ui-material-populated-*`, `ui-discovery-{theme}-{background}-{width}.png` and `ui-gallery-*`. Before/after discovery comparisons use the same fixture records. Later matrix captures additionally cover English and the 900 × 620 minimum window. Gallery screenshots include Chinese forms, invalid/disabled controls, dialogs and command menus. These local artifacts are ignored by Git; selected final screenshots must be made available to remote PR reviewers before delivery.

Native compilation succeeded, but the computer-control tool has not yet exposed the running preview window for observation. Native material acceptance is **pending**. Remaining production pages and action dialogs also remain pending in the checklist; changing primitive defaults is not their acceptance evidence.

## Page composition and return behavior

Use `WorkspacePageHeader` from `src/features/workspace/workspace-page-header.tsx` for list-page titles and actions, with `contained` for a centered 1120 px workspace and optional `leading` for a back control beside the title. Use `WorkspaceStaleNotice` when a failed refresh retains existing results. Both are shown in the gallery.

Keep `useListScroll(JSON.stringify(queryParameters))` in the parent view that swaps between list and detail. Spread its return value onto the list ScrollArea. Positions stay local to that parent and separate for each query; filters/query caches remain owned by the feature.

Markdown code blocks use `--harbor-code-fill` (`#e1e8f1` light / `#172335` dark), avoiding hue changes from mixing black into a cool palette in OKLCH. See [the verification record](UI_VERIFICATION.md) for current evidence and remaining limits.

Controlled Dialog, AlertDialog and Sheet consumers may open from ordinary page actions. Their shared content primitives restore a still-connected opener after close. `onOpenAutoFocus` and `onCloseAutoFocus` remain available; calling `preventDefault()` in a custom close handler takes precedence. Continue using Radix Trigger when it naturally belongs in the same component.

`src/dev/more-fixtures.ts` adds typed read scenarios for Notifications, profile and More pages. Fixture lookup must distinguish `undefined` (unimplemented) from valid `null` data. These fixtures never fall through to business IPC.

## Scoped repository previews

Use `?state=error&commands=github_get_repository_wiki` (or a comma-separated command list) to exercise an inner workspace query without breaking its parent navigation. Supported states remain `populated`, `loading`, `empty`, `error` and `stale`. `src/dev/repository-fixtures.ts` supplies Actions, releases, Wiki, Insights and security reads.

In ui-preview mode, Vite rewrites application imports of the core SDK to `src/dev/preview-core.ts`. This facade intercepts application `invoke` calls without assigning Tauri's readonly native internals. Real native window/event behavior remains available for visual testing. Ordinary development and production retain their original SDK imports; browser preview alone uses the SDK mock.

Chart tick labels target Recharts' actual `recharts-cartesian-axis-tick-value` nodes. Tooltips use `harbor-popover`; chart keyboard focus is visible. Data series use primary and muted colors, with destructive retained for code deletions. Insights renders data directly instead of animating chart entry.

`harbor-adaptive-table` is for workspace tables with actions that must stay visible in a narrow pane. Place the table inside a CSS container; below 720 px, its first two cells stack above metadata and actions. Table headings remain available to screen readers. Labels and milestones are the current production examples.

`src/dev/administration-fixtures.ts` supplies repository settings/access/Pages and Discussions read data. Fixture edits reload the preview entry so the mocked bridge and React root start together. These fixtures exercise production components; they do not validate live GitHub operations.

Code/source lines use 13 px monospace, and the shared `harbor-diff` uses 12 px. File and commit panels reuse `harbor-reading`; syntax colors remain the highlighter's responsibility. `GitHubCodeView` owns search input/query/page and history pages per reference/path, so those values survive detail views. The outer ScrollArea uses `useListScroll` for each surface/query.

`useOverlayFocusReturn` captures the opening element plus its linked menu-trigger chain. If the menu item has unmounted when a Dialog/AlertDialog/Sheet closes, the first connected focusable trigger receives focus. Custom close-focus handlers still take precedence.

Issue relationships use `GitHubIssueRelatedIssueRow` with a shrinking, wrapping button so sibling controls stay inside the section. `GitHubIssueRelationLoadError` accepts `stale` for retained records and delegates that state to `WorkspaceStaleNotice`. `GitHubTitleBodyForm.submitDisabled` blocks submission without discarding or disabling draft inputs; `pending` remains the actual mutation state.

`CardHeader` uses implicit grid rows and caller-supplied border padding. Small `AlertDialog` footers stack primary/cancel actions and allow long labels to wrap. Auto-focusing forms should connect their opener with `DialogTrigger asChild`; the shared close-focus hook covers controlled openers when focus has not already moved into the dialog before Radix's mount event.

PR creation reuses `GitHubTitleBodyForm.submitDisabled` to retain input after a failed branch/comparison refresh. Keep its key tied to the selected branch pair, not refreshed title suggestions. `WorkspaceStaleNotice.retryDisabled` preserves an existing pending-action lock when a consumer needs one.

The cmdk 1.1.1 patch in `patches/` maintains an item-id registry for asynchronous option selection. It changes no component API. `Command` roots in the base-branch/reviewer dialogs supply a localized search label; keyboard tests assert `aria-activedescendant` points to the selected option. See `patches/README.md` for upstream attribution and removal criteria.

`?pr=` selects controlled PR read states in ui-preview: draft/closed/merged/conflicts/unknown, queue-available/queue-waiting/queue-queued/queue-unavailable, auto-enabled, branch-conflicts, maintainer-available/maintainer-risk, pending-review/outdated-review, thread-resolved/thread-outdated, view-dismissed and reviewed. Scoped `state=loading|error&commands=<mutation>` safely exercises pending/error controls without reaching business IPC.

Separate Settings windows reuse `NavigationButton` with `alwaysExpanded`; main workspace callers keep its default responsive label behavior. Render controls that call `useTheme()` beneath WindowFrame's ThemeProvider, as `SettingsContents` does. The context's `resolvedTheme` is the displayed light/dark mode, including live OS changes when the stored setting is `system`.

`ShortcutInput` is a keyboard capture button followed by a named Clear action. Plain Tab/Shift+Tab navigate; modified key combinations and Delete/Backspace retain their existing capture/clear behavior. `disabled` locks pending changes. Shortcut registration helpers return success booleans so settings persist a value only after the native operation succeeds.

About uses a local ScrollArea layout selector to center its content while allowing overflow at its 500 × 400 creation size. Keep update notes left-aligned on `harbor-reading`; they and the dialog footer stay reachable by scrolling.

`CommandDialog` supplies its translated title as the inner Command's accessible label. Workspace commands use the shared modal placement and display only implemented actions. Put `Toaster` beneath the window ThemeProvider so explicit light/dark settings reach its description styles.

The context Agent sheet keeps the question control outside its scrollable response area. Repository changes invalidate in-flight answers/errors, including public/private changes. Closing and reopening the same repository does not discard an active request.

Account preview scenarios are `?auth=loading|unavailable|availability-error` (Retry succeeds after the initial availability failure), `?repo=private`, and `?agent=slow`. Scoped loading/error command states also cover sign-in, disconnect, follow and Agent requests. The fake auth URL is intercepted by browser SDK mocks; these scenarios do not establish native plugin or real GitHub authentication behavior.

## Complete primitive examples

The gallery includes every local UI primitive family. Radio groups, mixed/disabled checkboxes, linked validation errors, breadcrumb/current-page links, selected table rows, pagination, collapsible groups, charts with keyboard tooltips, checkbox/radio/submenus, popovers, confirmations and success/error toasts supplement the original examples. Each section includes its production import/composition. Gallery navigation uses the actual 58/226 px container widths.

`FieldGroup` and `FieldSet` default to 16 px gaps. `FieldSeparator` draws separated lines around its label without an opaque patch. `Checkbox` uses a minus for `indeterminate`; Radix still supplies the mixed accessible state. `Progress` accepts a finite positive `max`, normalizes the visual fill against it, and displays unspecified/invalid values as indeterminate. Its default maximum remains 100.

`ModeToggle`, breadcrumb and pagination defaults, and Sonner region/close labels use i18next. Consumers may still provide specific accessible labels. `Toaster.toastOptions` merges caller options with the shared material class. Keep theme icons positioned inside their trigger; the gallery verifies that scrolling the header away also removes the icons from view.

Browser reduced-transparency checks use actual media emulation and computed styles, not a manually added CSS class. Reduced window/dialog surfaces are opaque with no backdrop filter. Reduced motion stops indeterminate progress and minimizes skeleton animation. The browser background matrix remains separate from native Tauri acceptance.

## Discovery composition and fixtures

Discovery's header and results share a centered 1120 px container with 24 px inner alignment. Repository/developer descriptions wrap; code fragments use `harbor-reading` and 13 px monospace. Following events keep their actor/project together and place timestamps below that group in a narrow pane. Loading silhouettes follow each result kind.

Keep Discovery's `useListScroll` in `GitHubDiscoveryView`, keyed by the actual query or developer filters. Its viewport bindings are passed into the developer and feed children. All kinds reuse their existing query keys and cached data. Failed refreshes use `WorkspaceStaleNotice`; a failed next feed page keeps the prior events and exposes its separate error beside Load more.

`src/dev/discovery-fixtures.ts` supplies all five search result kinds and Following events, reusing the same controlled Issue/PR factories as detail views. `?discovery=dense` adds long descriptions, enough rows for nonzero scroll and a second search page; `incomplete` shows partial-search feedback; `next-error` and `next-loading` exercise feed continuation. These are synthetic read scenarios.

`?links=record` records GitHub/gist HTTPS opener targets in `window.__harborPreviewOpenedUrls` inside the browser preview, without opening a site. This opt-in mode does not intercept native SDK plugin behavior or authorize business writes. Unknown business commands continue to fail.

## Workflow execution and notification targets

`GitHubActionsRunDetail` and `GitHubCheckSuiteDetail` keep loaded metadata visible after refresh errors and show `WorkspaceStaleNotice` with Retry. `GitHubPullRequestChecks` applies the same behavior to its own list query, whether opened from a PR or a notification. Preserve these separate query boundaries.

Actions puts its header controls on a separate row below 680 px of available detail-pane width. Job, step, artifact and check text uses 13 px; metadata uses 11 px. Inset alerts use `w-auto` with their margins so the shared Alert's default full width does not extend past the parent.

Controlled workflow variants are `?actions=failed|running|queued|truncated|download-cancelled`. `&writes=accept` enables only named local rerun/cancel/delete/job-rerun/artifact-download simulations. Subsequent fixture reads reflect accepted run actions and deletion. Download success/cancellation returns a DTO only; it creates no file and does not exercise the native save picker. Scoped loading/error command states still take precedence.

`?notifications=targets` supplies nine in-app detail routes: workflow, check suite, Discussion, Release, Commit, three Security alert kinds and repository invitations. Read/Done acknowledgments remove synthetic rows, and mark-all clears this fixture inbox. This is browser preview state; unknown business commands remain rejected.

Discussion detail headers keep the title/metadata and wrapping action group on separate rows, so intermediate pane widths cannot squeeze the title between controls. This applies to both repository and notification entry points.

## Wiki history and compact retained-state feedback

`GitHubWikiHistoryDialog` keeps history, revision and comparison queries independent. Check for missing data before rendering a terminal error; retained data uses `WorkspaceStaleNotice`. A disabled, unselected revision query is not a loading state after an empty history response. Comparisons with a nonempty patch but no renderable hunks fall back to source; truncated comparisons have explicit feedback.

History rows use13px wrapping messages and `aria-current` for selection. Reading content uses `harbor-reading`. The history header reserves space for its Close control. Restore errors stay in the confirmation and reset on reopening; existing current/deleted/offline/archived/permission guards remain.

`WorkspaceStaleNotice` gives its message a12rem flex basis. Its existing wrapping flex layout moves Retry below the message in narrow areas and keeps it beside the message when space allows, without a feature-specific variant.

`?wiki=history|long|raw|truncated|source|offline|archived|readonly|disabled|uninitialized` selects controlled Wiki scenarios. Scoped command states cover history/revision/comparison reads and restore pending/errors. `&writes=accept` permits a simulated restore and reconciles subsequent fixture reads; it does not change a real Wiki or Git repository.

Native ThemeProvider synchronization requires `core:window:allow-set-theme` and `core:window:allow-set-effects` in the main/about/settings capability. `core:default` alone does not permit those calls. Browser mocks cannot validate native ACL enforcement. The provider already chooses the light/dark native effect and removes it for reduced transparency; actual native observation remains part of acceptance.

## Conversation refresh feedback

`WorkspaceStaleNotice.compact` provides an outlined, localized stale Retry button for dense action rows. Its Tooltip is attached directly to the button so keyboard focus receives the error description. The gallery includes enabled and disabled examples. The default full notice remains unchanged.

Reaction rows keep cached counts alongside this compact notice, including a cached empty read-only subject. Retry is disabled while a reaction write or refresh is pending. Conversation controls retain their subscription and lock actions with a full stale notice; their pending mutation guards remain. The provider exposes `refreshing` separately from initial `loading` and mutation `pending`.

Use `?state=stale&commands=github_get_repository_reactions,github_get_repository_conversation_controls` and invalidate the relevant queries after their first successful reads. These new states still need the browser matrix; current restricted-session CLI attempts produced no new screenshots.

## Repository actions and creation

Repository relationship controls use a repository-keyed component instance. A late Star/Watch response continues reconciling its original repository even after navigation. The Star count shows its tentative delta only while the write is pending. Retained relationship errors expose compact stale Retry without removing an open Fork dialog. Action tooltips, separators and the control surface reuse shared primitives and semantic tokens.

Create and Fork disable editable controls and dismissal during submission. Failures remain inline with the draft and reset on reopening. Repository creation uses linked template labels, a named visibility group and per-instance checkbox IDs. Optional template failures do not block repository creation; retained template options stay selected through refresh failures.

`?repoActions=external|owned|starred|ignored|fork-existing|slow-star` enables repository-action fixtures. All modes except `owned` make the first repository belong to the synthetic `harbor-community` account so Fork is available. Add `writes=accept` to simulate only Star, Watch, Fork and personal repository creation. `slow-star` delays the Star response by 1.5 seconds for navigation checks. `fork-existing` returns an existing-fork result. Query/mutation loading and errors still use the scoped `state`/`commands` parameters.

The fixture reconciles subsequent list, relationship and created-repository settings reads. DTOs returned to caches are copied; accepted writes replace canonical repository objects rather than changing previously returned objects. Reinstalling the preview starts from clean fixture data. Unknown business writes still fail locally. These fixtures do not create or modify real GitHub repositories. New action/form states still require browser and native visual acceptance.

## Conversation, reaction and Issue pin fixtures

`conversation=standard|locked|readonly|unsubscribed|unknown`, `reactions=standard|readonly|empty` and `pins=standard|pinned|limit|readonly|identity-mismatch|repository-mismatch` enable independent controlled states. Add `writes=accept` to simulate only their lock/subscription, reaction and pin operations. Scoped `state`/`commands` parameters still supply loading, failure and stale reads. Use `reactions=readonly&state=empty&commands=github_get_repository_reactions` for an initially empty read-only reaction list.

Conversation state is keyed by repository, Issue/PR kind and number; lock changes also reconcile subsequent detail reads. Reactions are keyed by repository and opaque subject identity, respect Release's supported reactions, and allow a read-only viewer to remove their own reaction. Pin fixtures preserve permission, identity and three-Issue guards. All returned state is copied before reaching caches. The shared repository fixtures also match an explicit owner, preventing a same-name fork from replacing its upstream in Issue/Wiki reads. Baseline conversation reads now use the production `conversationKind`/`conversationNumber` arguments.

These additions prepare the remaining visual action matrix; unit/interaction checks do not establish browser or native acceptance. The old unsuccessful before-capture script cannot produce before evidence from the now-modified source.

## Project field and draft actions

Project dialogs guard dismissal and editable controls while a mutation is pending. Settings, draft and field dialogs initialize their local draft when opening or changing target identity; refreshed props do not overwrite unsent input. Read-only Project permissions reach table/board/roadmap item actions, field controls and the draft reader. Draft text stays readable without a Save action. Empty choice fields show a compact explanation and do not submit absent options. Project descriptions and text field values wrap; cached item replacement preserves the existing row position.

`?projects=fields|iterations|long|empty-options|readonly|closed` enables controlled Project data. Fields include text, number (including zero), date, single/multi-select and iteration. `iterations` groups the board by iteration; `long` expands the Project title/description and draft body. `empty-options` removes select/iteration choices; `readonly` leaves field-type metadata editable while denying Project writes, matching the distinction in production data. For `closed`, choose the Closed or All Project filter.

With `writes=accept`, only the six Project command families (create/update/delete, add/update/change item) are simulated. Reads reconcile settings, field values, drafts, active/archived items and deletions; created Projects begin without items. Returned snapshots are independent, and item identities include the Project number. Unknown business writes continue to fail. These fixtures prepare visual acceptance and do not change real GitHub Projects.

## Gist editor and action recovery

The Gist editor preserves file/description drafts across refreshed props and initializes again when reopened or given a different Gist. Saving disables dismissal and all inputs; the visibility group and comment editor have accessible names. Comment creation and editing retain each other's unsent drafts. Pending comment operations disable action switching, failures appear only in the corresponding form, and delete confirmations retain pending state and reset failures when reopened.

`?gists=files|long|truncated|external|comments-disabled|readonly-comments` enables controlled Gist data. `files` adds Markdown alongside TypeScript; `long` expands descriptions, file content and comments. `truncated` disables editing incomplete content. Select the Public list for `external` and `readonly-comments`, which belong to another synthetic account; the latter also denies modification of the seeded comment.

Add `writes=accept` to simulate Gist creation, file/description edits, confirmed deletion, Star, Fork and comment creation/editing/deletion. Reads reconcile list sources, content, comment counts and revision snapshots. Previous revisions and returned DTOs remain independent. Revision line statistics are fixed synthetic values, not a computed diff. Scoped `state`/`commands` still provide waiting/failure/refresh scenarios. These fixtures do not change real Gists or verify live GitHub contracts; browser/native acceptance remains pending.

Discovery mode selection uses a named Radix radio group with shared Buttons and roving keyboard focus. The separate repository/developer content tabs retain their own query state.

## Package version recovery

Packages retain detail and version queries independently after refresh failures. An empty cached inventory also exposes `WorkspaceStaleNotice`. Delete/restore actions stay disabled through mutation reconciliation; confirmation input survives a failed submission and resets on reopening. Loading and failed detail views retain a narrow-window Back action. Version row actions respond to the detail pane width, and long package names wrap within the header.

`?packages=standard|long|permission|conflict|retry` selects the package fixtures. The default preview also uses this stateful fixture. `long` adds a dense inventory and long names/descriptions; `permission` and `conflict` reject version writes with production error codes; `retry` rejects the first mutation and accepts the next. Add `writes=accept` to simulate deletion/restoration. Scoped `state=loading|error|stale|empty&commands=...` continues to take precedence.

The fixture reads the production `versionState` argument, keeps active/deleted versions separate, and reconciles both lists and active version counts after accepted writes. Ecosystems and package names scope records; expected package ID, version ID/name and source state guard mutations. Returned DTOs are copied. These simulations do not modify real GitHub Packages or establish live API/native acceptance.


## Startup window and manual navigation — 2026-09-07

The main window starts at 1200 × 760 logical units, centered in the current monitor work area. `src-tauri/src/window_layout.rs` applies display scaling and only reduces dimensions when necessary to preserve a 16-unit work-area margin. The 900 × 620 minimum is lowered only when the available display is smaller. Window resizing/maximizing remains available; this change does not persist window geometry.

Primary navigation starts expanded (226 px). The titlebar sidebar button beside the Repolane Logo and wordmark collapses it to the existing 58 px icon rail. `harbor-navigation-expanded` stores the user's choice; missing/unavailable storage defaults to expanded and storage failures do not block the control. Resizing never overrides the choice. Content panes retain their existing `workspace-wide` breakpoint.

`NavigationButton.expanded` supplies explicit label/tooltip presentation to primary, More, account and settings rows. Callers without that prop retain the existing responsive behavior; separate Settings windows retain `alwaysExpanded`. The title-bar toggle has translated action labels, `aria-expanded`, `aria-controls`, keyboard focus and a tooltip. The toggle remains outside the controlled navigation so it is always reachable. The 2026-09-08 branding update separates the neutral PanelLeft toggle from the Lane D mark and Repolane wordmark. Double-clicks on the toggle remain isolated from native maximize. The two permanently disabled history arrows are removed. See [Lane identity evidence](verification/repolane-lane/README.md).


## Outer window edge — 2026-09-07

`--harbor-window-radius: 10px` now supplies WindowFrame and TitleBar corner rounding, matching the existing native effect radius. The outer window keeps its single semantic 1 px border; `.harbor-window` has no CSS shadow or inset highlight. Native window shadows remain enabled. In-page overlays keep their own material, and window fill/blur values are unchanged. Maximized windows retain their existing square, borderless treatment.

## Issue action previews

`?issues=standard&writes=accept` enables isolated Issue lifecycle, comment, clone, duplicate and transfer fixtures. Mutations reconcile subsequent detail reads; unknown writes and missing write opt-in remain rejected. `issues=readonly` disables authoritative lifecycle/comment permissions, and `issues=closed` seeds closed details. `issues=candidate-loading|candidate-error|candidate-duplicate` affects the original-Issue candidate numbered 2 without blocking the current Issue numbered 1. Transfer checks resolve the exact source and destination repositories from their production `input` arguments.

Scope `state=loading|error|stale&commands=<command>` to a read or mutation for recovery checks. An empty assignee query now returns an empty list. These fixtures do not establish GitHub API behavior or native picker/transfer behavior. Current acceptance evidence is in [UI_VERIFICATION.md](UI_VERIFICATION.md).

Issue detail cache writes use `githubQueryKeys.issueTimelineRoot`; broader `issueRoot` invalidation still refreshes related data. Do not write timeline-shaped data to the broader prefix, which also contains relationship, dependency and linked-branch records.

## Nested Discussion preview

Use `?discussions=nested|more|closed|readonly&writes=accept` for stateful nested replies. `more` exposes the existing GitHub fallback for incomplete replies; `closed` closes and locks discussions (select All states to open one); `readonly` removes edit/moderation/vote permissions. Combine `state` and `commands` with named Discussion commands for pending/error/stale reads or writes. Reads return isolated snapshots; unknown writes never fall through to GitHub.

Comment writes share `discussionCommentWriteKey(target)` so a parent cannot be deleted while a nested editor is saving. Keep this key scoped to the actual repository and discussion. The Discussion ScrollArea uses `constrainContentWidth`; repository header actions stack based on detail-pane width.
