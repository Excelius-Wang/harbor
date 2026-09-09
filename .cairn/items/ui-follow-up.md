# Harbor UI follow-up

## Goal

Complete the six authorized frontend acceptance batches with applicable evidence, passing checks, actual CodeRabbit review, verified merges and branch cleanup. Preserve the agreed design and unrelated work. Do not publish releases or mutate real GitHub business data.

## Current state

- Primary main is `5218495`. Rules #87, Issue #88, Discussion #89, Pages #90 Release/code transfer #91 and recent actions #92 are merged, their final content is verified, and their owned branches and worktrees are cleaned. Preserve the unrelated README checkpoint deletion and archive in primary.
- Recent actions #92 is merged at `5218495a4df47e54c2b22c7b3488719295599dff`; the entire merge tree equals final `9bcae00961db47392f7b1750f974de8ab6b0aa70`. Actual CodeRabbit run `6b21a10b-dd44-4fe5-b442-cd3ca0c5622c` covered production; comment `5603319829` confirms both final documentation findings resolved. All final CI passed. Its raw evidence was preserved and its owned browser sessions were closed before cleanup.
- Shared/native PR #93 is on `fix/shared-native-acceptance` in `/tmp/harbor-shared-acceptance-20260909`, rebased onto merged #92 main. Four nested main landmarks are fixed. Its 659-test check and 80 browser scenarios pass. PR #93 is retargeted to main. Obtain actual review after the next available review window (approximately 15:07 UTC). Remaining native evidence prevents final acceptance.
- Preview servers remain on ports 1428 (native QA, session 2420) and 1429 (shared browser QA, session 23745), both from the shared worktree. Previous Playwright sessions are closed. Raw captures and scripts are preserved in primary `output/playwright/`; selected browser images are committed under `docs/verification/`.
- Native preview `/tmp/Harbor Acceptance Preview.app` uses identifier `com.harbor.acceptance.preview`, an independent target directory and controlled port 1428 business fixtures. User unlocked the desktop at 13:50 UTC. Current native observations cover theme/language synchronization, Settings return, maximize/restore, minimum-size tiling, navigation and Command. Reduce Transparency and Reduce Motion were each temporarily enabled, observed and restored to their original off values. The wallpaper remains unchanged: built-in display, Dynamic Wallpaper, fill screen, all spaces off.
- Native export and background comparison remain incomplete. CUA wallpaper controls report offscreen errors; Screenshot failed to launch and TextEdit supplied no window. Explicit user authorization is pending for screencapture/AppleScript limited to the controlled preview, screenshot export and temporary/restored backgrounds. Do not use those alternatives before authorization. The original native JPEG remains in CUA binding `nativeShot`; no file was exported.
- Historical code-edit, branch and commit-comment full write-state variants remain incomplete while the user clarifies whether they belong to this six-batch scope. Do not silently accept or remove them. Preserve unrelated historical branches and worktree records.

## Next action

Obtain actual review for #93 and finish remaining native acceptance through an authorized available path, then verify final checks, merge content and cleanup, and reconcile the final evidence and scope.

## Verification

- Issue: 400 captures, 626-test delivery check, merged `307eaec`. Discussion: 248 captures, 641-test final check, merged `357a9e3`; final tree equals `a99c96b`. Pages: 224 captures, 650-test integrated check, merged `c35194c`; final tree equals `0fa6c77`.
- Transfer: 264 captures and 658 tests; actual review run `09bb4c7a-09a6-4ed1-917e-8bba1ebc9b0a`, advisory disposition `5602446696`. Merge `3338a49` equals reviewed `3197c7d`.
- Recent: `/tmp/harbor-recent-integrated-check.log` and `/tmp/harbor-recent-*-matrix.log`. Counts are repository 176, Project 240, Gist 224, conversation writes 192, conversation reads 80, reaction writes 96 and reaction reads 48. Before images and partial runs are excluded. The stale empty readonly reaction case uses documented controlled query-cache seeding.
- Shared: `/tmp/harbor-shared-check.log`, `/tmp/harbor-shared-landmark-matrix.log` (32 cases), `/tmp/harbor-shared-media-matrix.log` (48 cases). Native build: `/tmp/harbor-native-acceptance-build.log`. Current native screenshots exist in the conversation only; detailed limitations are in `docs/UI_VERIFICATION.md` and `docs/verification/shared-native/README.md`.
- Existing hook and chunk-size warnings are non-blocking. No overall completion is claimed.
