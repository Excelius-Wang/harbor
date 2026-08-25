# Harbor Workspace UI Specification

## Product intent

Harbor is a focused GitHub desktop workspace for people who move between pull requests,
repositories, discovery, and lightweight agent assistance throughout the day. The interface
should feel fast, calm, information-dense, and unmistakably desktop-first.

## Design direction

- Learn from Linear's hierarchy, Raycast's command ergonomics, Arc's spatial navigation, and
  Zed's dense developer surfaces without copying any product's branding or source code.
- Use a deep-sea palette with one cyan action color. Purple is reserved for source data such as
  language colors, never as a generic AI accent.
- Apply glass only to application chrome: title bar, navigation sidebar, Harbor Rail, command
  palette, and agent sheet. Repository content remains high-opacity for legibility.
- Prefer flat surfaces, hairline borders, and restrained corner radii. Avoid stacked card grids,
  decorative gradients, and ambient glow effects.
- Default to dark mode while retaining the existing light and system theme settings.

## Workspace anatomy

1. **Title bar (48 px)**: Harbor mark, history controls, command trigger, sync state, account menu,
   and native window controls.
2. **Primary navigation (216 px)**: Pull Requests, Repositories, Discover, pinned repositories,
   Account, and Settings.
3. **Collection pane (min 420 px)**: section tabs, filters, and a keyboard-navigable repository
   list.
4. **Detail pane (min 360 px)**: repository summary, topics, language distribution, and recent
   activity.
5. **Harbor Rail (48 px)**: stable shortcuts for Overview, Checks, Comments, and Ask Harbor. The
   agent opens as an overlay sheet rather than permanently shrinking the workspace.

Below 1040 px, the detail pane is hidden and opened from the repository row. Below 760 px, the
primary navigation collapses to icons. The Tauri window should use 1280 x 800 as its initial size
and enforce a usable minimum size.

## Interaction model

- `Cmd/Ctrl + K` opens the command palette.
- Arrow keys move repository selection when the list owns focus.
- `Enter` previews the selected repository; `Cmd/Ctrl + Enter` opens it on GitHub.
- `Esc` closes the topmost command palette or Harbor sheet.
- Hover and selection transitions last 120–180 ms and are disabled under reduced motion.
- Every icon-only control has an accessible label and Tooltip.
- Focus rings remain visible on keyboard interaction.

## Initial data and integration seam

The first shell uses deterministic mock data behind repository-shaped TypeScript types. GitHub
network access will later replace this source through a small client interface without reshaping
the UI components. External repository links use Tauri's opener plugin in the desktop runtime and
normal browser navigation during web preview.

## Reuse and licensing

- Reuse shadcn/ui primitives and their Radix/cmdk foundations under their permissive licenses.
- Use Tauri's existing window and opener APIs instead of adding a parallel desktop abstraction.
- GitHub Desktop may inform workflow organization because its source is MIT licensed, but Harbor
  does not copy its trademarks or product assets.
- Linear, Raycast, Arc, and Zed remain visual references only. Do not copy proprietary assets, and
  do not import GPL code into Harbor.

## Acceptance criteria for the shell

- The template greeting page is replaced by a responsive Discover workspace.
- Navigation, filtering, repository selection, the command palette, account menu, and Harbor
  sheet have working local interactions.
- English and Simplified Chinese labels are available through i18next.
- Existing theme, language, settings/about windows, tray menu, shortcut registration, and updater
  behavior remain reachable.
- `pnpm check` and the Tauri Rust check pass.
