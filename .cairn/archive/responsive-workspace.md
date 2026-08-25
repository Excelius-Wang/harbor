# Responsive workspace

## Goal

Keep Harbor's repository workspace fully visible and independently scrollable from its 1280px
default size down to the supported 900px Tauri minimum.

## Current state

Harbor uses a 216px full navigation at the named `workspace-wide` breakpoint and a 54px accessible
Harbor Dock below it. The repository list narrows progressively, source lines keep their own
horizontal scroll, and long repository Code and Issues content is now bounded by a flexing
TabsContent so the existing Radix ScrollArea owns vertical scrolling. Repository metadata and tabs
remain fixed while the selected repository content scrolls.

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
ignored. A deterministic Playwright fixture with 20 entries, eight commits, and a 30-section README
confirms real wheel scrolling at 1280x800 and 2048x1128. At 1280x800 the repository viewport is 542px
tall with 4,382px of content and reaches its 3,840px maximum scroll position; the last README section
is visible. At 2048x1128 wheel input moves the same bounded viewport while the tab bar stays at
220.5px and the document root remains unscrolled. Visual checks pass at both sizes.

## Decisions

- Preserve Harbor's cool glass visual system; this is a scroll-ownership correction, not a redesign.
- Use the existing Radix ScrollArea and local flex contracts rather than adding a layout dependency.
- Verify responsive work with content longer and wider than the viewport.
