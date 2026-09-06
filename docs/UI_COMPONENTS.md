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
