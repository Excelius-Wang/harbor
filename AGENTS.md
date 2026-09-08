# AGENTS.md - Harbor

## Project identity

Harbor is a focused GitHub desktop workspace. It combines native GitHub workflows, selected
web fallbacks, discovery, and an optional agent sidebar.

## Stack

- Tauri 2 and Rust
- React and TypeScript
- Vite, Tailwind CSS, and shadcn/ui
- English and Simplified Chinese through i18next

## Commands

```bash
pnpm install
pnpm tauri:dev
pnpm check
cargo check --manifest-path src-tauri/Cargo.toml
```

## Working principles

- Keep product Modules behind small Interfaces: GitHub client, credential store, local cache,
  and agent runtime.
- Prefer the smallest correct implementation and verify it with focused tests.
- Do not copy GPL code into this repository.
- Keep source comments and identifiers in English.
- Do not commit generated build output or credentials.

## Branch workflow

- Use a dedicated branch for each independent change; do not develop directly on `main`.
- After an authorized PR merge, verify GitHub reports the PR as merged and confirm the branch's
  final changes are included in the merge result. Then sync local `main` and automatically
  delete that PR's remote and local branches. No additional deletion confirmation is needed.
- Preserve unrelated branches, worktrees and uncommitted changes. Do not delete a branch with
  unmerged follow-up commits or one still needed by another worktree; report the exception.
- For squash merges, verify the PR head and merge result instead of relying only on Git ancestry.
- Branch creation and cleanup do not independently authorize creating or merging a PR; follow
  the user's instructions for external writes and merges.

## App design language

Harbor is a compact desktop workspace with cool blue-gray translucent glass, soft edge
highlights, restrained color, and readable controls. Preserve its task density and navigation
when applying design skills. Oversized heroes, decorative gradients, animated showcases, and
equal card grids do not belong in app workflows.

### Source of truth

- For UI work, read [the UI design guide](docs/UI_DESIGN_GUIDE.md) and open the relevant selected
  images in [the reference directory](docs/design/references/README.md). The
  [reference and color board](docs/design/reference-board.html) provides a visual companion.
- The selected reference roles are fixed: [sidebar image 4](docs/design/references/sidebar-04.webp)
  for navigation structure, Harbor's cool blue-gray for color, and
  [LeonAnd](docs/design/references/leonand-workspace.webp) for whole-page surface hierarchy.
  Vorssaint remains a glass/color reference. Do not mix other sidebar examples into the design
  or import a reference image's black, purple, or warm accent palette.
- The guide defines the user-selected visual direction. Its numerical palettes, opacity,
  blur, and radius values are candidates for validation, not shipped tokens or measured
  reference values. The light palette was extrapolated from Vorssaint's dark images;
  LeonAnd adds a light surface reference without establishing exact color values.
- Read `src/index.css` for implemented tokens and shared `harbor-*` classes. Use
  `src/features/workspace/harbor-workspace.tsx`, `github-discovery-view.tsx`, and nearby feature
  views for existing layout and behavior. Preserve that behavior while changing appearance.
- `docs/UI_SPEC.md`, `docs/UI_REFERENCE_RESEARCH.md`, and older screenshots provide historical
  context. The new guide takes precedence for visual direction; current code establishes
  implemented behavior. Do not treat a current flat or dark surface as the target merely
  because it already exists.
- The development-only gallery at `/ui-components` renders production components. Use
  `pnpm dev:ui --port 1423` for controlled discovery fixtures; see `docs/UI_COMPONENTS.md`.
  Shared primitives supply Harbor controls and overlay material by default. Do not add opaque
  feature fills to menus/dialogs or bypass the preview's business-call interception for QA.
- Reuse the local shadcn/ui components in `src/components/ui`, Radix behavior, and Lucide icons.
  Keep one component system and icon family. Do not replace global primitives for a local feature.

### Color and surfaces

- Use semantic tokens (`background`, `foreground`, `card-foreground`, `muted-foreground`,
  `primary`, `border`, `ring`) instead of choosing colors per page. The target palette uses
  cool charcoal with a blue undertone in dark mode and cool white/blue-gray in light mode.
  Keep bright blue accents localized. Validate candidate colors in context before adopting
  them as shared tokens; do not paste guide hex values into individual feature components.
- Reserve `success`, `destructive`, `merged`, and `attention` for real GitHub states. Repository
  language colors come from data. Primary blue identifies links and actions.
- Let background color and broad light variation contribute to glass while keeping text
  stable and readable. A uniformly dark gray panel with blur applied is insufficient.
- Keep one continuous material family across the window and overlays. Inside
  `harbor-workspace-shell`, use transparent panes and optional subtle group fills; groups
  normally need no additional blur. Do not turn every row into a glass card or stack opaque
  fills, heavy shadows, and multiple blur layers. Reading and code surfaces may use a more
  stable fill when necessary for legibility.
- Reuse `harbor-subtle-divider` and `harbor-result-row` for separators and hover behavior.
  Use `harbor-popover`, `harbor-command`, and `harbor-sheet` for elevated surfaces.
- Navigation selection, row height, spacing, and collapsed presentation belong to shared
  workspace navigation. New pages reuse that navigation; do not override selected fills or
  row height per feature. Sidebar image 4 guides the structure, not its exact color values.
  Blue selected fills in the candidate palette are for explicitly accented controls and are
  not the default for all navigation. Secondary tabs retain their line structure. Keep hover,
  selection, and keyboard focus distinguishable.

