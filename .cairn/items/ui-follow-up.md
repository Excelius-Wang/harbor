# Harbor UI follow-up

## Goal

Complete all six authorized frontend batches with applicable browser/native evidence, checks, actual CodeRabbit review, verified merges and branch cleanup. Preserve agreed design and unrelated work. No releases or real GitHub business writes.

## Current state

- Primary main is 3338a49. Rules #87, Issue #88, Discussion #89 and Pages #90 are MERGED, content-verified and cleaned. Preserve unrelated README checkpoint deletion/archive changes in primary.
- Transfer #91: branch fix/release-transfer-feedback, worktree /tmp/harbor-transfer-acceptance-20260909, final head 3197c7dbd74d6ac25d8d50e10fa5d3a614ed11af, based on merged Pages main. Actual CodeRabbit run 09bb4c7a-09a6-4ed1-917e-8bba1ebc9b0a covers final3197c7d with no actionable findings; docstring advisory disposition5602446696. All checks passed. PR #91 merged3338a49, entiretree equalsfinal3197c7d; main synced and owned preview/remote/local branches/worktree cleaned. 658 tests and 264 browser scenarios pass; rebase changes only checkpoint documentation.
- Recent actions: /tmp/harbor-recent-actions-acceptance-20260909, branch fix/recent-workspace-actions-acceptance, integrated Gist fix commit 2672fee on Transfer3197c7d. Source/test/fixtures equal the checked 5a9c086 tree. Gist picker has a translated accessible name; long description is fully readable in a keyboard-focusable bounded scroll area. Integrated pnpm check passes 659 tests/135 files. All 1056 browser scenarios pass; docs now reflect this. PR #92 opened, retargeted main and pushed after rebase at73d076df20d183bc8050607b178efa02d970e26d. Entiretree unchanged from9278e7d. Review request5602455799 was rate-limited (reply5602457215), not acceptance; next included review around14:06UTC.
- Recent preview remains localhost1428, server session26822, Playwright sessions recent-acceptance and gist-acceptance idle. All recent captures/scripts copied to primary output/playwright/recent-*. No resource proxy remains; retry only observed ERR_NETWORK_CHANGED local-module failures. Reaction runner corrections scope the body bar by surviving thumbs-up, wait for committed removal, and assert compact stale labels.
- Native access now WORKS. A fresh isolated preview was built successfully via cargo build (session94265 completed) using /tmp/harbor-native-acceptance-config.json and target /tmp/harbor-native-acceptance-target. App /tmp/Harbor Acceptance Preview.app, identifier com.harbor.acceptance.preview, connects to controlled1428 preview. Production config and installed Harbor untouched. CUA binding nativePreview is active; dark Chinese main and native settings were observed, then settings switched to light English. CUA screenshot evidence currently exists in conversation only. Current app focused on Settings; continue native matrix rather than restarting/rebuilding. Historical permission failures no longer block this run.
- Shared review confirmed nested main landmarks: window-frame.tsx owns outer main; Gist/Project/Packages views and Profile contain additional main. Fixes are in /tmp/harbor-shared-acceptance-20260909 on fix/shared-native-acceptance (four main tags changed to div, no layout change). Fullcheck659tests135files passes /tmp/harbor-shared-check.log. Browser matrix runs against1429, preview session23745. First partial loop hit Vite initial dependency reoptimization and mixed React module hashes; rerun after cache settled is running. Final native background, reduced transparency/motion, dimensions, guide-value validation and overall gates remain open.
- Unrelated historical branches and prunable worktree records remain preserved. Do not broadly clean them.

## Next action

Finish Transfer actual review and verified delivery, deliver the completed recent-action batch, then resolve shared landmarks and complete native/shared acceptance with final documentation reconciliation.

## Verification

- Issue: 400 captures; final641 Discussion check is separate. Discussion: 248 captures, actual review/fix confirmation5601074997, merge357a9e3 equals finala99c96b. Pages:224captures, actualreview5154063765 + fixconfirmation5601769667, mergec35194c equalsfinal0fa6c77.
- Transfer: /tmp/harbor-transfer-after-discussion-check.log (658 tests); /tmp/harbor-transfer-{write,extra,file,tags,read}-matrix.log,264 captures. Prior isolated preexisting test timeout resolved with full one-worker run without changing assertions/timeouts.
- Recent: /tmp/harbor-recent-integrated-check.log (659 tests). Repository176 + Project240 + Gist224 + conversationwrites192 + conversationreads80 + reactionwrites96 + reactionreads48 =1056 captures. Full final JSON arrays verified; earlier partial loops excluded. Logs /tmp/harbor-recent-*-matrix.log; selected images docs/verification/recent-actions; rawprimary output/playwright/recent-*.
- Stale empty readonly reactions use controlled query-cache seeding before failing refresh; this is explicitly documented. Native build log /tmp/harbor-native-acceptance-build.log; temporary config enables initial window visibility only for QA and retains real native window/event bridge with business fixtures.
- Existing hook/chunk warnings remain non-blocking. Full-site completion is not claimed.

Native CUA current state: main light English, Settings closed successfully after checking both appearance and shortcut panes. Main1200x760 and Settings600x500 observed. Binding nativePreview remains active. Shared landmark matrix log /tmp/harbor-shared-landmark-matrix.log; rawcaptures in sharedworktree/output/playwright. Native evidence is still conversation screenshots only, and background/reduced accessibility matrices remain open.

Current native blocker: at13:19UTC CUA returned cgWindowNotFound twice while app inventory confirms running. Read-only system query confirms CGSSessionScreenIsLocked=true. User has been asked to unlock; do not bypass lock or claim remaining native acceptance. Shared landmark matrix completed32cases; shared fullcheck659tests passed. Reduced-media gallery matrix is running in sharedworktree as session28657.
