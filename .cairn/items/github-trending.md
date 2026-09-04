# GitHub trending discovery

## Goal

Restore a useful Trending entry to Harbor's Discovery workspace with real GitHub-backed repository
results, honest ranking semantics, native repository navigation, and clear loading feedback.

## Current state

Commit `0893d9b` is pushed on branch `feat/github-trending-20260905`. Stacked PR #81 targets the
glass-workspace branch at `https://github.com/Excelius-Wang/harbor/pull/81`. Discovery opens on a real
Trending tab that uses Harbor's repository-search interface with Today, This week, and This month
ranges. Background queries retain prior data through `placeholderData` and now surface `isFetching`
as an accessible 2px progress line at the top of the results pane, while first loads retain their
content-shaped skeletons. The shared shadcn Progress wrapper now supports Radix's indeterminate state
instead of translating an unspecified value fully offscreen. Its animation uses transform only and
becomes a static line under reduced motion.

## Next action

Commit and push the verified loading-feedback follow-up to PR #81.

## Verification

The new Progress and Discovery regressions failed against the previous implementation and now pass
4/4. `pnpm check` passes 96 test files and 434 tests plus the production build. Browser runtime
inspection confirms a 2px progress line with one active transform animation in normal motion and no
animation with a 65% opacity static fallback under reduced motion.

Success: first loads keep their skeletons, background loads keep existing content usable while showing
an accessible thin progress line, reduced motion has a static fallback, and all checks pass.
