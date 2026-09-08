# Repolane Lane D

The user selected candidate D (Compact) on 2026-09-08, replacing the earlier ink-derived confluence direction.

The editable [SVG source](../../../src/assets/brand/repolane-mark.svg) reconstructs the large D silhouette from the concept sheet. It is an optical reconstruction, not an exact raster trace. Two separate filled paths retain the staggered ends, rounded entry corners and open channel. The viewBox is 256 × 228.

[Preview](preview.html) compares light/dark surfaces and 16, 20, 24, 32, 48 and 64 px viewport widths. The preview uses the same path data as the production component and favicon. Its titlebar row is a static scale reference.

Production uses inline SVG through `BrandMark`, keeping the previously verified native WebView rendering approach. The titlebar uses a 24 × 22 px box and the About page uses an 80 × 72 px box. Color comes from existing foreground/primary tokens. The standalone favicon has the same contour.

This change covers the in-app mark and favicon. Dock/installer icons and release naming remain separate from this integration. The former Solid sources remain under `../repolane-solid/` as historical exploration.

## Verification

The three current titlebar interaction tests, targeted ESLint/Prettier, TypeScript and production build passed. Eight browser scenarios covered English/Chinese, light/dark and 900/1440 px widths, including keyboard navigation toggling. Both About themes were inspected. Favicon foreground follows the browser color scheme using the existing application foreground colors.

The 16–64 px vector preview retains two separate paths. These browser observations do not establish native-window or Dock acceptance. Evidence is in `output/playwright/lane-*.png`; the existing bundle-size warning remains.
