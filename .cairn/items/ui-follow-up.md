# Harbor UI follow-up

## Goal

Finish the six remaining frontend acceptance batches in UI_MIGRATION_CHECKLIST.md, preserving the agreed design and capabilities. Each batch needs applicable evidence, passing checks, actual CodeRabbit review, resolved findings, verified merge content and branch cleanup. No releases or real GitHub business-data writes.

## Current state

- Primary workspace: `/Users/bytedance/Documents/Work/Code/harbor`, now on `main` at `307eaecc5588c45a171809405bf6fce806423ecd`. Unrelated pre-existing README changes remain: deleted `.cairn/items/readme-delivery.md` and untracked `.cairn/archive/readme-delivery-pr86.md`. Do not stage them. The selected UI checkpoint is also locally modified for recovery.
- Rules PR #87 is MERGED at `aa1ba45`, with actual review, its sole finding accepted by CodeRabbit on final `44239f2`, final checks and exact changed-file verification. Its branches and temporary review worktree were cleaned up. #83–#86 were already delivered; do not redo them.
- Issue PR #88 is MERGED at `307eaec`; its entire merge tree exactly matches final head `c540c1d`. Local main is synchronized and both Issue branches are deleted. A scoped preservation stash was restored and dropped; no unrelated changes were lost.
- #88 actual CodeRabbit run `1b82556c-99df-487d-bde9-5c1bf778e03c` covered final `c540c1d` and reported no actionable comments in updated issue comment `5598374276` (the GitHub formal reviews array is empty). Generic docstring coverage was dispositioned against repo rules in comment `5599087773`. All final CodeQL checks and local `pnpm check` (626 tests/128 files) passed. Earlier rate-limit responses were not counted.
- Discussion PR #89 is open (initial independent head `25be600`) on `fix/discussion-reply-acceptance`, worktree `/tmp/harbor-discussion-acceptance-20260909`. It is rebased onto merged Issue main `307eaec`, preserving both fixture families and evidence sections. Final `pnpm check` passes 634 tests/130 files (`/tmp/harbor-discussion-rebased-check.log`); Discussion components/layout are unchanged from the browser-verified head. Review was requested but rate-limited; no actual review yet. CodeRabbit allows one included review/hour; next opportunity is approximately 09:34 UTC on 2026-09-09. Inspect actual review-summary content, not just formal reviews or green statuses.
- Discussion local evidence: pending editor/parent action guards, mutually exclusive reply/edit forms, awaited minimization reconciliation, narrow repository-header layout and constrained Discussion viewport width. Final local check passed 621 tests/129 files before adding Issue's independent 13 tests. 200 scenario captures/scripts are copied to primary `output/playwright/discussion-*`; current selected images are in `docs/verification/discussion-replies/`. Full evidence is in that branch's UI_VERIFICATION.md.
- Current implementation: `/tmp/harbor-pages-acceptance-20260909`, branch `fix/repository-pages-acceptance`, based on Discussion `25be600`. Vite port 1425; Playwright CLI session `pages-acceptance`. Branch is uncommitted. Keep its implementation/tests/fixes together and preserve the parent Discussion batch in PR diffs.
- Pages fixes: archived repositories cannot request builds; concurrent configure/build/disable requests are guarded; archive confirmation stays open/pending or shows inline failure; write errors retain drafts. Four regressions reproduced and 13 focused tests passed. Four fixture isolation tests also pass.
- Opt-in `pages` fixtures cover archived, disabled, workflow, certificate-pending, health-pending, health-invalid, build-active and build-error states plus archive/unarchive and Pages mutations. Unknown business writes still fail locally. Latest fixture also updates synthetic domain health after a configured hostname changes.
- Pages initial `pnpm check` passed 629 tests/131 files (`/tmp/harbor-pages-check.log`). Later screenshot inspection found overlapping health labels at 900 px despite the initial 64-case width matrix passing. The three configuration/health grids now use the Pages container width. The health-grid fix and repository-tab preservation fix now pass 630 tests/132 files (`/tmp/harbor-pages-final-check.log`). Final rebase checks remain required.
- Browser work in progress: The final Pages write matrix (72), condition matrix (64) and read/retry matrix (40) pass. The final archive matrix (48) also passes at port 1425, including independent response snapshots and retained Settings selection; the fixed script accounts for Spinner accessible names and duplicate Queued badges. A temporary `/tmp/harbor-pages-vite.config.mts` disables HMR updates and isolates `/tmp/harbor-pages-vite-cache`, avoiding the earlier dev-client connection-loss reloads. Screenshots/scripts are currently in the Pages worktree's ignored `output/playwright/`; copy them to the primary workspace before cleanup.
- Remaining after Pages: Release/code transfers; recent repository/conversation/Project/Gist browser acceptance; shared/native final acceptance. Native background/transparency/accessibility and final guide-value gates are not established by browser tests. The overall Goal is active.

## Next action

Finish Pages browser acceptance, then rebase Discussion and the Pages batch onto the merged Issue main, rerun required final checks, and prepare the separate Pages PR while waiting for actual Discussion review.

## Verification

- Rules: https://github.com/Excelius-Wang/harbor/pull/87#discussion_r3965872791.
- Issue: `/tmp/harbor-issue-final-delivery-check.log`, `/tmp/harbor-issue-comment-final.log`; 400 scenario captures under primary `output/playwright/issue-*`; merged evidence in UI_VERIFICATION.md.
- Discussion: `/tmp/harbor-discussion-final-check.log`, `harbor-discussion-{nested,write,read,extra,shell}-matrix.log`; selected current screenshots and 200 captures documented in its PR.
- Pages: `/tmp/harbor-pages-archive-red.log`, `/tmp/harbor-pages-archive-green.log`, `/tmp/harbor-pages-check.log`; browser matrices remain in progress. Existing context-rail hook and build chunk-size warnings are non-blocking.

Success so far: rules and Issue batches are merged and cleaned up. Discussion is locally verified but awaiting external delivery. Pages and later acceptance gates remain unfinished.