### Type, spacing, and layout

- Keep the system font stack in `src/index.css` (SF Pro on macOS). Use monospace for code,
  identifiers, and shortcuts. Do not add a display font to a feature page.
- Use a 24 px semibold page title, 13–14 px primary row text, and 11–12 px secondary metadata.
  Long descriptions should wrap naturally; reserve truncation for compact names and identifiers.
- Follow the 4 px spacing rhythm: 16–24 px content padding and 12–16 px row gaps. Keep compact
  controls at 6–8 px corners. Larger groups and overlays can use the guide's candidate radii
  when redesigned together; respect native window clipping. Avatars remain round.
- Searchable filter menus use `harbor-filter-trigger` and `harbor-filter-menu`: 13 px regular
  text, compact 28 px rows, a quiet scrollbar, and a single down chevron. Keep the inner Command
  transparent so the shared `harbor-popover` surface stays visible; avoid stacking opaque fills.
- Keep the shared title bar and primary navigation. The navigation starts expanded at 226 px and can be
  collapsed to a 58 px icon rail by clicking the title-bar sidebar button beside the product
  Logo and wordmark; persist the user’s choice. The Lane D brand mark remains visible.
  The `workspace-wide` (80rem) breakpoint still controls content layouts; the optional context rail is 52 px. Do not create a second
  page-level sidebar for filters that fit in a toolbar.
- Current primary navigation lives in `PrimaryNavigation` within
  `src/features/workspace/harbor-workspace.tsx`. Its main destinations, More trigger, account,
  and settings reuse `NavigationButton` from `src/features/workspace/navigation-button.tsx`.
  This shared control owns the 40 px row, icon/label layout, collapsed tooltip and keyboard
  focus. Selection and hover use `harbor-nav-item` in `src/index.css`. New pages inherit the
  shell; do not copy rows or override row dimensions/states in consumers.
- Reuse `WorkspacePageHeader` for list headers and `WorkspaceStaleNotice` for retained
  results after a failed refresh. For list/detail swaps, keep `useListScroll` in the parent,
  key it by the actual query parameters, and spread its viewport bindings onto ScrollArea.
  This preserves pane scroll without changing query keys or persisting state globally.
- Discovery uses a centered 1120 px maximum content width. Other workspaces may fill their pane.
  Page header, filters, and scrollable content should share alignment.
- Developer discovery rows keep the author, popular repository, and description in one vertical
  group at every width. Place the account beside the name when space allows; wrap it below when
  needed. Keep the avatar in a compact leading column and descriptions within a readable line
  length. Do not split related identity and project content into distant proportional columns.
- Preserve `min-w-0`, `min-h-0`, and pane-local `ScrollArea` containment. At the 900 px minimum
  app width, secondary row content stacks below the primary identity; text must not stretch the
  window or hide controls. Use the shared 1200 × 760 logical startup size with work-area clamping; do not resize the window from feature views.

### Interaction and verification

- Keep related content behind tabs with independent query keys. Returning from a detail view
  should retain the relevant filters and cached results. Source labels must describe the actual
  data; never present a search approximation as an official ranking.
- Keep actions keyboard accessible. Use native buttons/links and Radix tab, select, and overlay
  behavior. Icon-only actions need an accessible name and tooltip; avatars need a fallback.
- Provide layout-matching skeletons, useful empty states, retryable errors, and explicit GitHub
  Web links where appropriate. A failed refresh must visibly mark retained results as stale.
- Keep motion short and limited to feedback (roughly 120–180 ms). Honor reduced motion and
  reduced transparency; avoid perpetual decorative animation.
- Add English and Simplified Chinese strings together through i18next. Use plain functional
  copy; keep implementation details out of normal product flows.
- Verify new UI in both themes at the minimum app width and a wide desktop size. Exercise
  keyboard navigation, loading/error states, and list-to-detail return behavior.
- For material or palette changes, compare before/after views over cool, neutral, and bright
  detailed backgrounds. Check text, status colors, selected controls, and overlay continuity.
  Browser previews verify page layout and in-page layers; desktop-background translucency
  also requires observing the Tauri window. Check reduced-transparency fallbacks. Keep
  third-party reference images in documentation, outside shipped application assets.

<!-- cairn:begin -->

## Cairn

When root `CAIRN.md` exists, follow the `cairn` skill when available; otherwise follow this
block. Read the root before task work. When it declares workspace mode, read only the item
named under `Current item`; do not load other items or `.cairn/archive/` unless the request
explicitly requires them.

Verify the selected checkpoint against its working area and authoritative records before
acting. In Git-backed work, inspect the relevant working tree. A checkpoint stored beside a
different repository or external system does not prove that external state is current.

Before ending a turn with authorized edits, update the selected checkpoint only when
recovery-critical information changed. Keep `Goal`, `Current state`, exactly one `Next action`,
and `Verification` current. Keep one independently resumable outcome per checkpoint; separate
unrelated work instead of carrying it forward as history.

Follow user and workspace authorization for commits and external writes. After verification
passes, set `Next action` to `None — complete`. Keep a completed inline checkpoint until new
work begins; in workspace mode, move the completed item to `.cairn/archive/` and update the
root pointer.

<!-- cairn:end -->
