# Window shell refinement

> Historical snapshot: delivery and uncommitted-work statements below describe the
> checkpoint when it was recorded, not the current branch. These records were included
> in [PR #84](https://github.com/Excelius-Wang/harbor/pull/84); see the
> [current checkpoint](../items/ui-follow-up.md) for live delivery status.

## Goal

Deliver the current fixed-size window, Logo navigation toggle and restrained outer edge for user preview.

## Current state

- Complete locally on `feat/window-navigation-toggle` from `74c396b`; no new commit/PR. Existing uncommitted window/navigation work, AGENTS branch policy and Cairn archives are preserved.
- Window defaults to 1200 × 760 logical units with work-area clamping. The existing Logo toggles the 226/58 px navigation and saves the choice.
- Outer CSS shadows/highlights are removed; WindowFrame/TitleBar use the shared 10 px radius matching the native effect. The semantic border and internal material stay intact. See `docs/UI_COMPONENTS.md` and `docs/UI_VERIFICATION.md`.
- The agent reviewed browser before/after views in both themes over cool/neutral/bright backgrounds and native dark active/inactive captures. Corner wedges and doubled highlights are gone. The running isolated native preview is available for user inspection.

## Next action

None — complete

## Verification

Latest `pnpm check`: 610 tests/127 files, formatting, lint, TypeScript and Vite build pass (`/tmp/harbor-window-edge-check.log`). Prior four Rust window geometry tests and cargo check pass; native code is unchanged by the edge refinement.

Twelve before/after browser combinations assert one border, 10 px radius and no CSS shadow. Reduced-transparency styles pass. Native active/inactive screenshots and self-review are documented in `docs/UI_VERIFICATION.md`. Native light/exhaustive desktop-background material acceptance remains outside this scope.

Success: implemented, tested and self-reviewed window-shell preview is ready for the user. Changes remain uncommitted.
