# Adaptive main window

## Goal

Size Harbor's main window to 85% of the current monitor work area before it becomes visible, while
remaining usable on small displays and across Retina or multi-monitor setups. Done means the window
stays inside the usable desktop area, the calculation has focused tests, and the change is delivered
through a clean pull request.

## Current state

Commits `a3ddfb99c9cbf3b51f4df0fd0308854d55f928f2` and `136e610` are on branch
`fix/adaptive-main-window-size-20260904`. Ready PR #79 is open at
`https://github.com/Excelius-Wang/harbor/pull/79`. The Rust startup hook sizes and centers the hidden
main window from the monitor work area, lowers the configured minimum on unusually small displays,
and treats sizing failures as non-fatal. A macOS runtime check produced a `1285 x 758` window at
position `(113, 100)` inside a `1512 x 893` usable area.

The Discovery tab bar follow-up hides native scrollbars while retaining horizontal navigation on
very narrow windows. It clips vertical overflow, keeps the active underline inside the tab list,
and defers the optional feed hint until 1240px so it does not crowd the tabs. This fixes the
scrollbars exposed when the adaptive window opened at a narrower width.

The primary worktree is checked out on the PR branch. Earlier README, Cairn, and duplicate local
window edits were split into three commits and pushed to recovery branch
`checkpoint/github-actions-administration-20260830`; they are not part of PR #79.

## Next action

Monitor PR #79 checks and address any failures before merge review.

## Verification

`pnpm check` passed 92 frontend files and 428 tests plus the production build. Rust format and check
passed; 586 Rust tests passed with 2 intentional external-service ignores. Focused window-layout
tests passed 2/2. The Discovery interaction regression test passed, `git diff --check` passed, and
runtime visual verification confirmed the top navigation no longer shows horizontal or vertical
native scrollbars. The macOS runtime size matched the expected 85%.

Success: implementation verified; PR review and merge remain pending.
