# Frosted glass workspace

## Goal

Create a reviewable macOS-first frosted-glass version of Harbor that includes the code and content
areas, reuses the existing theme and shadcn/Tauri infrastructure, preserves information architecture
and interaction behavior, and remains readable with reduced-transparency and light-theme fallbacks.

## Current state

Branch `feat/glass-workspace-20260904` is based on the adaptive-window PR branch. Harbor already has
transparent Tauri windows and semantic glass utilities. The implementation now uses Tauri's native
macOS `underWindowBackground` material for main and child windows, synchronizes the native material
with Harbor's resolved theme, and makes the shared `WindowFrame` glass by default. Existing
`harbor-glass`, popover, command, and sheet utilities now share calibrated translucent tokens, while
the new `harbor-content` surface gives code and content areas a deeper tint for readability. Major
GitHub views and Settings use these shared surfaces without changing information architecture,
components, icon family, copy, or behavior.

## Next action

Commit and push the verified implementation, then open a stacked pull request for review.

## Verification

`pnpm check` passes 94 frontend files and 430 tests plus the production build. `cargo check
--manifest-path src-tauri/Cargo.toml` passes. Focused glass, theme synchronization, and Discovery
tests pass 3/3. The macOS runtime was reviewed over both dark and light desktop content at the
adaptive default size, and the browser-rendered light theme was reviewed separately.

Success: the desktop background reads through every major workspace region without compromising
text, list, focus, or light-theme readability; code and diff surfaces inherit the same deeper
content material, and reduced transparency falls back to the solid semantic background.
