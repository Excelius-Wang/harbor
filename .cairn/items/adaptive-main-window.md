# Adaptive main window

## Goal

Size Harbor's main window to 85% of the current monitor work area before it becomes visible, while
remaining usable on small displays and across Retina or multi-monitor setups. Done means the window
stays inside the usable desktop area, the calculation has focused tests, and the change is delivered
through a clean pull request.

## Current state

Commit `a3ddfb99c9cbf3b51f4df0fd0308854d55f928f2` is pushed on branch
`fix/adaptive-main-window-size-20260904`. Ready PR #79 is open at
`https://github.com/Excelius-Wang/harbor/pull/79`. The Rust startup hook sizes and centers the hidden
main window from the monitor work area, lowers the configured minimum on unusually small displays,
and treats sizing failures as non-fatal. A macOS runtime check produced a `1285 x 758` window at
position `(113, 100)` inside a `1512 x 893` usable area.

The primary worktree is checked out on the PR branch. Earlier README, Cairn, and duplicate local
window edits were split into three commits and pushed to recovery branch
`checkpoint/github-actions-administration-20260830`; they are not part of PR #79.

## Next action

Monitor PR #79 checks and address any failures before merge review.

## Verification

`pnpm check` passed 91 frontend files and 427 tests plus the production build. Rust format and check
passed; 586 Rust tests passed with 2 intentional external-service ignores. Focused window-layout
tests passed 2/2, `git diff --check` passed, and the macOS runtime size matched the expected 85%.

Success: implementation verified; PR review and merge remain pending.
