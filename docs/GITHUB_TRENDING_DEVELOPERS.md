# GitHub Trending Developers

Discover > Trending has repository and developer tabs sharing the daily, weekly, and monthly
period selector. Repository results retain the existing search of recently created public
repositories sorted by total stars. Developers use the official public ranking at
`https://github.com/trending/developers?since=weekly` (with the selected period).

Developer rankings also support a searchable programming-language picker and a sponsorable-only
checkbox. They request the corresponding GitHub ranking, rather than filtering an already
downloaded list. For example, Python and sponsorship together use
`https://github.com/trending/developers/python?since=weekly&sponsorable=1`.

## Data boundary

`GitHubTrendingClient` in `src-tauri/src/github/trending.rs` isolates the public-page transport
and parser. The `github_list_trending_developers` command accepts a typed period, an optional
language slug, and an optional sponsorship flag. It returns rank, login, display name, optional
avatar, optional popular repository, and the language catalog. It does not load
or send account credentials, cookies, or private repository information.

The request has a 20-second timeout, a 2 MiB response limit, an HTML content-type check, and no
redirects. `scraper` parses the document off the async executor. Identity and repository paths
are validated; avatars are restricted to GitHub's HTTPS avatar host. The frontend receives
plain data and renders text through React.

Language slugs are validated and encoded as a single URL path segment, including names such as
C# and C++. Language choices come from GitHub's own menu. GitHub omits the selected language
from that menu, so the parser also reads the canonical URL and selected-language summary.

This adapter depends on GitHub's public HTML structure. Missing or malformed ranking rows fail
explicitly, including login/challenge pages. An empty ranking is accepted only when GitHub's
specific empty-state heading and language catalog are present.
The interface provides retry without a separate GitHub ranking shortcut. A failed refresh
retains the previous rows with a visible warning.

## Interface behavior

- The searchable language picker uses Harbor's compact filter-menu styles: 13 px regular text,
  28 px rows, a transparent inner surface, and a quiet scrollbar. The trigger uses a single down
  chevron. Unknown languages have a localized label and remain searchable in the current locale.
- Query keys include the period, language, and sponsorship flag; results remain fresh for five
  minutes. Changing any condition shows the matching cached list or a skeleton. Late responses
  for old conditions cannot replace the current ranking.
- Developer selection opens the existing in-app profile. Returning preserves the selected
  tab, period, both filters, and cached ranking. Clearing filters resets language and sponsorship
  while retaining the period. Popular repository links explicitly open GitHub.
- The desktop runtime performs all fetching. Browser preview presents the desktop-only state.
- Flat result rows, theme tokens, system fonts, and shadcn controls follow root `AGENTS.md`.
  At every width, the popular repository and description sit beneath the developer's identity,
  beside a 40 px avatar. The account wraps below the name when needed; descriptions are limited
  to two lines and a 72 ch reading width. Skeletons follow the same grouping.
- Repository labels omit the owner only when it matches the developer (case-insensitive).
  Full repository names remain available to assistive technology and in the title tooltip;
  external links retain the actual repository URL.

## Verification

- Parser/transport tests: `cargo test --manifest-path src-tauri/Cargo.toml github::trending`.
- Explicit public-network smoke test: `cargo test --manifest-path src-tauri/Cargo.toml live_trending_developers -- --ignored`.
- Filtered public-network check: `cargo test --manifest-path src-tauri/Cargo.toml live_trending_developer_filters --lib -- --ignored`.
- Interaction tests: `pnpm exec vitest run src/features/github/github-discovery-view.interaction.test.tsx src/features/github/github-trending-developers.interaction.test.tsx`.
- Full checks: `pnpm check` and `cargo test --manifest-path src-tauri/Cargo.toml`.

The single-column layout was inspected with Playwright in both themes at 900, 1100, and 1440 px
widths, including the 900 × 620 minimum window. Author, repository, and description remain
grouped and aligned at every size, with no horizontal overflow or clipped controls. Additional
fixtures verified account wrapping, long unbroken descriptions, missing projects/descriptions,
and same-owner versus different-owner repository labels. Keyboard focus moves from the author
to the repository, whose URL remains unchanged.

Matching skeletons, period loading, profile return, independent list scrolling, refresh
failure/retry, and keyboard tab switching passed. The two focused interaction test files passed
all 13 tests, including combined filters and list-to-profile return; ESLint and the frontend production build also passed. Browser checks use the actual
React components with an isolated IPC substitute and public GitHub ranking snapshots; native
macOS glass effects and authenticated requests are outside that check. Local screenshots and
measured results are in the Git-ignored `output/playwright/` directory.

Filter-specific verification passed in both themes at 1440 × 900 and 900 × 620. The language
picker supports search and keyboard selection. Combined language/sponsorship/period requests,
profile return, failed-refresh recovery, a real empty ABAP ranking, and clearing filters were
verified. Nine local Rust tests and the explicit filtered-network smoke test passed. The
`developers-filters-*` screenshots and `filter-verification.json` record this revision.
