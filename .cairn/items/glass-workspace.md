# Frosted glass workspace

## Goal

Create a reviewable macOS-first frosted-glass version of Harbor that includes the code and content
areas, reuses the existing theme and shadcn/Tauri infrastructure, preserves information architecture
and interaction behavior, and remains readable with reduced-transparency and light-theme fallbacks.

## Current state

The glass workspace and follow-up fixes are committed through `4f24d5b` on branch
`feat/glass-workspace-20260904`. Stacked PR #80 targets the
adaptive-window branch at `https://github.com/Excelius-Wang/harbor/pull/80`. The implementation uses
Tauri's native macOS `underWindowBackground` material for main and child windows, synchronizes the
native material with Harbor's resolved theme, and makes the shared `WindowFrame` glass by default. Existing
`harbor-glass`, popover, command, and sheet utilities now share calibrated translucent tokens, while
the new `harbor-content` surface gives code and content areas a deeper tint for readability. Major
GitHub views and Settings use these shared surfaces without changing information architecture,
components, icon family, copy, or behavior.

The first pass looked too light over white desktop content. Reproducing it against the same white
browser background showed that `underWindowBackground` was only a secondary factor: the main lift
came from compositing the original blue-gray dark tokens over a bright source. Dark mode now reapplies
the native `hudWindow` effect after theme resolution and uses smoke-black window, chrome, content,
and overlay tokens. The window and pane layers previously composed to roughly 92% opacity, which
made the native material look solid; the current deep-color/lower-alpha calibration composes the
content surface to roughly 80% so the material reads again without returning to the washed-out first
pass. Light mode is unchanged.

The primary-navigation separator is also contained within the sidebar. Its shadcn base class applies
an orientation-scoped `w-full`, so the earlier plain `w-auto` did not win and its horizontal margins
made the line cross the sidebar border. The call site now overrides width in the same orientation
variant, preserving the shared Separator component and both compact and expanded layouts.

## Next action

Review PR #80 and collect final visual feedback on the balanced dark glass calibration.

## Verification

`pnpm check` passes 95 frontend files and 431 tests plus the production build. `cargo check
--manifest-path src-tauri/Cargo.toml` passes. Focused glass, theme synchronization, and Discovery
tests pass 3/3. The macOS runtime was reviewed over both dark and light desktop content at the
adaptive default size, and the browser-rendered light theme was reviewed separately. The too-light
dark-mode reproduction was rerun against the same white desktop background after the correction;
the content now stays deep gray while retaining the native frosted material. A high-contrast gradient
backdrop stress test confirms distinct translucent title, navigation, content, and rail layers after
the final alpha correction. The native-effect test
failed before the correction and passes afterward. The sidebar-separator regression test also failed
before its fix and passes afterward. Browser layout measurements confirm that the separator ends at
204px inside the expanded sidebar's 217px right edge and at 46px inside the compact sidebar's 55px
right edge.

Success: the desktop background reads through every major workspace region without compromising
text, list, focus, or light-theme readability; code and diff surfaces inherit the same deeper
content material, and reduced transparency falls back to the solid semantic background.
