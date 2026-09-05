# Harbor UI unification

## Goal

Execute `/private/tmp/harbor-ui-refactor-handoff.md`: migrate all owned UI, verify browser and native appearance, deliver an unmerged PR, and fix/recheck actual CodeRabbit feedback on the final commit.

## Current state

- Workspace `/Users/bytedance/Documents/Work/Code/harbor`; branch `refactor/unified-harbor-ui`, base `03709c2`, origin `Excelius-Wang/harbor`. No branch push or PR yet. User authorized commits, push, PR and review replies; no merge or release.
- Original trending/filter implementation is isolated in `af1af2f`. Original tracked patch `/private/tmp/harbor-ui-preexisting.patch` and untracked list `/private/tmp/harbor-ui-preexisting-untracked.json`. Preserve unrelated original untracked `.cairn/archive/*` files; never stage them.
- Completed commits: `826d04b` shared material/control/navigation/gallery foundation; `f2cb749` repository/Issue/PR core surfaces and per-query scroll restoration; `13137db` Notifications/profile/Projects/Gists/Packages core and shared overlay focus recovery. Exact scope and remaining variants are in `docs/UI_MIGRATION_CHECKLIST.md` and `docs/UI_VERIFICATION.md`; do not equate core coverage with complete feature acceptance.
- Current repository-tab batch is ready to commit: Actions/Releases/Wiki/Insights/Security surfaces, metadata, reading fills, retained-data error handling, scroll retention, semantic chart ticks and keyboard tooltips. Typed fixtures in `src/dev/repository-fixtures.ts`; unknown business writes still fail. Core 72, Chinese state 40, action dialog 32, chart tooltip 4 captures plus actual return assertions are documented. Final delivery images must be refreshed after remaining batches and made remotely accessible.
- `pnpm lint` now quotes its source glob; the old shell expansion excluded deep source files. Full-source lint fixes are narrowly scoped hook dependencies and documented intentional Wiki control-character regex exceptions. Do not describe old checks as full-source lint coverage.
- Preview runs on 1423 (`pnpm dev:ui --port 1423`, earlier exec 55826). Pre-existing 1420 and task 1422 remain. Playwright wrapper `/Users/bytedance/.codex/skills/playwright/scripts/playwright_cli.sh -s=uiqa` is reliable headless. Fresh navigation after HMR; no source/browser mutation during screenshot tours. Only Repositories primary navigation opens the full tab workspace; Discovery opens code-only detail.
- Preview supports `state=loading|empty|error|stale&commands=comma,separated,IPC,names`. No command scope keeps the global scenario. Fixture data is synthetic, not live API validation. Gallery `/ui-components` uses production components, but remaining primitive/state coverage is pending.
- Native preview bootstrap defect fixed: installed Tauri bridge properties are readonly, but SDK mockIPC assigns them. UI-preview-only Vite import transform now sends application core imports through `src/dev/preview-core.ts` / `invokePreview`; native SDK window/events remain intact. Only browser calls mockIPC. Readonly bridge regression passes; 1423 uses facade, ordinary 1420 uses SDK; production bundles exclude preview markers.
- Native observation remains unverified. Original process 73725 untouched; old task wrapper 50522 remains. Current task wrapper `/private/tmp/Harbor UI Visible Preview.app` uses visible=true config `/private/tmp/harbor-ui-native-preview-visible.json`, identifier com.harbor.ui-preview-visible, devUrl 1423. Confirmed bootstrap fix justified cold launch; new PID 15241 is live. CUA reports cgWindowNotFound. WebKit OS log reports window visible=1, hidden=0, occluded=1; cause not established. No native screenshot or material/fallback pass. Pending user question asks whether this diagnostic window is visible. Avoid repeated retries without changed evidence or native UI workarounds.
- Still needed: repository administration/Discussions; advanced code/Issue/PR/review/action variants; profile follow-error feedback/auth; remaining More states; titlebar/rail/Agent/command/settings/about/update; complete shared gallery and source audits; native backgrounds/reduced transparency/motion; formal docs/AGENTS; final local checks, CI, PR and actual CodeRabbit loop. Integration exists on old PR81 only; no current-branch review.

## Next action

Commit the verified repository-tab batch, then migrate and inspect repository administration and Discussions with controlled data before proceeding through the remaining checklist.

## Verification

- Latest `pnpm check` passes 471 tests in 104 files, complete-source lint, formatting, TypeScript and production build. Log `/private/tmp/harbor-repo-check.log`. Separate `tsc -b` passes; preview/stale focused regressions pass cleanly. Build chunk-size advisory remains informational.
- Browser captures are actual production UI with controlled fixtures at 900×620 and 1440×900, light/dark. Exact inspected views, state coverage, keyboard/return assertions and exclusions in `docs/UI_VERIFICATION.md`; screenshots in ignored `output/playwright/`.
- Baseline Rust cargo check passes; native preview dev build also succeeds. Native visual acceptance, complete UI migration, final CI and current-branch PR/review remain outstanding.
