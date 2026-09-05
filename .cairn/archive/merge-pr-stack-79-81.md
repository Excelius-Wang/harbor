# Merge the open PR stack into main

## Goal

Merge PRs #79, #80, and #81 into `main` in dependency order with merge commits, preserving
the reviewed stack and leaving all three PRs merged with passing checks.

## Current state

PR #79 merged through `81d08f5`, followed by PR #80 through `3fb5a9e`. PR #81 was retargeted
to `main` after both dependencies merged, remained clean and CodeRabbit-successful, and its
reviewed head `da152cc` is included as the second parent of the final merge into `main`.

## Next action

None — complete

## Verification

GitHub reported each PR `CLEAN` with successful checks before merge. Git ancestry checks
confirmed the #79 and #80 heads in `main` before the final merge and confirmed #81's reviewed
head as the final merge parent.

Success: The reviewed heads of PRs #79, #80, and #81 are all ancestors of `main`, and no work
from the stack remains outside the integration history.
