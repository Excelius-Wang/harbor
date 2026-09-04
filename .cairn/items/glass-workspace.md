# Frosted acrylic workspace

## Goal

Keep Harbor's existing cold dark-blue palette while translating the supplied references' design
language into the GitHub workspace: an inset floating shell, continuous acrylic planes, compact
high-contrast selection states, restrained separators, softer spacing, and clear material depth.
Use a precise small-radius system instead of large curves or capsules. Preserve the focused
navigation, and keep Discovery's primary content single-column at every width; repository details
open only after explicit selection. Do not add directional light beams, spotlights, ambient glows,
or decorative background gradients.

## Current state

Work continues in the uncommitted working tree on branch `feat/github-trending-20260905`. The first
iteration already reduced navigation choices, separated GitHub search from the command field, added
a responsive repository master-detail layout, and made the repository rail contextual. Visual
review showed that its small-radius, outlined, edge-to-edge dark panels still read as a conventional
developer tool rather than the supplied rounded acrylic design language.

The current pass keeps the cold dark-blue palette and uses the approved small-radius system. The
window frame is 12px; the inset workspace shell and continuous Discovery surface are 10px;
navigation, selection states, fields, buttons, rows, avatars, and metric groups are 8px; segmented
tab triggers use 6px. Full circles remain only for identity imagery and rare icon-only controls.

Discovery is now single-column at every width. The repository preview component, media-query hook,
preview state, selected-row semantics, preview translations, and wide grid branch were removed.
Selecting a repository opens the existing full detail view and only then supplies repository context
to the Harbor rail. The content and header are constrained to 1120px for readable line length.

The workspace shell now owns the only tint and backdrop blur inside the inset workspace. Primary
navigation, page content, and the contextual rail sit directly on that acrylic plane without their
own fill or backdrop filter. The inner Discovery surface uses the same dark-glass RGB value at 8%
opacity with a fine edge and inner highlight; it no longer adds another blur or contact shadow.
High-contrast selection and restrained separators preserve hierarchy. No decorative background
gradient or directional light is present.

Representative renders are stored as ignored QA artifacts at
`output/playwright/harbor-acrylic-unified-plane.png` and
`output/playwright/harbor-acrylic-unified-plane-material-test.png`; the second uses an injected
two-tone test backdrop and confirms continuous material participation across navigation and content.

## Next action

Collect user visual feedback on the unified acrylic-plane render before further tuning.

## Verification

`pnpm check` passes formatting, ESLint, 97 frontend test files with 441 tests, TypeScript, and the
production Vite build. `cargo check --manifest-path src-tauri/Cargo.toml` and `git diff --check` pass.
The repository-selection test verifies that no preview appears before selection and that selection
opens full detail while providing repository context. New workspace tests verify that the primary
navigation and contextual rail use the transparent pane contract instead of independent glass.
Playwright computed styles confirm that the workspace shell alone has a 38px backdrop blur while the
navigation and content are transparent with no filter; the material stress backdrop stays continuous
across both regions.

Success: the existing color identity remains recognizable, and the workspace now renders as one
continuous acrylic plane without the previous blue-black center patch.
