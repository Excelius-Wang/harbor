# Repolane Lane identity

The user accepted Lane D and the current in-app integration on 2026-09-08. These captures show the production components with controlled, local-only preview data. They are browser captures, not native-window evidence.

| Scenario | Capture |
| --- | --- |
| Reconstructed contour in both themes, 16–64 px widths | ![Vector preview](vector-preview.png) |
| Chinese workspace at 900 px | ![Light workspace](workspace-light-900.png) |
| English workspace at 1440 px | ![Dark workspace](workspace-dark-1440.png) |
| About, light | ![Light About](about-light.png) |
| About, dark | ![Dark About](about-dark.png) |

Eight browser scenarios cover en/zh × light/dark × 900/1440 px, including Enter/Space navigation toggling and horizontal containment. Both About themes and the standalone favicon's light/dark foreground were checked. The editable SVG, inline component and preview share identical path data. The two paths remain separated at 16 px; the titlebar uses a 24 × 22 px viewport.

Lane-specific native-window inspection and Dock/release-icon migration remain outside this acceptance. The titlebar retains inline SVG because the prior CSS mask implementation failed in native WebView.

PR #85 review regression: double-clicking either the mark or wordmark now stops at the brand block, while the empty titlebar drag region retains native maximize handling. Both new cases failed before the fix and passed afterward; all five focused titlebar tests pass. These tests mock the native window call and do not establish native WebView acceptance.

Local delivery gate: `pnpm check` passed all 611 tests in 127 files, formatting, lint, TypeScript and production build; `cargo check --manifest-path src-tauri/Cargo.toml` passed. The first full test run timed out once in the unrelated code-navigation suite; its isolated rerun and the complete rerun passed without code changes. Existing rail-hook and bundle-size warnings remain.

Review-fix validation: `pnpm check` passed 613 tests in 127 files, formatting, lint, TypeScript and production build. Existing rail-hook and bundle-size warnings remain. No Rust/config changes were made in this fix; the prior cargo check remains applicable.
