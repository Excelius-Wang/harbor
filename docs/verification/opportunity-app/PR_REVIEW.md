# Contribution monitor PR review

## Standards

No confirmed documented-standard or actionable smell-baseline violations. A separate correctness finding identified cross-account cached recommendation exposure.

## Spec

One account-isolation finding: recommendations from account A could remain visible after switching to B, until a new cycle reconciled ownership. All four IPC responses now filter results against the active account, and the monitor query participates in existing GitHub cache resets. Native A → disconnected → B coverage and a frontend cache-reset regression were added. Bounded follow-up review found no remaining blocker in this fix. Settings remain App-wide.

Pending-result behavior differs deliberately between the CLI and App: the App marks retained results pending and disables draft copying. The guide now explains this. No reproducible list/detail payload duplication was established; no speculative change was made.

Local review: Standards 0 violations; Spec 1 finding, fixed. Remote review-tool feedback will be recorded after PR creation.

## Validation

- `pnpm check`: 714 tests / 142 files, formatting, lint, TypeScript and build pass. Log: `/tmp/harbor-pr-check-final.log`.
- Native monitor: 13 tests pass; `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` passes. Log: `/tmp/harbor-pr-native-final.log`.
- Existing browser visual evidence is reused for unchanged layout and controls; this delivery changes account-scoped response visibility and cache invalidation only. Live provider/keychain validation remains pending.
