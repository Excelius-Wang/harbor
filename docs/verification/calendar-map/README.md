# Contribution calendar map — 2026-09-11

The approved B traveler with C movement now lives directly on contribution dates. The separate
companion stage is removed. Year mode uses a 32 px sprite box; month mode uses a 48 px box and
48 px date tiles with top-left numbers. The image uses actual RGBA transparency and frame-based
walking, greeting, crouching and tool swings. [Asset and prompts](ASSET.md).

## Behavior

- Grid-relative offset geometry keeps sprites attached during horizontal scrolling and resize.
- The sprite portal is aria-hidden and pointer-transparent. Native date buttons retain keyboard
  activation, focus, tooltip, selected state and a live date/count summary; digits paint above art.
- Selected-date tooltips show date, contributions and encounter. They yield to the badge menu.
- A header badge opens level/progress, pause/resume and clear-date controls in the shared Popover.
- Date encounters stay deterministic: zero contributions rest, highest intensity chest, other
  dates explore or meet a Bug. Four walking frames and two swing poses add actual pose changes.
- New clicks replace destinations. Refresh retains selection. Annual contributions alone control
  levels (100 contributions per level), with no click experience or business writes.
- Manual, grid-offscreen and document-background pause preserve remaining action time and stop
  in-flight position transitions. Reduced motion shows static feedback.
- The calendar remains above the fully expanded README; statistical-image zoom is not added.

## Verification

`VITEST_MAX_WORKERS=1 pnpm check` passed: 684 tests in 140 files, formatting, lint, TypeScript
and production build. Existing nonblocking `harbor-rail.tsx` hook and large-bundle warnings
remain. Log: `/tmp/calendar-map-check.log`. Eight companion tests plus four existing calendar
tests cover timing, replacement, real-only levels, visibility, reduced motion, portal placement,
month bounds, keyboard and refresh. This iteration changes no Rust or dependencies.

[Browser matrix](matrix.js) passed English/Chinese × light/dark × 900/1440 px, with no page
errors. Selected-date x/y alignment error was 0 px in all eight runs. Checks cover the actual
grid portal, no old stage, pointer transparency, manual pause, keyboard selection, refresh
retention, unchanged XP, README order and no document overflow. Reduced motion reports
`animation: none` and `transform: none`. Log: `/tmp/calendar-map-matrix-settled.log`.

[Interaction checks](interaction.js) passed with a long-name/long-README fixture: Bug and
opening chest, year scroll from 4 to 256 px, rapid target replacement, resize, offscreen pause,
outside dismissal and simulated document visibility. In-flight x/y were identical across an
800 ms pause (774.838 px / 95.8099 px). Chest lid had a non-identity transform during opening.
Log: `/tmp/calendar-map-interaction.log`.

One earlier browser run was interrupted by a development HMR page reload and discarded. The
final matrix ran after source stabilization. Screenshots wait for refresh and entrance feedback
to settle. Earlier profile loading/error/empty/stale evidence applies only to unchanged query
boundaries; the new sprite lifecycle is covered here. Browser observations do not establish
native desktop translucency or live GitHub API acceptance.

## Screenshots

- [Year map, Chinese dark](zh-dark-1440-year.png)
- [Month map at 900 px, Chinese dark](zh-dark-900-month.png)
- [Month map at 900 px, English light](en-light-900-month.png)
- [Companion menu](zh-dark-1440-menu.png)
- [Chest opening](chest.png)
- [Bug encounter](bug.png)
- [Reduced motion](reduced.png)

All changes remain uncommitted on `feat/profile-readme-layout`; no push, PR or merge was
performed. Previous profile work and unrelated Cairn archives are preserved.
