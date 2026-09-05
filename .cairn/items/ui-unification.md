# Harbor UI unification

## Goal

Execute `/private/tmp/harbor-ui-refactor-handoff.md`: migrate all owned UI, verify browser and native appearance, deliver an unmerged PR, and fix/recheck actual CodeRabbit feedback on the final commit.

## Current state

- Workspace `/Users/bytedance/Documents/Work/Code/harbor`; branch `refactor/unified-harbor-ui`, based on `03709c2`.
- Existing user trending implementation/filter workflow committed separately as `af1af2f`. Pre-task tracked diff: `/private/tmp/harbor-ui-preexisting.patch`; original untracked list: `/private/tmp/harbor-ui-preexisting-untracked.json`. Existing unrelated `.cairn/archive/*` files remain uncommitted and must be preserved.
- Shared foundation committed as `826d04b` (unmerged/unpushed).
- Repository/Issue/PR batch now migrated: shared page headers/stale notices, stable reading/editor/code fills, result-row/metadata density, breadcrumb wrapping and per-query list scroll recovery. `docs/UI_VERIFICATION.md` has exact evidence and limits. Batch committed as `f2cb749` after passing checks (still unpushed).
- Notifications/profile/Projects/Gists/Packages batch migrated locally (commit pending): shared headers/neutral rows, reading fills, readable metadata, retained-data errors, consistent 80rem split-pane breakpoint. Typed read fixtures in `src/dev/more-fixtures.ts`; 48 core/40 dialog/15 Chinese-state/5 stale screenshots and return/breakpoint checks documented in UI_VERIFICATION.md.
- Actual browser focus-return failure led to `useOverlayFocusReturn` in shared Dialog/AlertDialog/Sheet. It preserves connected openers and custom autofocus handlers; five focused regressions and browser 30-Tab/Escape test pass. Gist/Project cached-detail refresh recovery has two regressions. Known-null preview responses remain distinct from missing fixtures (third isolation test).
- Shared `NavigationButton` extracted, all primary/More/account/settings consumers migrated. Shared CSS palette, neutral selection, control surfaces, menus/dialogs/sheets/tooltips/toasts updated. `ThemeProvider` responds to reduced transparency. UI primitives now own material defaults; page overrides still need a complete audit.
- `docs/UI_MIGRATION_CHECKLIST.md` is the complete starting inventory; most feature render/state rows are pending. `docs/UI_COMPONENTS.md` documents the gallery, fixtures and implementation status. Gallery is at `/ui-components` in development only.
- `pnpm dev:ui --port 1423` serves a separate preview entry via a Vite pre HTML transform. It intercepts business IPC; unknown calls fail. Discovery, repository/code, Issue/PR core read fixtures exist in `src/dev/workspace-fixtures.ts`; Notifications/profile/More read fixtures now exist; remaining repository tabs/advanced actions are not implemented. `state=stale` supports retained-result refresh checks. Unknown writes still fail. Production build excludes preview entry/fixtures. Browser-only backgrounds do not cover the native desktop.
- Vite preview exec session 55826 on 1423; prior 1422 session 11750 and pre-existing 1420 server left intact. Playwright `uiqa` (headless) and `default` (headed) sessions exist. If headed screenshot hangs, `page.bringToFront()` resolved it; do not restart solely on capture timeout.
- Native preview compiled with `/private/tmp/harbor-ui-native-preview.json` (identifier `com.harbor.ui-preview`, devUrl 1423). First launch without isolation exited due the pre-existing single-instance app. Isolated direct process was stopped after wrapping its current debug binary in `/private/tmp/Harbor UI Preview.app`; wrapper PID 50522 was verified live, but CUA `getApp` repeatedly timed out. Original dev process PID 73725 is untouched. Native visual verification is NOT done.
- Native diagnosis this batch: existing wrapper 50522 still running, AppKit idle in `/private/tmp/harbor-native-preview-sample.txt`, CUA read still times out. Second dev config `/private/tmp/harbor-ui-native-preview-visible.json` copies production window settings but sets startup visible=true and identifier com.harbor.ui-preview-visible; build succeeds. Task-only direct process 90462 stopped, wrapper `/private/tmp/Harbor UI Visible Preview.app` PID 91472 launched; CUA reports cgWindowNotFound. Original 73725 remains untouched. User has a pending async question asking whether the diagnostic window is visible. No native visual pass.
- Screenshots: `output/playwright/ui-before-populated-*`, `ui-material-populated-*`, gallery light/dark controls/dialogs/command, and final-current discovery 12-image matrix `ui-discovery-{light,dark}-{cool,neutral,bright}-{900,1440}.png`. Matrix uses English synthetic records at 900×620 / 1440×900; gallery uses Chinese. Final screenshots must be made remotely accessible in PR.
- CodeRabbit integration verified through actual bot reviews and successful status on PR #81; this is NOT review of the current branch.
- No PR created. Origin `Excelius-Wang/harbor`; no PR template/CodeRabbit config at startup, only release workflow. Need create/check necessary CI and actual CodeRabbit review after full migration.

## Next action

Migrate the remaining repository workspaces (Actions, releases, Wiki, insights, security and administration) with controlled read fixtures and page/state evidence, while carrying the explicit advanced-action/account and native acceptance gaps in UI_VERIFICATION.md forward.

## Verification

- Baseline `pnpm check` passed 454 tests + build; `cargo check --manifest-path src-tauri/Cargo.toml` passed (logs `/private/tmp/harbor-ui-baseline-{check,cargo}.log`).
- Shared-layer `pnpm check` passed 457 tests across 100 files, formatting, lint, TypeScript and build (`/private/tmp/harbor-ui-shared-check.log`). Vite pre-transform order and the clipped English discovery time filter were corrected before the final passing check; curl confirmed 1423 serves `/src/dev/preview-main.ts` while 1420 serves `/src/main.tsx`. The 12-image fixture matrix was recaptured.
- Repository batch `pnpm check`: 458 tests across 101 files plus format/lint/TypeScript/build pass (`/private/tmp/harbor-ui-pages-check.log`). Browser 900×620 / 1440×900 light/dark core matrix, Chinese loading/empty/error, stale retained rows, filter return and nonzero scroll restoration checked. Initial detail captures included loading; see verification record for scope, do not count them as final populated acceptance.
- Notifications/More full check passes 466 tests across 103 files, format/lint/TypeScript/build; `tsc -b` passes. Latest log `/private/tmp/harbor-ui-more-check.log`. Browser state/dialog/breakpoint/focus checks pass; exact coverage and remaining gaps in UI_VERIFICATION.md.
- Native dev build compiled successfully; CUA native observation remains unresolved. Browser captures prove browser composition only.
- Success: shared foundation and initial browser evidence only. Full feature migration, native/background/fallback checks, final CI, PR and CodeRabbit review remain outstanding.
