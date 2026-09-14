# Opportunity refresh fixes

## Goal

Fix #99 and #101 with regression evidence while reusing existing monitor and UI infrastructure.

## Current state

- Local implementation complete on `fix/opportunity-refresh-state` in `/Users/bytedance/Documents/Work/Code/harbor`, base `8cb6765`.
- Open relevant updates retain the brief and successful check time; failures retain it, fresh results replace it, ineligible results withdraw it. Optional lastAttemptAt preserves fair retries and old saved-state compatibility.
- Interval-only changes preserve candidate analysis and pending state, scheduling from the saved new interval. Other config changes requeue as before.
- The user authorized review and merge delivery; track integration in `.cairn/items/bugfix-merge.md`. Issues remain open pending merge. Existing checkpoint modifications and intake archives preserved.
- Independent notification batch is in `/Users/bytedance/Documents/Work/Code/harbor-worktrees/notification-inflight` on `fix/notification-inflight`.

## Next action

None — complete

## Verification

- pnpm check: 718 tests/142 files, formatting, lint, TypeScript, build pass. Log `/tmp/harbor-opportunity-refresh-check.log`.
- 26 native monitor tests and cargo check pass. Log `/tmp/harbor-opportunity-refresh-native.log`. Red phase reproduced three failures before the fix.
- Eight controlled browser cases pass; screenshots inspected. Evidence: `docs/verification/opportunity-refresh/README.md`.
- No live keyring/provider or native material verification; existing hook/bundle/SQLite warnings only.

Success: #99/#101 fixed and verified locally; independent notification work continues.
