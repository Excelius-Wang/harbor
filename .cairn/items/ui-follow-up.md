# Harbor UI follow-up

## Goal

Complete the remaining frontend migration and acceptance in docs/UI_MIGRATION_CHECKLIST.md, with each delivery reviewed, merged, verified and cleaned up.

## Current state

- Workspace: Harbor repository. Main is synchronized at `aa1ba45` after rules PR #87. GitHub reports MERGED, and all three final PR files exactly match merge result `aa1ba45e27c9987775bdb46ac3e81fb5e5944a14`.
- #87 received an actual CodeRabbit review on `88729bb`, one formatting-coverage finding, and an explicit bot confirmation of its only follow-up change `44239f2`; the thread is resolved. All final CodeQL checks pass. A full repeat review was rate-limited and is not counted as a pass. Rule branches and the temporary review worktree were removed.
- #83 Packages, #84 window shell, #85 Repolane branding and #86 READMEs are already merged. Do not redo their delivered work. Native acceptance must use the current separate sidebar button, not the historical clickable Logo.
- Active branch: `fix/issue-lifecycle-acceptance`, rebased onto main `aa1ba45`, with the Issue recovery implementation, fixtures, tests and evidence committed together.
- Issue fixes cover pending deletion/dismissal and failed permission recovery; retained detail/comment drafts; timeline-only cache updates; wide title/action layout; stale duplicate permissions; inline transfer failure; and local ScrollArea clipping after comment collapse. Evidence and remaining scope are in the 2026-09-09 UI_VERIFICATION.md section.
- Browser preview is working at port 1423 (Vite session), Playwright CLI session `issue-acceptance`. Matrix scripts/captures are under ignored `output/playwright/issue-*`. Final comment scroll assertions and `pnpm check` pass (626 tests/128 files); evidence: `/tmp/harbor-issue-comment-final.log` and `/tmp/harbor-issue-final-delivery-check.log` The batch is locally verified.
- Unrelated pre-existing changes remain: deletion of `.cairn/items/readme-delivery.md` and untracked `.cairn/archive/readme-delivery-pr86.md`. Do not stage them with UI work. Root CAIRN selection is part of this UI task.
- The user explicitly authorized local commits, branch pushes, PR descriptions, CodeRabbit requests/replies, and automatic merges after actual review, resolved findings and passing final checks. Verify merge results, sync main and clean each merged branch. No releases and no real GitHub business-data writes.
- CodeRabbit reported its free review quota exhausted around 07:42 UTC, next included review in 51 minutes (approximately 08:33 UTC on 2026-09-09). Do not treat a green rate-limit status as an actual review. Continue independent implementation while waiting if a new PR is limited.
- Remaining sequence after Issue acceptance: nested Discussion replies; archived repository/Pages conditions; Release/code transfers; repository/conversation/Project/Gist action browser acceptance; shared/native final acceptance. The overall Goal remains active.

## Next action

Create the verified Issue PR, request actual CodeRabbit review and handle findings; continue independent frontend work if review availability blocks delivery.

## Verification

- #87 final head `44239f219c35836e37964f811ba85765cbe13212`: all three changed Markdown files pass Prettier, local links resolve, diff check passes, CodeQL passes; actual finding-resolution reply is https://github.com/Excelius-Wang/harbor/pull/87#discussion_r3965872791.
- Issue valid regression logs: `/tmp/harbor-issue-delete-red.log`, `harbor-issue-detail-red.log`, `harbor-issue-cache-red.log`, `harbor-issue-duplicate-red.log`, `harbor-issue-transfer-red.log`. Fixture tests pass. Latest pre-clipping full check passes 626 tests/128 files (`/tmp/harbor-issue-complete-check.log`).
- Browser matrices already pass lifecycle, write states, candidates, read states, metadata candidates, extra lifecycle and comment actions. Final affected captures are refreshed; 400 captures cover the documented matrix. Scope and exact logs belong in docs/UI_VERIFICATION.md.

Success: workflow PR #87 is merged and cleaned up; Issue delivery and overall visual/native acceptance remain in progress.
