# Responsive workspace

## Goal

Make Harbor's workspace adapt cleanly from its 1280px default width down to the supported 900px
Tauri minimum without clipping repository code, file actions, navigation, or the title bar.

## Current state

Harbor uses a 216px full navigation at the named `workspace-wide` breakpoint and a 54px accessible
Harbor Dock below it. The repository list is 320px at 1280px, 280px from 1180px, and 240px in
compact mode. The GitHub code ScrollArea exposes a scoped `constrainContentWidth` contract so its
Radix content wrapper shrinks to the available workspace instead of being clipped. Playwright
reports zero outer clipping and no offscreen buttons at 1280x800, 1100x700, and 900x620; source
lines keep their own horizontal scroll. Dark and light visual checks pass, and Discover still opens
repository detail in a Sheet at 900px. Dock controls retain accessible names and compact tooltips.

## Next action

None — complete.

## Verification

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

All checks pass: 13 frontend tests pass; 33 Rust tests pass and one external DeepWiki test remains
ignored. Playwright confirms the width matrix, dark and light source views, visible file actions,
internal source scrolling, compact navigation accessibility, and Discover's compact detail Sheet.
Both standards and specification reviews pass after isolating the Radix selector behind a semantic
ScrollArea prop and naming the shared Tailwind breakpoint.

## Decisions

- Preserve Harbor's existing cool glass palette, typography, information architecture, and 900px
  native minimum.
- Use two native desktop states: full navigation at 1180px and above, Harbor Dock below 1180px.
- Keep repository context visible at the native minimum with a 240px compact list.
- Use existing Tailwind, shadcn/ui, and Radix primitives; add no layout dependency.
