# Profile calendar feedback and readable activity

2026-09-10. Continues the same uncommitted profile delivery on `feat/profile-readme-layout`.
No image zoom was added; Profile README remains fully expanded.

## Behavior

The local calendar composition keeps existing GitHub queries and keyboard semantics without
adding a chart dependency. It uses 12 px year cells, readable month/weekday labels and a legend
aligned with the grid. Its first viewport intersection starts a 160 ms cell fade staggered over
up to 160 ms. Refreshed data retains existing cells and the selected view. Month changes use a
160 ms transition; hover/focus scales cells to 1.18 and opens the date/count tooltip. Reduced
motion removes the animations and scaling while keeping a visible focus ring and tooltip.

Month view uses a seven-column date grid with 36 px cells. Available month bounds come from
actual daily data, not the system clock. Days outside the returned range are not fabricated as
zero-count cells. The range/count label states the dates represented; the category metrics remain
explicitly labeled as past-year totals. Arrow keys follow each layout's geometry; Home/End reach
the available boundaries. Months retain one calendar Tab stop.

Activity rows separate the repository/action/number from the full title/reference. Only the
viewed user's owner prefix is omitted; other owners remain visible. Full repository identity
is available in the title. Merged PRs use a merged icon/color. Text is 14/12 px with wrapping;
missing numbers are not fabricated and timestamps preserve their datetime attribute.

## Verification

`?calendar=real&profile=no-readme` uses checked-in **read-only snapshots** from Excelius-Wang's
GitHub contribution summary and public events fetched on 2026-09-10. Identity metadata remains
the existing synthetic preview profile. Fixture data is restricted to ui-preview and never
falls through to business writes. `profile-contribution-fixture.json` preserves the supplied
levels/counts; `profile-activity-fixture.json` contains normalized public event metadata.

`matrix.js` passed EN/ZH × light/dark × 900/1440, checking:

- No document overflow; local year scrolling at narrow sizes.
- 369 entry cell animations and no replay on refresh.
- Hover tooltip, year arrow navigation, 31 August dates and month arrow navigation.
- Disabled forward navigation at the last available month.
- Reduced-motion computed animation and transform both `none`.

[Chinese month at 900 px](zh-dark-900-month.png), [English year at 1440 px](en-light-1440-year.png),
[readable activity](zh-dark-1440-activity.png), [reduced motion](reduced-motion.png).

`states.js` checks loading, empty, error and stale calendar reads and compares calendar colors
over cool, neutral and bright in-page backgrounds in both themes. These are browser layout and
in-page color checks, not new desktop-background/translucency acceptance.

Four calendar interaction tests cover leap-day/cross-year bounds, keyboard geometry, month/cell
retention on refresh and empty availability. Four activity tests cover identity/action/number
hierarchy, full external owner/reference and absent-number handling.

The first build found ES2020-incompatible Array.at calls; they were replaced with indexing.
The first keyboard test needed a jsdom ResizeObserver stub for the existing Radix tooltip.
Neither failure required changing the project target or shared UI primitives.

Final visual follow-up: neutral-background inspection found that translucent zero-level cells
could be brighter than low-contribution cells. Zero now mixes semantic foreground/background
into a stable fill. Year view initially reveals recent dates at narrow widths; weekday labels
remain outside the locally scrolling grid. [Narrow year view](zh-dark-900-year.png).
The fresh-browser final matrix measured 369 entry cell animations per view and zero replay
on refresh in all eight combinations. A previous instrumentation run accumulated two listeners;
the fresh-browser rerun removed that measurement duplication.

The final regression set includes four activity tests, including repository creation without a
branch/tag reference. An interim full run overlapped source edits and observed mismatched new test
and old translation data; the final fixed-source delivery run supersedes it.

Final delivery: `VITEST_MAX_WORKERS=1 pnpm check` passed all 676 tests in 139 files,
formatting, lint and production build. Local log: `/tmp/harbor-feedback-complete-check.log`.
Existing nonblocking `harbor-rail.tsx` hook and Vite chunk-size warnings remain.
This follow-up changes no Rust/native implementation; the prior profile delivery's native
checks remain the evidence for that unchanged code. No new dependency was installed.
