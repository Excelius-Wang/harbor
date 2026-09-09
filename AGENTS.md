# AGENTS.md - Repolane (Harbor repository)

## Project identity

Repolane is a focused GitHub desktop workspace with native GitHub workflows, selected
web fallbacks, discovery, and an optional agent sidebar. The repository name, paths,
and stable technical identifiers remain Harbor; do not rename them as part of UI branding.

Stack: Tauri 2 / Rust, React / TypeScript, Vite, Tailwind CSS, shadcn/ui, and i18next
for English and Simplified Chinese.

## Commands

```bash
pnpm install
pnpm tauri:dev
pnpm dev:ui --port 1423
pnpm check
cargo check --manifest-path src-tauri/Cargo.toml
```

## Working principles

- Keep GitHub client, credential store, local cache, and agent runtime behind small interfaces.
- Prefer the smallest correct implementation. Preserve user capabilities and intended workflows;
  fix faulty behavior and improve interaction when relevant to the task, with regression evidence.
- Keep source comments and identifiers in English. Add English and Simplified Chinese UI strings
  together through i18next; use plain functional copy without implementation details.
- Do not copy GPL code, commit generated build output, or commit credentials.
- Preserve unrelated branches, worktrees, and uncommitted changes.

## Execution and branch workflow

- Within an authorized multi-batch task or active Goal, finish one batch and continue to the next
  without asking whether to proceed. Make routine implementation choices independently.
  This rule does not start a Goal or authorize unrelated work.
- Define a batch as an independently reviewable and verifiable outcome. Use a dedicated branch
  for each independent batch; do not develop directly on `main`. Keep its implementation,
  tests, and review fixes on that branch rather than creating a branch per small fix.
- Include directly related defects needed to complete the outcome. Record unrelated features
  and aesthetic exploration as follow-up suggestions rather than expanding the task.
- Follow the current session's authorization for commits, pushes, PRs, reviews, merges, and
  releases. Do not request authorization already provided. Branch creation and cleanup do not
  independently authorize external writes or merges.
- When a tool or verification path fails, inspect the failure and try a justified alternative.
  Record unresolved blockers and continue independent work. Do not repeat an unchanged failed
  route without new evidence, or claim completion while required verification is blocked.
- After an authorized PR merge, verify GitHub reports MERGED and the final PR changes are included
  in the merge result. For squash merges, check the PR head and merge result rather than Git
  ancestry alone. Then sync local `main` and delete that PR's remote and local branches without
  another confirmation. Preserve branches with unmerged follow-up commits or needed by another
  worktree, and report those exceptions.

## UI authority and entry points

- Read [the UI design guide](docs/UI_DESIGN_GUIDE.md) for UI work, including its implementation
  layout contracts. It owns detailed typography, spacing, dimensions, and page layout rules.
  [The component guide](docs/UI_COMPONENTS.md) documents production primitives and preview usage.
- On the first visual task in a session, and when revisiting visual direction, open the relevant
  selected images from [the reference directory](docs/design/references/README.md).
  [The reference board](docs/design/reference-board.html) is a companion. If local originals are
  missing, report that limitation and continue work that does not depend on them; do not invent
  reference observations or substitute a different design direction.
- Reference roles remain fixed: sidebar image 4 for navigation structure, Harbor cool blue-gray
  for color, LeonAnd for whole-page surface hierarchy, and Vorssaint for glass/color reference.
  Do not import black, purple, or warm accent palettes or mix other sidebar examples.
- Guide palette, opacity, blur, and radius candidates require validation; they are not measured
  reference values or automatically shipped tokens. The light palette was extrapolated from
  dark Vorssaint images; LeonAnd adds surface hierarchy, not exact color values.
- Read `src/index.css` for implemented tokens and `harbor-*` classes, and
  `src/features/workspace/harbor-workspace.tsx`, `github-discovery-view.tsx`, and relevant feature
  code for behavior. `docs/UI_SPEC.md`, `docs/UI_REFERENCE_RESEARCH.md`, and old screenshots are
  historical context; the design guide takes precedence for visual direction.
- Keep progress and acceptance evidence in `docs/UI_MIGRATION_CHECKLIST.md`,
  `docs/UI_VERIFICATION.md`, and the selected Cairn checkpoint, not in these standing rules.

## UI invariants

