# GitHub Web parity

## Goal

Make Harbor's GitHub-native areas support complete in-app user workflows comparable to GitHub Web
before expanding Harbor-only discovery and agent features.

## Current state

Authentication, repository listing, code overview, directory traversal, text-file preview with syntax
highlighting, and a basic open-issue list use real GitHub data. Repository pagination stops at the
first 100 results; code browsing is read-only and lacks history, blame, raw/download, tags, and code
search; issue filtering and detail are shallow and mutations are absent. Both global and repository
Pull Requests are placeholders, repository Actions is a placeholder, Discover is sample data, and
the Rail checks/comments views are placeholders. The workspace shell is responsive and the long
repository content scroll regression is fixed.

## Next action

Implement the first complete Issues read workflow: queryable and paginated open/closed issue lists,
then an in-app issue conversation with metadata and timeline instead of a summary-only sheet.

## Verification

Each GitHub parity slice must use real API data, cover loading/empty/error/permission states, preserve
repository context and navigation, and complete its primary path without forcing a browser fallback.
Frontend query-contract tests, Rust mapping/client tests, and a focused desktop interaction check must
pass together with `pnpm check` and the Rust check suite.

## Decisions

- Treat GitHub-native parity as the product foundation; Discover, DeepWiki, and issue agents build on
  top of it rather than substituting for incomplete GitHub workflows.
- Measure completeness by end-to-end user jobs, not by the presence of tabs or static screens.
- Finish the already-started repository areas in this order: Issues, Pull Requests, Code depth, then
  Actions. Revisit broader repository tabs and account-wide surfaces after these core workflows.
- Reuse Octocrab, TanStack Query, shadcn/Radix, and GitHub's documented API behavior; do not duplicate
  client, cache, or component infrastructure.
