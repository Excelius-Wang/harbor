# Demote the GitHub Trending web link to a fallback

## Goal

Keep the Discovery Trending header focused on its period filter, while preserving a clearly
labelled GitHub web fallback in the Trending error and empty states.

## Current state

The persistent GitHub Trending action has been removed from the Trending header. Trending
error and empty states now expose the localized `View on GitHub` fallback, while the header
retains only the period selector. Focused interaction coverage verifies the placement and URL.

## Next action

None — complete

## Verification

```bash
pnpm exec vitest run src/features/github/github-discovery-view.interaction.test.tsx
pnpm check
```

Success: The focused test passed 6/6, and the full frontend check passed 98 files / 446 tests,
lint, formatting, TypeScript, and production build on 2026-09-05.
