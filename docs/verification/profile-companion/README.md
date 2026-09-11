# Calendar companion and green contribution palette

Implemented 2026-09-10–11 on the same uncommitted `feat/profile-readme-layout` delivery branch.
The user approved the default resident character, click encounters, teal-green calendar, and
identity → calendar → fully expanded Profile README → activity ordering. Image zoom remains absent.

## Behavior and boundaries

- An original goggle-wearing explorer is present by default in a dedicated lane below the calendar.
  It greets briefly, then sits reading; a small map-adjustment motion happens near the end of a
  14-second idle interval. The sprite lane does not cover cells, labels, metrics or README content.
- Clicking or pressing Enter/Space on a day shows its exact date/count immediately. Travel is
  650 ms, an encounter up to 900 ms, and feedback 600 ms. A newer target cancels the old sequence.
  Rest dates remain peaceful, high-contribution dates reveal a chest, and a deterministic date
  hash chooses occasional small Bug encounters. No random re-roll or clicking reward counter.
- Level is `1 + floor(past-year contributions / 100)`; progress is the remainder toward the next
  100. Only a real total increase across a level boundary triggers level-up feedback. A rolling
  year is not a permanent account XP store. No GitHub state or contribution data is modified.
- Manual pause, document visibility and calendar intersection pause timers/CSS activity; in-flight
  movement uses the browser animation pause API. New destinations cancel pending callbacks.
  Reduced motion retains static sprites, selected cells, text and controls without movement.
- Click outside the calendar, press Escape, close the detail, or switch calendar view to dismiss
  the visit. A keyboard-triggered or background refresh preserves the date/phase; clicking the
  outside Refresh control intentionally dismisses the detail like any other outside click.
- Four calendar-specific semantic green tokens replace blue intensity levels. Monthly foreground
  colors are chosen per theme: dark mid-level digits use dark text and light level 3 is slightly
  deeper green. Calculated stable foreground/background contrasts exceed 4.5:1 for dated cells.

## Evidence

The preview uses the existing real contribution/public-event snapshot via `?calendar=real`;
identity/README are synthetic. Writes remain intercepted. `matrix.js` exercises both languages,
themes and widths (900/1440), calendar-before-README ordering, default sprite, chest/rest, manual
pause, keyboard selection, refresh retention and unchanged XP after clicks. Reduced motion is
checked through computed animation/transform values. `interaction.js` adds Bug, in-flight pause,
offscreen/background pause, outside dismissal and cool/neutral/bright background captures.

Seven component tests cover immediate presence, cancellation, paused remaining time, manual and
background pause, reduced motion, real-only level growth and deterministic encounters. Existing
calendar interaction tests continue to cover month bounds, leap dates, keyboard and refresh.

The moved README and calendar initially shared sibling React keys; scoped keys fixed the browser
console warning. Lint caught a callback ref assignment during render; it now updates in an effect.
The first travel-pause probe sampled before the browser completed its pending pause operation;
the corrected probe awaits the paused animation state before measuring stationary position.

The sprite was generated with the built-in image tool; [asset and full prompt](ASSET.md).
These are browser layout/interaction checks, not a new native translucency acceptance or a live
GitHub write test. This iteration adds no dependency and changes no Rust code.

## Final results

`VITEST_MAX_WORKERS=1 pnpm check` passed 683 tests in 140 files, formatting, lint, TypeScript
and production build. Existing nonblocking `harbor-rail.tsx` hook and Vite chunk-size warnings
remain. Local delivery log: `/tmp/harbor-companion-delivery-check.log`.

All eight final matrix combinations passed without page errors. The travel pause probe measured
identical positions before/after an 800 ms wait (732.75 px); calendar and document visibility
pause and outside dismissal passed. Final screenshots wait for calendar transitions and refresh
to settle rather than capturing the temporary faded entrance frame.

- [Default resident](zh-dark-1440-idle.png)
- [Chest encounter at 900 px](zh-dark-900-chest.png)
- [Light-theme month view](en-light-1440-month.png)
- [Small Bug encounter](bug.png)
- [Chest opening feedback](open-chest.png)
- [Reduced motion](reduced.png)

No commit, PR or merge has been performed for this iteration. The previous profile work and
unrelated Cairn archives remain intact in the working tree.
