# Repository contribution agent

## Goal

Validate the first monitor-to-recommendation workflow inside Repolane, with a path to later contribution automation. Long-term scope: [product brief](../../docs/REPOSITORY_CONTRIBUTION_AGENT.md).

## Current state

- The user approved the minimal discovery/recommendation stage, then the second page concept, and authorized App integration. Claim posting, automated coding and PR submission are not part of this stage.
- Working area: Harbor repository, branch `feat/opportunity-app`, rebased onto `origin/main`, excluding the separate open archive PR #97. The user authorized committing, pushing and opening a PR, including review-tool feedback fixes. Implementation and account-isolation review fixes are verified and ready for PR publication.
- Implemented the Contribution opportunities navigation entry, compact list/detail page, EN/ZH configuration Dialog, native start/pause/check actions, historical screening, filters and copyable claim drafts. Narrow detail return retains scroll, filters and focus. Short-window settings now have a bounded scroll viewport and a reachable Save footer.
- `src-tauri/src/opportunity/` owns background polling, cancellation, saved cursors, rules/model analysis, SQLite persistence and endpoint-scoped system keyring access. It reuses App GitHub OAuth. Logout pauses monitoring; hiding the window does not stop the process, quitting does. Enabled monitoring resumes on next launch.
- `pnpm monitor` remains available as an independent CLI. Its database is separate; there is no CLI history migration. App users do not need Node. No GitHub write operation is implemented by either monitor.
- Usage: [monitor guide](../../docs/OPPORTUNITY_MONITOR.md). Actual screenshots, reproducible browser scripts and verification scope: [App integration evidence](../../docs/verification/opportunity-app/README.md).
- Real target repositories and model credentials remain unspecified. No real monitor was started and no actual model/GitHub end-to-end evaluation or system-keyring interaction was performed. Controlled browser preview uses port 1437 and synthetic fixtures; it is not a live monitor.

## Next action

Publish the contribution-monitor PR and address CodeRabbit/Copilot feedback on its latest commit.

## Verification

- PR preparation: 714 frontend/CLI tests and 13 native monitor tests pass; TypeScript, lint, formatting, production build and cargo check pass. Local two-axis review found one account-isolation bug, fixed with regressions. See `docs/verification/opportunity-app/PR_REVIEW.md`.

- User-approved global scrollbar rollout is complete: shared Radix vertical/horizontal 3 px thumbs retain pointer targets; native overflow uses a 9 px transparent track and 3 px visual thumb. Filter overrides removed and settings clearance preserved. Eight shared-control cases plus eight settings cases pass. `pnpm check` passes 713 tests/142 files; log `/tmp/harbor-shared-scrollbar-check.log`. Representative browser coverage and OS auto-hide limits are recorded in the App evidence README.

- Settings scrollbar follow-up: 20 px right content padding yields a measured 10 px track gap; a 3 px visual thumb retains the existing 7 px drag target. Eight browser combinations verify dragging and Save. Actual capture and regression are in the App evidence directory.
- `pnpm check`: 713 tests / 142 files, formatting, lint, TypeScript and production build pass. Final log: `/tmp/harbor-opportunity-scrollbar-check.log`. Six new UI tests and the prior 18 CLI tests pass.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml opportunity:: --lib`: 12 native tests pass. `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` passes. Logs: `/tmp/harbor-opportunity-app-native-tests-final.log`, `/tmp/harbor-opportunity-app-cargo-final.log`.
- Browser: 8 baseline theme/language/width combinations; 48 additional setup/empty/pending/stale/long/failure combinations; 8 short-dialog save/reopen cases. Eight initial-error/retry combinations, loading, dense scroll return, keyboard filters and intercepted external links were also exercised. Persisted results are in the evidence directory.
- The first online Cargo registry attempt failed with a connection reset; offline cached resolution succeeded. rusqlite defaults are disabled, keeping the dependency addition minimal and preserving existing lockfile resolutions.
- A short-dialog footer overlap and subsequent zero-height viewport were corrected. Final browser regression asserts noncollapsed viewport height and successful save/reopen. Run browser scripts sequentially: concurrent scripts against one session contaminated an intermediate check; isolated final passes succeeded.
- Existing unrelated hook/bundle warnings and the CLI's SQLite experimental warning remain. Global palette and native window material were not changed; browser captures do not establish desktop translucency acceptance.

Success: App integration and isolated behavior are implemented and verified. Live provider/repository validation and the long-term product remain pending.
