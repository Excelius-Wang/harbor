# Profile layout and Profile README

2026-09-10. Implements the approved horizontal identity header, optional Profile README
fully expanded by default, contribution calendar and public activity. Connections move
into a dialog opened from the counts. Profile editing/following and external GitHub links
remain available.

The authenticated read path checks the public same-name repository, locates README.md
(case-insensitively) in its root and loads it on the default branch. Missing/private
repositories and absent/blank root READMEs return null. Other failures remain retryable;
a failed refresh retains cached content, including a previously known absence. The shared
sanitized Markdown renderer handles relative images and links against that branch.
The ordinary repository README endpoint is deliberately avoided because it can prioritize
`.github/README.md` over a valid root profile file.

## Evidence

Controlled ui-preview uses only synthetic data, never live GitHub writes.

- [Chinese dark, 900 px](zh-dark-900.png): compact identity and wrapped bio.
- [English light, 1440 px](en-light-1440-activity.png): Markdown, calendar, metrics and activity.
- [Connections dialog](zh-dark-1440-connections.png): follower/following tabs.
- [Long README end](state-long.png): full content remains available without expansion.

`matrix.js` exercised both languages and themes at 900 × 620 and 1440 × 1000:
no document overflow; keyboard-open connections, switch tabs, Escape, focus return;
calendar ArrowRight advances seven days. The original script's English `Followers`
locator failed because the actual label is lowercase; corrected before all eight passed.

`states.js` passed absent, long, loading, error/retry, stale-retained and empty README
scenarios at 900 px. Long fixtures also include a long mixed-language display name.
`connections.js` covers loading, error, empty and stale connections in the new dialog.
Run scripts with the Playwright CLI `run-code` command against `pnpm dev:ui --port 1423`.

Automated checks: four README component tests cover full rendering and relative image URLs,
absence, retry, and stale content. Rust profile tests cover nonempty root Markdown selection
and existing profile behavior. `cargo check` and seven focused native tests pass.

Limits: browser captures verify layout and in-page materials; no new native translucency
acceptance is claimed. Shared palette/window materials were not modified. Authenticated
live GitHub reads are not represented by synthetic preview results.

Final results: `VITEST_MAX_WORKERS=1 pnpm check` passed 668 tests in 137 files,
format/lint/build passed. Existing nonblocking `harbor-rail.tsx` hook warning and Vite
chunk-size notices remain. Final `cargo check` and seven `github::profile` tests passed.
The final delivery log is `/tmp/harbor-profile-delivery-check.log`; native logs are
`/tmp/harbor-profile-cargo-final.log` and `/tmp/harbor-profile-native-final.log` (local only).

All four connection states passed. The first populated-connection locator omitted the
avatar fallback from its accessible name; the corrected username matcher passed.
`navigation.js` verified selecting another user loads that user's README and returning
loads the viewer's README. [Loaded connections](connections-populated.png) and
[long identity at 900 px](long-identity.png) were visually inspected.
