# GitHub trending discovery

## Goal

Restore a useful Trending entry to Harbor's Discovery workspace with real GitHub-backed repository
results, honest ranking semantics, native repository navigation, and no return to deterministic mock
data.

## Current state

Commit `0893d9b` is pushed on branch `feat/github-trending-20260905`. Stacked PR #81 targets the
glass-workspace branch at `https://github.com/Excelius-Wang/harbor/pull/81`. The original shell's
Trending, For You, and Collections tabs were backed only by deleted `mock-data.ts`; commit `52b89cd`
replaced that shell with real GitHub developer-feed and global-search workflows but left the old
translation keys unused. GitHub documents the Trending web page without publishing a corresponding
REST endpoint. Discovery now opens on a real Trending tab that reuses Harbor's bounded repository
search interface: Today, This week, and This month select a `created:` window, exclude forks and
archives, and sort descending by stars. The result header states those semantics, and a separate
button opens GitHub's canonical Trending page for its private ranking. Existing Following and global
search tabs remain intact, and obsolete mock-only translations are removed.

## Next action

None — complete.

## Verification

The focused Discovery interaction and query suite passes 48/48 after the new interaction test failed
against the previous feed-only default. `pnpm check` passes 95 test files and 432 tests plus the
production build. A live GitHub Search request returned current, non-fork, non-archived repositories
in descending star order for the weekly query. Browser layout review passes at 1200×760 and 900×620;
the compact page has no body or header overflow, and tab overflow remains scrollable without native
scrollbars.

Success: Discovery opens on a clearly labelled Trending tab, loads recent repositories from GitHub
through the existing search interface, exposes period choices and the canonical GitHub Trending
fallback, preserves feed/global search, and passes all checks.
