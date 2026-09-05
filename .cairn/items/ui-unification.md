# Harbor UI unification

## Goal

Execute `/private/tmp/harbor-ui-refactor-handoff.md`: migrate all owned UI, verify browser and native appearance, deliver an unmerged PR, and fix/recheck actual CodeRabbit feedback on the final commit.

## Current state

- Workspace `/Users/bytedance/Documents/Work/Code/harbor`; branch `refactor/unified-harbor-ui`, based on `03709c2`.
- Existing user trending implementation/filter workflow committed separately as `af1af2f`. Pre-task tracked diff: `/private/tmp/harbor-ui-preexisting.patch`; original untracked list: `/private/tmp/harbor-ui-preexisting-untracked.json`. Existing unrelated `.cairn/archive/*` files remain uncommitted and must be preserved.
- Shared foundation committed as `826d04b` (unmerged/unpushed).
- Repository/Issue/PR batch now migrated: shared page headers/stale notices, stable reading/editor/code fills, result-row/metadata density, breadcrumb wrapping and per-query list scroll recovery. `docs/UI_VERIFICATION.md` has exact evidence and limits. Current batch awaits commit after passing checks.
- Shared `NavigationButton` extracted, all primary/More/account/settings consumers migrated. Shared CSS palette, neutral selection, control surfaces, menus/dialogs/sheets/tooltips/toasts updated. `ThemeProvider` responds to reduced transparency. UI primitives now own material defaults; page overrides still need a complete audit.
- `docs/UI_MIGRATION_CHECKLIST.md` is the complete starting inventory; most feature render/state rows are pending. `docs/UI_COMPONENTS.md` documents the gallery, fixtures and implementation status. Gallery is at `/ui-components` in development only.
- `pnpm dev:ui --port 1423` serves a separate preview entry via a Vite pre HTML transform. It intercepts business IPC; unknown calls fail. Discovery, repository/code, Issue/PR core read fixtures exist in `src/dev/workspace-fixtures.ts`; other pages/advanced actions are not implemented. `state=stale` supports retained-result refresh checks. Unknown writes still fail. Production build excludes preview entry/fixtures. Browser-only backgrounds do not cover the native desktop.
- Vite preview exec session 55826 on 1423; prior 1422 session 11750 and pre-existing 1420 server left intact. Playwright `uiqa` (headless) and `default` (headed) sessions exist. If headed screenshot hangs, `page.bringToFront()` resolved it; do not restart solely on capture timeout.
- Native preview compiled with `/private/tmp/harbor-ui-native-preview.json` (identifier `com.harbor.ui-preview`, devUrl 1423). First launch without isolation exited due the pre-existing single-instance app. Isolated direct process was stopped after wrapping its current debug binary in `/private/tmp/Harbor UI Preview.app`; wrapper PID 50522 was verified live, but CUA `getApp` repeatedly timed out. Original dev process PID 73725 is untouched. Native visual verification is NOT done.
- Screenshots: `output/playwright/ui-before-populated-*`, `ui-material-populated-*`, gallery light/dark controls/dialogs/command, and final-current discovery 12-image matrix `ui-discovery-{light,dark}-{cool,neutral,bright}-{900,1440}.png`. Matrix uses English synthetic records at 900×620 / 1440×900; gallery uses Chinese. Final screenshots must be made remotely accessible in PR.
- CodeRabbit integration verified through actual bot reviews and successful status on PR #81; this is NOT review of the current branch.
- No PR created. Origin `Excelius-Wang/harbor`; no PR template/CodeRabbit config at startup, only release workflow. Need create/check necessary CI and actual CodeRabbit review after full migration.

## Next action

Migrate and render Notifications, profile/account and More pages (Projects, Gists, Packages), extending only their controlled read fixtures and carrying remaining advanced repository/action and native acceptance gates forward.

## Verification

- Baseline `pnpm check` passed 454 tests + build; `cargo check --manifest-path src-tauri/Cargo.toml` passed (logs `/private/tmp/harbor-ui-baseline-{check,cargo}.log`).
- Shared-layer `pnpm check` passed 457 tests across 100 files, formatting, lint, TypeScript and build (`/private/tmp/harbor-ui-shared-check.log`). Vite pre-transform order and the clipped English discovery time filter were corrected before the final passing check; curl confirmed 1423 serves `/src/dev/preview-main.ts` while 1420 serves `/src/main.tsx`. The 12-image fixture matrix was recaptured.
- Repository batch `pnpm check`: 458 tests across 101 files plus format/lint/TypeScript/build pass (`/private/tmp/harbor-ui-pages-check.log`). Browser 900×620 / 1440×900 light/dark core matrix, Chinese loading/empty/error, stale retained rows, filter return and nonzero scroll restoration checked. Initial detail captures included loading; see verification record for scope, do not count them as final populated acceptance.
- Native dev build compiled successfully; CUA native observation remains unresolved. Browser captures prove browser composition only.
- Success: shared foundation and initial browser evidence only. Full feature migration, native/background/fallback checks, final CI, PR and CodeRabbit review remain outstanding.
