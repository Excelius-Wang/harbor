# Trending developer controls

> Historical snapshot: delivery and uncommitted-work statements below describe the
> checkpoint when it was recorded, not the current branch. These records were included
> in [PR #84](https://github.com/Excelius-Wang/harbor/pull/84); see the
> [current checkpoint](../items/ui-follow-up.md) for live delivery status.

## Goal

Remove the unwanted GitHub ranking shortcut and identify why developer filters are missing.

## Current state

- Working area: `repository root`; existing feature/layout changes are
  uncommitted and must be preserved.
- Removed the developer ranking shortcut from its toolbar and empty/error actions. Retry and
  individual repository links remain. Updated its existing interaction test and documentation;
  the backend's unavailable message no longer suggests using the removed shortcut.
- Current code passes only the period. GitHub's public developer ranking supports a language
  path (e.g. `/trending/developers/python?since=daily`) and `sponsorable=1`.
- A clarification is pending about whether the user means language, language plus sponsorship,
  or the period control. The right-hand period selector is present.

## Next action

None — complete

## Verification

- Both discovery interaction test files: 12 tests passed (`--maxWorkers=2`).
- Targeted ESLint, Prettier check, `pnpm build`, and `git diff --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml github::trending --lib`: six passed,
  one public-network test ignored.
- Confirmed language and sponsorship filters on GitHub's public developer ranking; local
  frontend query arguments and Rust command currently accept only the period. No filters were
  added while the user's intended filter conditions remain unspecified.

Success: unwanted ranking links removed and existing retry behavior verified; missing-filter
cause identified. The pending optional clarification can define a subsequent implementation.
