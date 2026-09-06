# Harbor UI unification

## Goal

Execute `/private/tmp/harbor-ui-refactor-handoff.md`: migrate all owned UI, verify browser and native appearance, deliver an unmerged PR, and fix/recheck actual CodeRabbit feedback on the final commit.

## Current state

- Workspace `/Users/bytedance/Documents/Work/Code/harbor`; branch `refactor/unified-harbor-ui`, base `03709c2`, origin `Excelius-Wang/harbor`. No push or current PR. User authorized commits, push, PR and review replies; no merge/release. Push/PR only after full local implementation and acceptance.
- Original trending/filter work is isolated in `af1af2f`. Preserve unrelated untracked `.cairn/archive/*`; never stage them. Backups: `/private/tmp/harbor-ui-preexisting.patch` and `/private/tmp/harbor-ui-preexisting-untracked.json`.
- Completed local batches through `83e42fa`: shared foundation/gallery, repository/Issue/PR core, Notifications/profile/More, repository tabs, administration/Discussions, code/history/search, Issue relationships, PR lifecycle/reviews, settings/window/theme/shortcuts. The context/auth batch follows that commit. Exact source/render coverage, screenshot patterns, limits and checks are authoritative in `docs/UI_MIGRATION_CHECKLIST.md`, `docs/UI_VERIFICATION.md` and `docs/UI_COMPONENTS.md`. Earlier core coverage does not imply advanced variants passed.
- Context/auth batch is verified: shared command/rail material, named command input and accurate hints, one scrollable Agent response with fixed input, late-context response cancellation, retryable auth availability, shared avatar, follow-error toast and Toaster under ThemeProvider. Five new regressions; final full check passes 512 tests/114 files and separate tsc-b. All tours complete: 176 current captures. Scripts/logs `/private/tmp/harbor-context-{qa,states}` and `harbor-command-final-qa`; final code logs `harbor-context-final-{check,tsc}.log`. Representative captures visually inspected. No application business writes reached GitHub.
- Separate dependency fix `cd159bf` backports cmdk 1.1.1 upstream PR411's async item-id registry, ESM/CJS. Tests and browser Teams input-to-option ARIA linkage pass; attribution/removal criteria in `patches/README.md`. Frozen lockfile install passed; no version upgrade or claim of upstream release.
- Remaining work: final Discovery/shared-primitive/gallery audit; advanced code/Issue/repository/More action variants listed in the checklist; formal guide/AGENTS entry points; native background/transparency/motion acceptance; final checks/CI, PR and actual CodeRabbit loop. Old PR81 proves integration exists but is not this branch's review. Final selected screenshot assets need remote publication with the PR.

## Preview and recovery

- Task preview1423 runs `pnpm dev:ui --port 1423 --force`, exec58868. Original1420 and task1422 remain untouched. The1423 optimizer contains patched cmdk `getItemIdByValue`.
- Browser wrapper `/Users/bytedance/.codex/skills/playwright/scripts/playwright_cli.sh -s=uiqa` is reliable headless. Production React captures use intercepted fixtures, stored in ignored `output/playwright/`. These are local evidence, not remote reviewer links or live API validation.
- Never mutate application source or another browser state during a QA tour. Fresh goto after HMR. Source/read-only docs/scripts are safe. Wait for actual Markdown/options rather than only query idle. Spinner selector is `svg[aria-label].animate-spin`; pending button names may include Loading. Sonner uses `data-sonner-theme`. A CLI exit0 alone is insufficient: inspect `### Error` blocks in tour logs.
- Scoped states: `?state=loading|empty|error|stale&commands=comma,separated,IPC,names`; specific pr/update/shortcut/auth/repo/agent parameters are in UI_COMPONENTS.md. Unknown business writes fail. Application SDK imports are rewritten to `src/dev/preview-core.ts` in ui-preview only; never assign readonly native bridge internals. Browser alone uses SDK mockIPC; native window/events remain real. Browser plugin mocks do not establish native behavior.
- Primary Repositories opens the full tab workspace; Discovery detail is code-only. English repo tab is Pull requests, primary nav Pull Requests, creation selector Compare branch. Use pane-local scrolling; sticky PR metadata requires scrolling to pane bottom before positioning lower controls. Command logs contain embedded full dictionaries: inspect only headings/errors, never broad rg Error.

## Native / external gates

- Native material remains unverified. Original native process was preserved. Diagnostic `/private/tmp/Harbor UI Visible Preview.app` uses `/private/tmp/harbor-ui-native-preview-visible.json` (visible=true, com.harbor.ui-preview-visible, devUrl1423); last PID15241. CUA inventories list it, but getApp returns -10005/cgWindowNotFound before providing a binding. WebKit logs previously reported visible1/hidden0/occluded1. One cold launch after the bridge fix did not establish visibility. Do not repeat blind launches or bypass CUA with native automation.
- New read-only ioreg evidence: current console session has `CGSSessionScreenIsLocked=true`. An async user request now asks to unlock the Mac and report completion. This identifies current lock state, not the cause of all earlier failures. Await external state before another native observation. CUA was reset and docs read; no target binding exists after failed getApp. Native screenshots, cool/neutral/bright backgrounds and reduced-transparency fallback remain required.

## Next action

Audit and verify Discovery and the remaining shared primitives/gallery, then continue the explicit advanced action inventory.

## Verification

- Latest `pnpm check`: 512 tests/114 files plus complete-source lint/format/build; `pnpm exec tsc -b` passes. Logs `/private/tmp/harbor-context-final-check.log`, `/private/tmp/harbor-context-final-tsc.log`.
- Browser matrices cover both themes/languages at900×620 and1440×900, plus Settings600×500 and About500×400. Exact page/state/focus/persistence evidence is in UI_VERIFICATION.md.
- Baseline Rust cargo check and native preview build pass. Native visuals, remaining migration, final CI/current-branch PR/CodeRabbit remain unverified.

Success: current code checks and completed browser batches pass; the overall Goal remains active and incomplete.
