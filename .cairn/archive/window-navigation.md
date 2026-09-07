# Window size and navigation toggle

> Historical snapshot: delivery and uncommitted-work statements below describe the
> checkpoint when it was recorded, not the current branch. These records were included
> in [PR #84](https://github.com/Excelius-Wang/harbor/pull/84); see the
> [current checkpoint](../items/ui-follow-up.md) for live delivery status.

## Goal

Open Harbor at a fixed 1200 × 760 logical size when the display allows, show navigation labels on first launch, and provide a persistent expand/collapse control.

## Current state

- Implementation complete locally on `feat/window-navigation-toggle`, based on `74c396b`; changes are uncommitted and no new PR was created. Existing Cairn archival changes are preserved.
- The existing title-bar Logo is now the navigation toggle, per the user’s refinement; the separate sidebar icon was removed. Fixed logical startup sizing clamps to the monitor work area. Navigation defaults to 226 px expanded and toggles to a 58 px icon rail; local storage saves the choice without tying it to viewport breakpoints. See `docs/UI_COMPONENTS.md` and `docs/UI_VERIFICATION.md` for implementation and evidence.
- User's branch policy is now in `AGENTS.md`: each independent change gets a branch; after an authorized merge, verify and automatically delete that PR's local/remote branches. The already-merged Packages branch was verified against PR #83 and deleted locally/remotely. Other old branches/worktrees were preserved.

## Next action

None — complete

## Verification

`pnpm check`: 610 tests/127 files, formatting, lint, TypeScript and Vite build pass. Four Rust window geometry tests, cargo check and formatting pass. Logs: `/tmp/harbor-navigation-check.log`, `/tmp/harbor-window-tests.log`, `/tmp/harbor-window-check.log`.

Playwright CLI passes 12 language/theme/size combinations with 24 screenshots, keyboard focus, preference reload and resize independence. Native preview reports 1200 × 760 at (360, 140); native Accessibility clicks on the earlier standalone toggle collapse/expand without resizing; these clicks do not verify the final Logo control. Exact artifacts and limitations are in `docs/UI_VERIFICATION.md`.

Logo refinement: nine focused tests, TypeScript and all 12 browser combinations pass; see `/tmp/harbor-logo-browser.log`. The final native header was captured, but native click automation was unavailable for the Logo variant.

Success: window/navigation implementation and branch-policy documentation are complete, with browser verification of the final Logo control. Native accessibility activation of the final Logo remains unverified; the earlier native toggle evidence must not be used as final Logo coverage.
