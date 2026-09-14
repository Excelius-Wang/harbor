# Notification in-flight fixes

## Goal

Fix #107 duplicate per-thread writes and directly related #108 pending-dialog dismissal using existing infrastructure.

## Current state

- Local implementation complete in the dedicated notification worktree, branch `fix/notification-inflight`, base `8cb6765`.
- Reuses TanStack Query mutation state and synchronous QueryClient guards, keeping independent threads concurrent while preventing duplicate same-thread and overlapping bulk operations. Pending dialogs retain keyboard dismissal protection; failures can retry.
- No new dependencies or native changes. The user authorized review and merge delivery; the Harbor root merge checkpoint tracks integration. Issues remain open pending merge.
- Separate #99/#101 batch is verified in the primary Harbor worktree on `fix/opportunity-refresh-state`.

## Next action

None — complete

## Verification

- Four new regressions failed before the fix; nine focused interaction/cache tests pass after it.
- pnpm check: 723 tests/143 files, format, lint, TypeScript and build pass. `/tmp/harbor-notification-check.log`.
- Thirty-two browser checks pass; two captures inspected. `docs/verification/notification-inflight/README.md` records evidence and limitations. Browser probes await Query observer rendering after an initial premature-state assertion.
- Existing hook/SQLite/bundle warnings only. No real GitHub writes or native material changes.

Success: #107/#108 fixed and verified locally.
