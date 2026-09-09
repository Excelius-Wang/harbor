# Agent workflow clarity

## Goal

Optimize AGENTS.md for sustained authorized frontend work without weakening design constraints.

## Current state

- On `docs/agent-workflow-clarity`, based on `a3f2594`; documentation changes are verified and included in the dedicated local workflow commit.
- AGENTS.md clarifies Repolane/Harbor naming, delivery batches, session authorization,
  blocker handling, impact-based verification, and explicit Cairn task selection.
- Detailed layout contracts moved unchanged into docs/UI_DESIGN_GUIDE.md; its Markdown
  formatting was normalized. Existing visual direction and native acceptance requirements remain.
- Pre-existing README checkpoint archival changes were preserved. The root retains no current item.
- The 2026-09-09 session authorized a dedicated local commit of these rules and this checkpoint. No push, PR, merge, or release is included.

## Next action

None — complete

## Verification

- `pnpm exec prettier --check AGENTS.md docs/UI_DESIGN_GUIDE.md` passes.
- `git diff --check` passes.
- Local Markdown links resolve; whitespace-normalized comparison confirms all moved layout
  contracts are preserved. Content review confirms branch cleanup and external-write boundaries.
- No application code changed; application tests and visual acceptance are not applicable.

Success: workflow documentation is updated and verified locally.
