# Frosted acrylic workspace

## Goal

Translate the supplied references' design language into Harbor's GitHub workspace with the outer
window as the only gray frosted-acrylic plane. Keep the title bar, navigation, and foreground
content transparent, use a precise small-radius system, and keep Discovery single-column. Present
repository identity and metadata with a clear GitHub Trending-like hierarchy, and use macOS-style
window controls. Do not add directional light beams, spotlights, ambient glows, or decorative
background gradients.

## Current state

The completed implementation is committed as `63f5b30` on branch
`feat/github-trending-20260905` and pushed to PR #81 at
`https://github.com/Excelius-Wang/harbor/pull/81`. The PR targets
`feat/glass-workspace-20260904`, is open and mergeable, and CodeRabbit reports success for the new
head commit.

The outer window is the only material surface. The dark theme uses a neutral gray fill at 84% with
32px backdrop blur; the title bar, navigation, workspace, and Discovery content remain transparent.
The previous inset workspace and Discovery frames were removed. Discovery stays single-column and
opens repository details only after explicit selection.

Repository results omit large owner avatars and update timestamps. Owner and repository name share
one 14px sans line; descriptions use a solid readable foreground. Language appears in a 4px
colored-acrylic label with 28% language-color fill, high-contrast text, a tinted border, and fine
inner highlights. Language, cumulative Star, and fork metadata share a 20px height and 11px type
rhythm. Weekly-star data is intentionally not shown. Pull-request and issue rows use semantic open,
merged, closed, and draft colors.

The shared custom title bar now uses macOS-style controls on the left in close, minimize, maximize
order. Each control has a 12px visual dot within a 20px target. Control glyphs appear when the group
is hovered or focused, maximized windows switch to the restore glyph, and the existing Tauri close,
minimize, and toggle-maximize calls remain unchanged. Right-side window controls were removed.

Representative renders are stored as ignored QA artifacts at
`output/playwright/harbor-color-acrylic-language-tags-light-backdrop.png`,
`output/playwright/harbor-macos-titlebar.png`, and
`output/playwright/harbor-macos-titlebar-hover.png`.

## Next action

None — complete

## Verification

`pnpm check` passes formatting, ESLint, 98 frontend test files with 446 tests, TypeScript, and the
production Vite build. `cargo check --manifest-path src-tauri/Cargo.toml` and `git diff --check`
pass. Title-bar interaction tests verify macOS control order, Tauri action wiring, restore state,
and hidden controls. Playwright verifies the default and hovered title-bar states without shifting
the centered search control. Against a simulated bright desktop, calculated language-label contrast
is 8.23:1 for TypeScript, 8.41:1 for Python, and 5.16:1 for JavaScript.

Success: PR #81 contains the verified single-plane acrylic workspace, coordinated GitHub metadata,
colored-acrylic language labels, semantic issue and pull-request states, and functional macOS-style
window controls.
