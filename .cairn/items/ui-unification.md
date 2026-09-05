# Harbor UI unification

## Goal

Execute `/private/tmp/harbor-ui-refactor-handoff.md`: migrate all owned UI, verify browser and native appearance, deliver an unmerged PR, and fix/recheck actual CodeRabbit feedback on the final commit.

## Current state

- Workspace `/Users/bytedance/Documents/Work/Code/harbor`; branch `refactor/unified-harbor-ui`, base `03709c2`, origin `Excelius-Wang/harbor`. No push or current PR. User authorized commits, push, PR and review replies; no merge/release. Push/PR only after full local implementation and acceptance.
- Original trending/filter changes are isolated in `af1af2f`. Preserve original unrelated untracked `.cairn/archive/*`; never stage them. Backup: `/private/tmp/harbor-ui-preexisting.patch`, original untracked list `/private/tmp/harbor-ui-preexisting-untracked.json`.
- Local completed batches: `826d04b` foundation/gallery; `f2cb749` repository/Issue/PR core; `13137db` Notifications/profile/More; `9052026` repository tabs and native preview bridge; `cca9e0f` administration/Discussions; `675be1f` code/history/search/Blame; `8b02120` Issue relationships/forms. Exact scope, screenshot patterns and remaining variants are authoritative in `docs/UI_VERIFICATION.md` and `docs/UI_MIGRATION_CHECKLIST.md`. Core coverage is not whole-feature acceptance.
- Separate dependency fix `cd159bf`: cmdk 1.1.1 backport of upstream PR411 registry-based async option id linkage, ESM and CommonJS pnpm patch. Three production-wrapper regressions and real Teams keyboard/ARIA checks pass. Attribution/removal criteria in `patches/README.md`; no version upgrade. Frozen lockfile install passed.
- The PR batch is included in the local commit titled `refactor: unify pull request lifecycle and review surfaces` (still unpushed). It adds shared stale notices for automation/base/reviewers/files/threads/pending/viewed state/maintainer settings, 11 px metadata and consistent reading/control surfaces. PR creation retains title/body/draft when branch/comparison refresh fails; stale submission is disabled. Commit detail return preserves nonzero list scroll. Existing mutation/reconciliation locks remain; pending dialogs hide the otherwise inert close X. Seven new regressions (six automation, one creation) pass with existing behavior tests.
- PR controlled reads use `?pr=` lifecycle/review variants in `src/dev/workspace-fixtures.ts`. `reviewed` exposes a submitted review separately from requested reviewers. Unknown business writes still fail; scoped loading/error mutations are intercepted before fixture resolution. No real application GitHub writes were submitted.
- PR completed browser evidence: 68 core, 64 stable lifecycle, 92 Chinese read-state, 24 pending/error mutation, 24 creation/draft, 48 review/warning, 4 nonzero commit-scroll and 4 Teams keyboard captures; 20 extra dismissal/conversion/maintainer captures. Maintainer warning/loading/error/stale targets needed bottom-of-pane positioning because the metadata aside is sticky and taller than the viewport; corrected 16 captures have explicit target bounds assertions. Some older core captures predate the final metadata refinements; final delivery images must be refreshed after all batches.
- PR final code checks pass `pnpm check` (496 tests/109 files, full-source lint/format/build) and separate `tsc -b`: `/private/tmp/harbor-pr-final-check.log`, `/private/tmp/harbor-pr-final-tsc.log`. The final inline new/edit/preview/cancel and checks/repository-list tour adds 24 captures; log `/private/tmp/harbor-pr-inline-qa.log`. Review pending/error footer captures were replaced via `harbor-pr-review-write-final.py`, log of the same stem. All tours completed; browser ends dark/900 in a controlled failed review submission. Source audit and exact evidence are recorded in the UI docs. No business IPC reached GitHub.

## Preview and recovery

- Task preview 1423: `pnpm dev:ui --port 1423 --force`, exec58868. Original 1420 and task1422 remain untouched. Restart was necessary because Vite still served old optimized cmdk; current optimized dependency contains `getItemIdByValue`.
- Playwright wrapper `/Users/bytedance/.codex/skills/playwright/scripts/playwright_cli.sh -s=uiqa` is reliable headless. All screenshots are actual production React with controlled fixtures in ignored `output/playwright/`; these are not remote reviewer links or live API validation.
- Never mutate source or another browser state during a screenshot tour. Use fresh goto after HMR. Primary Repositories opens the complete tab workspace; Discovery detail is code-only. English tab is `Pull requests`, while primary navigation is `Pull Requests`; creation head selector is `Compare branch`.
- Preview supports `state=loading|empty|error|stale&commands=comma,separated,IPC,names`. A known null result must not fall through. Spinner selector is `svg[aria-label].animate-spin`, not data-slot. Wait for actual options/Markdown where applicable, not only query-cache idle. Wait for disabled DOM state before checking pending Escape locks. For screenshots scroll only the pane or dialog, not the window root.
- ui-preview imports use `src/dev/preview-core.ts`/`invokePreview`; installed Tauri bridge internals are readonly, so native must never call SDK mockIPC. Native window/events stay real; browser alone uses SDK mocks. Readonly-bridge regression passes; ordinary dev/production imports remain unchanged, and production excludes preview fixtures.

## Native / external gates

- Native material observation remains unverified. Original native PID73725 untouched; old task wrapper50522 remains. Diagnostic `/private/tmp/Harbor UI Visible Preview.app` uses `/private/tmp/harbor-ui-native-preview-visible.json` (visible=true, identifier com.harbor.ui-preview-visible, devUrl1423); last PID15241 live. CUA returns cgWindowNotFound, WebKit logs visible=1/hidden=0/occluded=1. Cause is unestablished. No native screenshot or translucency/fallback pass.
- Earlier async user question asks whether this diagnostic window is visible; no answer received. Do not repeat blind launches or bypass CUA with native automation workarounds. One cold launch after the readonly-bridge fix was justified; it did not establish visibility. Browser backgrounds cannot substitute for native evidence.
- Remaining work: advanced code/Issue/repository/More action variants documented in checklist; profile follow-error/auth; titlebar/navigation/rail/Agent/command/settings/about/update; complete production gallery and source audit; native cool/neutral/bright backgrounds and reduced transparency/motion; final guide/AGENTS, checks/CI, PR and actual CodeRabbit loop. Old PR81 proves integration exists but is not this branch's review. Final screenshots need remote publication with the PR.

## Next action

Audit and migrate the remaining workspace/window/account UI, starting with settings/about/update and shared titlebar controls, with before images and controlled preview states.

## Verification

- `pnpm check` and `pnpm exec tsc -b`: 496 tests in 109 files, full-source lint/format/build/typecheck pass. Existing bundle-size advisory only. Logs `/private/tmp/harbor-pr-final-check.log`, `/private/tmp/harbor-pr-final-tsc.log`.
- Browser: light/dark at 900×620 and 1440×900, English/Chinese, query/mutation states, keyboard and nonzero returns as specified in `docs/UI_VERIFICATION.md`; the PR inline and feedback tours are complete.
- Baseline Rust cargo check and native preview build pass. Native visuals, remaining UI migration, final CI/current-branch PR/CodeRabbit remain unverified.

Success: PR code checks and the completed browser matrices pass; the overall Goal remains active and incomplete.
