# 3D contribution calendar

## Goal

Deliver the approved inline 3D contribution calendar with a smaller companion standing on the selected column top and short hop/fade transitions.

## Current state

- Implemented, verified and published as [PR #115](https://github.com/Excelius-Wang/harbor/pull/115), from `feat/contribution-calendar-3d` to `main`. Implementation commit: `fd726f9`. The unrelated checkpoint commit `9400e4f` remains on `docs/tidy-delivery-checkpoints` and is excluded from this PR.
- Reserved lanes removed. Year/month residents are 18/24 px, with feet and contact shadow anchored to the selected cap. Nearby dates hop, distant dates fade; rapid selection replaces travel, background pause and reduced motion are supported. Chest/bug encounters are restored: annual event marks, monthly cap objects, short actions after arrival, session-only unique explored-date count including zero days. Flat behavior is preserved.
- Evidence: [calendar verification](../../docs/verification/calendar-3d/README.md). Preview uses port 1439 with intercepted calls. No native changes or preview writes to GitHub business data. User approved the result and PR publication; native translucency acceptance is not claimed.
- Unrelated pre-existing `README.zh-CN.md` header deletions remain untouched.

## Next action

None — complete

## Verification

- `pnpm check`: 751 tests / 145 files, formatting, lint, TypeScript and build pass. Log: `/tmp/harbor-review115-check.log`. Existing warnings are recorded in the evidence README.
- Eight EN/ZH/theme/width encounter cases and supplementary background-pause, duplicate-count, zero-day and hover checks pass. Foot anchors align within 1 px. CodeRabbit test follow-up reran all 32 state cases and movement checks, requiring date buttons and an observed paused animation. Prior dense checks and screenshots apply to unchanged application code.
- Browser harness uses visible SVG tops, arrow expressions without trailing semicolons and acknowledged animation pause before sampling. Avoid Vite reloads during matrix runs.

Success: Rooftop encounters restored, verified and submitted in PR #115. Merge is not part of this delivery.
