# Repository summary layout — delivery

## Goal

Implement the user-approved repository mockup: compact summary rows and a full-width description with separate actions, verified at 900/1440 in both themes/languages.

## Current state

- Primary Harbor checkout, branch `fix/repository-summary-layout`, based on `d7ca6e4`. Implementation and documentation are locally verified. The user now authorizes commit, PR creation, CodeRabbit review, fixes and merge, followed by a separate tab-strip repair.
- Repository name/owner rows, two-line summaries, neutral selected fill, matching skeletons, full-width bounded description expansion and responsive header actions are complete. Translations and the design contract are updated.
- Production browser fixtures verify 32 layout and 48 state scenarios; final pnpm check passes 660 tests/135 files. Evidence is in docs/UI_VERIFICATION.md and docs/verification/repository-layout/README.md; raw scripts/captures/results are in output/playwright/repository-layout.
- Preserve pre-existing README/UI checkpoint archive changes. No global material/native/business behavior changed. Temporary QA browser and port 1423 are stopped; the pre-existing app development process is untouched.

## Next action

Create the PR and resolve actual CodeRabbit review findings before merge.

## Verification

- `VITEST_MAX_WORKERS=2 pnpm check`: /tmp/harbor-repository-layout-final-check.log; 660 tests, formatting, lint, typecheck and build pass. Existing hook/chunk warnings only.
- `matrix.js` and `states.js` through playwright-cli: 8 layout combinations and 48 state scenarios pass. Full result manifests are alongside the scripts; selected screenshots were inspected.
- `git diff --check` and new documentation image/link checks pass.
- Success: approved local layout implementation and applicable browser/check verification are complete. External delivery is now authorized and pending.
