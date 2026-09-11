# Calendar code review — 2026-09-11

Scope: the uncommitted calendar-map outcome on `feat/profile-readme-layout`, including full
untracked calendar/companion components and their tests, and relevant tracked stylesheet changes
against HEAD `f2b5fb3809e20f773a90b8be4f13c0926ae01675`. Previous Rust/Profile work was not re-reviewed. Two read-only review agents
examined standards and spec independently; the parent reproduced and fixed the findings.

## Standards axis

**P2 — Same-width rolling-year refresh left the sprite on an adjacent week.** The selected date,
map node and dimensions remained stable while its column changed. Measurement only depended on
map/date/period and ResizeObserver. The companion now receives a week-layout revision and
remeasures without resetting the visit request or encounter phase.

One concrete standards finding, fixed. No additional tooling-independent hard violations or
confidently actionable code-smell findings in the scoped review.

## Spec axis

**P2 — Rolling-year attachment failure.** Same finding as the standards axis, fixed by layout
revision tracking. This preserves the approved date-map attachment through refresh.

**P2 — Leftward movement faced right.** ResizeObserver's initial notification repeated the same
coordinates after a leftward target update and overwrote facing with +1. Facing now changes only
when x changes. Browser reproduction returned `scaleX(1)` before and `scaleX(-1)` after the fix.

**P2 — Selected-date tooltip blocked other hovered dates.** Deriving hover state from Radix's
open/close notifications conflicted with the selected tooltip reopening. The parent reproduced
selecting September 6 then hovering February 1 while September details remained. Pointer/focus
ownership is now explicit, with selected date as fallback. Keyboard focus, Escape and menu
suppression retain their behavior.

**P3 — Sunday sprites overlapped month labels.** Browser inspection confirmed a standing sprite
on September 6 intersected the September text. The year header row now reserves 32 px rather
than 20 px in both week columns and the weekday gutter. Final measured sprite-box/text clearance
is 1.640625 px; actual opaque pixels have additional inset.

Four spec findings, all fixed (one overlaps the standards finding). Highest severity within
each axis is P2. No additional high-confidence lifecycle/accessibility failures found.

## Verification

- Three new regressions failed before the fixes: stale x=106 instead of 90, facing +1 instead of -1,
  and selected January 7 tooltip instead of hovered January 17. All now pass.
- Focused calendar tests: 15 passing. `/tmp/calendar-review-green.log` and
  `/tmp/calendar-review-focused-final.log`.
- `VITEST_MAX_WORKERS=1 pnpm check`: 687 tests in 140 files, formatting/lint/type/build passed.
  `/tmp/calendar-review-check.log`. Existing nonblocking hook and bundle-size warnings remain.
- [Browser review script](review.js): English/Chinese × light/dark × 900/1440, no page errors.
  Leftward facing, hovered/focused date text, Escape, menu tooltip suppression, month hover,
  reduced motion and label clearance passed in all 8 cases. `/tmp/calendar-review-browser.log`.
- [Chinese dark 900](zh-dark-900.png), [English light 1440](en-light-1440.png).
  [Hover reproduction after ownership fix, before spacing fix](hover-full.png) records the
  remaining label overlap before the final 12 px spacing correction.

No Rust changes, external writes, commit or PR performed. Prior verification applies only to
unchanged behavior. This is a focused review and browser verification, not a guarantee of no
remaining bugs or new native-translucency acceptance.
