# Harbor UI follow-up

## Goal

Complete the six authorized frontend acceptance batches with applicable evidence, passing checks, actual CodeRabbit review, verified merges and branch cleanup. Preserve agreed design and unrelated work; no releases or real GitHub business writes.

## Current state

- Primary main is 5218495. Rules #87 and frontend batches #88–#92 are merged, final content verified and owned branches/worktrees cleaned. Preserve unrelated README checkpoint deletion/archive and historical branches/worktrees.
- Final PR #93 uses fix/shared-native-acceptance in /tmp/harbor-shared-acceptance-20260909. Four nested main landmarks are removed. Native QA reproduced accumulated macOS vibrancy layers; the new main-thread command clears all old layers and applies one, or none for reduced transparency. Existing CSS tokens remain unchanged.
- Final checks and 80 browser / 48 native scenarios pass. Selected images are under docs/verification/shared-native; raw files are preserved in primary output/playwright/native-final. User explicitly authorized preview-only AppleScript/screenshots/background QA. Original wallpaper/accessibility preferences are restored after QA.
- Actual CodeRabbit review and final-head CI remain required for #93, followed by merge verification and owned branch/worktree cleanup. Historical code-edit/branch/comment write-state extensions remain out-of-scope follow-up for this six-batch closeout.

## Next action

Obtain actual CodeRabbit review of final #93, resolve valid findings and complete final checks, verified merge and owned branch cleanup.

## Verification

- Earlier batches: Issue 400 scenarios/626 tests; Discussion 248/641; Pages 224/650; Transfer 264/658; Recent 1056/659. Delivery SHAs and actual review evidence are in docs/UI_MIGRATION_CHECKLIST.md and docs/UI_VERIFICATION.md.
- Shared: /tmp/harbor-shared-native-final-check.log (660 tests, formatting/lint/build); 32 landmark and 48 browser media scenarios. Native: 48 final captures; /tmp/harbor-native-material-{tests,layout-tests,check,build}.log (3 appearance +4 geometry tests, cargo check/build).
- Success: applicable local verification passes; overall delivery is not complete until #93 actual review, final CI, verified merge and cleanup.
