# Bugfix merge delivery

## Goal

Review, publish and merge the verified #99/#101 and #107/#108 fixes; verify merge contents, sync main and clean merged branches/worktrees.

## Current state

- User explicitly authorized the previous merge workflow, including commits, pushes, PRs, review fixes and merges.
- Monitor: `fix/opportunity-refresh-state` in the Harbor root, based on `8cb6765`; pnpm check 718 tests, 26 native tests/cargo check and eight browser cases passed.
- Notifications: `fix/notification-inflight` in `/Users/bytedance/Documents/Work/Code/harbor-worktrees/notification-inflight`; pnpm check 721 tests and 32 browser cases passed.
- PR #97 is unrelated and must remain untouched. Untracked issue-intake archives in the root are preserved outside these implementation commits.

## Next action

Commit the verified batches, complete two-axis review and publish the PRs.

## Verification

Existing implementation verification in docs/verification/opportunity-refresh and the notification worktree docs/verification/notification-inflight; final review/check and merge-content verification pending.

Success: Pending.
