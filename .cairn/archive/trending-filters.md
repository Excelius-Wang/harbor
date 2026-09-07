# Trending developer filters

> Historical snapshot: delivery and uncommitted-work statements below describe the
> checkpoint when it was recorded, not the current branch. These records were included
> in [PR #84](https://github.com/Excelius-Wang/harbor/pull/84); see the
> [current checkpoint](../items/ui-follow-up.md) for live delivery status.

## Goal

Add programming-language and sponsorable-developer filters to the existing trending list,
preserving the selected period and the approved single-column layout.

## Current state

- Working area: `repository root`. Preserve existing uncommitted work.
- User explicitly requests the filters discussed in the preceding turn: language and sponsorship.
- GitHub accepts `/trending/developers/<language>?since=<period>&sponsorable=1`. Public samples
  are in `/private/tmp/harbor-trending-{all,filtered,empty}.html`.
- The language catalog is in `#select-menu-language #languages-menuitems`; real empty rankings
  use `.blankslate-heading` with a specific no-trending-developers message.
- shadcn Popover was added through its CLI for the searchable language picker.
- Filters are implemented across the frontend query, controlled page state, and Rust command.
  Language catalog parsing includes the selected language, which GitHub omits from its menu.
- Frontend: 13 focused interaction tests, ESLint, and build pass. Rust: nine local tests and
  the final filtered network smoke pass. The filter contract and UX are documented in
  `docs/GITHUB_TRENDING_DEVELOPERS.md`.
- Playwright verified both themes at 1440 × 900 and 900 × 620, searchable language selection,
  combined filters, profile return, empty results, refresh recovery, and resetting conditions.
  Screenshots and measurements are in ignored `output/playwright/developers-filters-*` and
  `output/playwright/filter-verification.json`.
- The user's Vite server occupies port 1420 and restarted during QA. Verification used a
  separate temporary server on port 1425; do not stop the user's port 1420 server.

## Next action

None — complete

## Verification

- `pnpm exec vitest run src/features/github/github-trending-developers.interaction.test.tsx src/features/github/github-discovery-view.interaction.test.tsx --maxWorkers=2`: 13 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml github::trending --lib`: nine passed, two network tests ignored.
- `cargo test --manifest-path src-tauri/Cargo.toml live_trending_developer_filters --lib -- --ignored`: passed against Python/sponsorship and ABAP rankings.
- Targeted ESLint, Prettier, `cargo fmt --check`, `pnpm build`, and `git diff --check` passed.
- Playwright screenshots inspected and all listed filter interactions passed. Console: zero errors/warnings.

Success: both requested filters are implemented and verified with actual filtered GitHub data.
