# Workspace module loading

## Goal

Keep Harbor's dark frosted-glass content surface and recognizable page structure visible while
lazy workspace modules load, with one shared fix covering Discovery, Projects, Gists, Packages,
and Profile.

## Current state

Commit `8a2a6a1` on branch `feat/github-trending-20260905` replaces the shared centered-spinner
fallback with a responsive `harbor-content` skeleton composed from the installed shadcn Skeleton.
All five lazy workspace routes use this fallback. Gists' later data-loading state remains its own
content-specific skeleton. The fallback has a localized accessible status label and no generic
spinner.

The original delayed-module reproduction was rerun in a real browser at 2048x1280. During the
delay, the visible workspace retained the dark content material plus header, list, and detail
shapes. DOM inspection found 29 skeletons and zero spinners, and visual evidence is stored in the
ignored local artifact `output/playwright/workspace-loading/workspace-module-loading.png`.

## Next action

None — complete

## Verification

```bash
pnpm exec vitest run src/features/workspace/harbor-workspace.interaction.test.tsx
pnpm check
```

Success: the focused regression passes 2/2; the full check passes formatting, lint, 96 test files
and 435 tests, TypeScript, and the Vite production build. The browser delay reproduction confirms
the pale blank loading pane no longer appears.
