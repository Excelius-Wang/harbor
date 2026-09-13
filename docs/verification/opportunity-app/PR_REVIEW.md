# Contribution monitor PR review

## Standards

No confirmed documented-standard or actionable smell-baseline violations. A separate correctness finding identified cross-account cached recommendation exposure.

## Spec

One account-isolation finding: recommendations from account A could remain visible after switching to B, until a new cycle reconciled ownership. All four IPC responses now filter results against the active account, and the monitor query participates in existing GitHub cache resets. Native A → disconnected → B coverage and a frontend cache-reset regression were added. Bounded follow-up review found no remaining blocker in this fix. Settings remain App-wide.

Pending-result behavior differs deliberately between the CLI and App: the App marks retained results pending and disables draft copying. The guide now explains this. No reproducible list/detail payload duplication was established; no speculative change was made.

Local review: Standards 0 violations; Spec 1 finding, fixed. CodeRabbit reviewed PR #98 at `483e23e` and returned four actionable comments; all are addressed below.

## Validation

- `pnpm check`: 714 tests / 142 files, formatting, lint, TypeScript and build pass. Log: `/tmp/harbor-pr-check-final.log`.
- Native monitor: 13 tests pass; `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` passes. Log: `/tmp/harbor-pr-native-final.log`.
- Existing browser visual evidence is reused for unchanged layout and controls; this delivery changes account-scoped response visibility and cache invalidation only. Live provider/keychain validation remains pending.

## CodeRabbit review fixes

- [Label rules](https://github.com/Excelius-Wang/harbor/pull/98#discussion_r3999914335): trim and lowercase CLI labels, reject more than 50 entries or labels longer than 100 characters. Added normalization/bounds regression.
- [Persistence growth](https://github.com/Excelius-Wang/harbor/pull/98#discussion_r3999914345): App records are bounded to the newest 10,000 within 90 days of issue updates; removed repositories and their cursors are pruned. Raw issue JSON is cleared before persistence, retaining a compact content digest for same-second deduplication. Small filtered/skip tombstones stay within the same bounds to prevent repeated processing during overlapping polling. The guide documents retention and its historical-baseline tradeoff.
- [Unreadable state](https://github.com/Excelius-Wang/harbor/pull/98#discussion_r3999914349): transactional single-row backup preserves the original serialized state, recovers only validated configuration, pauses monitoring and reports recovery. Keychain credentials remain untouched; actual database errors still surface. Four storage regressions cover valid/missing rows, invalid JSON, nested incompatibility, bounded backup and database errors. The proposed silent-default suggestion was not applied.
- [English plurals](https://github.com/Excelius-Wang/harbor/pull/98#discussion_r3999914351): i18next singular/plural variants for repository and opportunity counts, with an actual translation regression.

A bounded follow-up review caught a misplaced recovery translation key; both locales now use the correct monitor namespace and a regression checks them. No other concrete retention/recovery issue was found. The first parallel frontend/native run hit two unrelated UI timeouts; all 16 tests in the affected files passed in an isolated run. A later default-concurrency run repeated the README loading timeout, so final full verification uses `VITEST_MAX_WORKERS=2 pnpm check`, without skipping tests or modifying unrelated page code. Logs: `/tmp/harbor-pr98-focused-retry.log`, `/tmp/harbor-pr98-delivery-check.log`, `/tmp/harbor-pr98-native-final.log`.

Final local validation: 717 frontend/CLI tests in 142 files and 19 native tests; formatting, lint, TypeScript, production build and cargo check pass. Original-head CodeQL checks passed. The next remote head requires fresh checks; neither CodeRabbit findings nor a successful check status constitute merge authorization.