- Preserve the compact desktop workspace: cool blue-gray translucent glass, soft edge highlights,
  restrained color, readable controls, and task density. No oversized heroes, decorative
  gradients, perpetual animation, or equal card grids in app workflows.
- Reuse local shadcn/ui components, Radix behavior, and Lucide icons. Do not replace global
  primitives for a local feature. Use semantic tokens rather than per-page colors. Reserve
  success, destructive, merged, and attention for real GitHub states; language colors come
  from data. Keep primary blue localized to links and actions.
- Keep one continuous material family across window and overlays. In `harbor-workspace-shell`,
  use transparent panes and subtle group fills without repeated blur, opaque layers, or heavy
  shadows. Reading and code surfaces may use stable fills for legibility. Background variation
  should contribute to glass while text remains stable; uniform dark gray plus blur is insufficient.
- Reuse `harbor-subtle-divider`, `harbor-result-row`, `harbor-popover`, `harbor-command`, and
  `harbor-sheet`. Searchable filters use `harbor-filter-trigger` and `harbor-filter-menu`, with a
  transparent inner Command so the shared popover supplies the material.
- Preserve shared title bar and navigation. `PrimaryNavigation` and `NavigationButton` own
  navigation rows, collapsed behavior, tooltips, and focus; `harbor-nav-item` owns selection
  and hover. Change shared navigation consistently, never through per-feature overrides.
  Secondary tabs retain their line structure. Keep hover, selection, and focus distinguishable.
- Use the existing system font stack. Preserve `min-w-0`, `min-h-0`, pane-local ScrollArea,
  and the shared window sizing policy. Feature views must not resize the window.
- Reuse `WorkspacePageHeader`, `WorkspaceStaleNotice`, and parent-owned `useListScroll` keyed
  by actual query parameters, with its viewport bindings on ScrollArea. Retain filters, cached
  results, and relevant scroll on detail return; keep tabs' query keys independent.
- Use native buttons/links and Radix interaction patterns. Icon-only actions need accessible
  names and tooltips; avatars need fallbacks. Provide matching skeletons, useful empty states,
  retryable errors, visibly stale retained results, and appropriate GitHub Web links. Source
  labels must describe actual data, never a search approximation as an official ranking.
- Limit motion to short feedback (roughly 120–180 ms); honor reduced motion and transparency.
- Use `/ui-components` with controlled fixtures for browser QA. Preserve business-call
  interception; preview writes must not reach real GitHub data. Keep third-party reference
  images in documentation/local reference caches, outside shipped assets.

## Verification by impact

- During development, run focused checks for affected behavior. At each code delivery boundary,
  run `pnpm check`; when Rust/native code changes, run cargo check and relevant native tests.
  Documentation-only edits need link/content and applicable formatting checks, not app builds.
- For local UI changes, inspect affected views in both themes, English/Chinese, at 900 px and
  a wide desktop size. Exercise applicable keyboard, loading, empty, error, stale, pending,
  disabled, selected, and list/detail-return states, including long text and dense content.
- For shared controls/layout changes, extend coverage to representative consumers and overlays.
  Reuse prior evidence only for unchanged, unaffected behavior; name its scope explicitly.
- For material/palette changes, compare same-content before/after views over cool, neutral,
  and bright detailed backgrounds. Check text, status colors, selected controls, overlay
  continuity, and reduced-transparency fallbacks. Observe the Tauri window for desktop-background
  translucency; browser previews establish only page layout and in-page layers.
- A final full-site acceptance claim requires all applicable migration gates. Distinguish
  implemented, verified, and blocked states; tests or source inspection do not establish visual
  acceptance, and historical screenshots do not verify newly changed states.
- Once relevant checks pass, repeat or broaden them only for new changes, failures, or unresolved
  concerns. Record concrete evidence and any existing non-blocking warnings without treating
  unrelated warnings as new failures.

<!-- cairn:begin -->

## Cairn

When root `CAIRN.md` exists, follow the `cairn` skill when available; otherwise follow this
block. Read the root before task work. For a generic resume in workspace mode, read only the
item named under `Current item`. When the user explicitly names different work, match stable
filenames and authoritative records, read only the relevant item, verify it, and select it
when edits are authorized. An empty current pointer does not prevent selecting that work.
Inspect `.cairn/archive/` only for an explicit historical/completed-work request. Do not scan
unrelated items or archives for routine startup.

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
