# Desktop release readiness

## Goal

Ship Harbor as an installable, signed, auto-updating desktop application for individual developers,
then validate the packaged build with a real GitHub account and polish release-blocking experience
problems. Done means the supported platform matrix is explicit, release credentials are preflighted,
published artifacts and updater metadata are verified, a clean-machine install/update path passes,
and the signed build completes the documented real-account regression checklist.

## Current state

`origin/main` is `22f9bdd26e09f5dc45a31caf9261cc27c6c65d2a`. The primary worktree remains on the
user-owned recovery branch with unrelated README and archive changes; do not reset, stash, clean, or
use it for source edits. The release-readiness fixes through PR #78 are on `origin/main`, including
the reviewed-update install flow, updater states, Tauri runtime contract, macOS preflight, and safe
manual-update fallback. The user selected macOS as the first-release platform and accepts an
unsigned build being blocked by Gatekeeper; the current development Mac has no valid Developer ID
identity.

The isolated worktree
`/private/tmp/harbor-manual-updater-dialog-macos-20260904.dbaiFK/worktree` on branch
`fix/discovery-tabs-scrollbars-20260904` preserves the uncommitted discovery-tab scrollbar fix.
The user starts development from the primary worktree, so the adaptive main-window change is also
applied there with explicit authorization. It sizes the main window to 85% of the current monitor
work area before React shows it, dynamically lowers the minimum on unusually small displays, and
centers in the usable area. The running primary-worktree app opened at `1285 x 758` at position
`(113, 100)`, fully inside the `1512 x 893` usable area. The clean PR branch
`fix/adaptive-main-window-size-20260904` contains commit `a3ddfb99c9cbf3b51f4df0fd0308854d55f928f2`;
ready PR #79 is open at `https://github.com/Excelius-Wang/harbor/pull/79` and changes only
`src-tauri/src/lib.rs` plus `src-tauri/src/window_layout.rs`.

## Next action

Monitor PR #79 checks and address any failures before merge review.

## Verification

Adaptive-window verification passed on 2026-09-04: runtime size `1285 x 759`; `pnpm check` with 91
test files and 427 tests; Rust format/check and 586 tests with 2 credential/service tests ignored;
focused window-layout tests 2/2; and `git diff --check`. Run the remaining release preflight and
independent Standards/Spec reviews before the normal Draft/Ready PR, remote checks, squash merge,
and merged-main verification.

Success: adaptive-window change verified; release readiness remains pending.
