# Trending developers

## Goal

Add official GitHub Trending Developers under Discover > Trending, preserve Harbor's current
app design, and record that design language in root AGENTS.md.

## Current state

- Complete in `/Users/bytedance/Documents/Work/Code/harbor`; implementation remains uncommitted.
- Repository/developer switching shares daily, weekly, and monthly filters. The Rust adapter
  fetches the public official ranking through a bounded, credential-free interface. Developer
  profiles reuse the existing page; popular repository links open GitHub.
- Root `AGENTS.md` records the current tokens, surfaces, typography, density, responsive layout,
  accessibility, and state patterns. `docs/GITHUB_TRENDING_DEVELOPERS.md` records the data boundary.
- User-authorized Playwright verification passed with the actual React UI and isolated IPC
  fixtures using public GitHub data. Both themes and the minimum/wide window sizes are verified.
  Native macOS glass rendering is outside browser verification. No further UI changes were needed.
- Local screenshots, QA scripts and measured results are in Git-ignored `output/playwright/`.

## Next action

None — complete

## Verification

- Frontend formatting/lint passed. Final `pnpm exec vitest run --maxWorkers=2`: 99 files,
  453 tests passed. `pnpm build` passed with existing large-chunk warnings.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: 592 passed, 3 ignored.
- Explicit `live_trending_developers` public-network test passed.
- Rust check/format and `git diff --check` passed.
- Debug app bundle built with a local `bundle.createUpdaterArtifacts=false` override.
- Playwright: both themes at 900, 1099, 1100, 1279, 1280 and 1440 px widths; 900 × 620 minimum
  and 1440 × 900 wide screenshots inspected. No document/pane overflow or escaped controls.
- Loading, retained period on profile return, pane scrolling, refresh failure/recovery and
  keyboard tab selection passed. Browser console had zero errors and warnings.
- Success: requested feature, design guidance, automated checks, and browser visual QA complete.
