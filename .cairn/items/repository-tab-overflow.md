# Repository tab overflow — PR delivery

## Goal

After PR #94 delivery, remove the repository tab strip's vertical overflow and intrusive scrollbars while keeping all tabs reachable by pointer, trackpad and keyboard.

## Current state

- Primary Harbor checkout, branch `fix/repository-tab-overflow`, based on merged `396784e`. The user now authorizes commit, PR, CodeRabbit-driven fixes and merge. Local implementation is verified.
- github-repository-tabs.tsx now composes local Tabs/Buttons/Tooltips with a 40 px strip, contained selection line, hidden native scrollbars, conditional scroll buttons and active-tab reveal. English/Chinese labels are added. Shared Tabs/material/native code is unchanged.
- Browser regression proves 36/40 before and 40/40 after. Twelve theme/language/size combinations and external-repository checks produce 54 final captures. Native 1200 × 760 before/after and Home/End observations pass. Evidence and limitations are in docs/UI_VERIFICATION.md and docs/verification/repository-tabs/README.md.
- Final single-worker pnpm check passes all 660 tests/135 files and formatting/lint/type/build. Earlier fork/Pages test timeouts pass in isolated recheck without changing code or timeouts. Existing hook/bundle warnings remain.
- Temporary browser/native preview sessions and servers on 1423/1428 are stopped. No OS preference changed. Preserve unrelated checkpoint archives and the pre-existing app development process.

## Next action

Create the PR and resolve actual CodeRabbit findings before merging.

## Verification

- /tmp/harbor-repository-tabs-final-check.log: complete pnpm check passes.
- output/playwright/repository-tabs/{matrix,extra}-results.json: all browser combinations pass; raw scripts/captures and red/green logs are preserved.
- Native screenshots show the original double scrollbar removed; Settings remains visible when selected with End, and Home returns to Code. Native resize drag was unavailable; 900/1440 exact-size evidence is browser-only.
- git diff --check and new documentation link/image checks pass.
- Success: the authorized local tab-strip repair and applicable verification are complete; PR #94 delivery was completed first.
