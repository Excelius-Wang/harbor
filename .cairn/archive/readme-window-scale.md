# README rendering and reading scale

## Goal

Render GitHub README content faithfully and safely inside Harbor, keep the repository list fully
usable, and make the default desktop workspace comfortable for sustained reading at 1.25 times the
previous window size.

## Current state

GitHub README content now uses `react-markdown`, `remark-gfm`, `rehype-raw`, and `rehype-sanitize`.
Common presentation HTML such as centered logo blocks, linked badges, and line breaks renders as
React elements; the GitHub-style sanitizer removes scripts, event handlers, and unsafe protocols.
Relative links resolve to repository blob routes and relative images resolve to raw routes. Images
load lazily without a referrer. The renderer is lazy-loaded so the home chunk is 169.90 KB instead of
absorbing the 336.01 KB README renderer. The main window starts at 1600x1000. At 1536px and wider the
repository column is 360px, descriptions use two lines, and the repository scrollbar stays visible.

## Next action

None — complete.

## Verification

`pnpm check` passes with 14 frontend tests. Rust formatting and checks pass with 33 tests passing and
one external DeepWiki test ignored. The production build has no large-chunk warning for the home
workspace. A deterministic Playwright fixture confirms raw HTML is not escaped, three images render,
center alignment survives, and no script executes at 1280x800 and 1600x1000 in dark and light modes.
At 900x620 the document has no outer overflow; 70 repositories reach the last row at scroll position
4,957, and the README reaches its final section at scroll position 1,032.

## Decisions

- Preserve Harbor's existing cool glass system, navigation, and single cyan accent.
- Use maintained unified plugins and a GitHub-style sanitizer instead of a custom parser.
- Increase the default frame to 1600x1000 and relax reading density; do not scale the UI by 1.5.
- Keep the 900x620 minimum supported and lazy-load the heavier README pipeline.
