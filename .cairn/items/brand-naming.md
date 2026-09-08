# Repolane identity delivery

## Goal

Deliver the user-accepted Repolane name and Lane D identity through the branch and PR workflow.

## Current state

- Working area: this repository. Branch: `feat/repolane-lane-identity`, based on `bc39129` (PR #84). Remote repository remains `Excelius-Wang/harbor`. The user accepted the current result on 2026-09-08 and authorized code submission following the previous PR workflow. No merge authorization has been given in this delivery request.
- Lane D is selected. The previous ink/confluence, R and Portal directions are superseded. Production uses two filled paths in `src/components/brand-mark.tsx` and `src/assets/brand/repolane-mark.svg`, viewBox 256 × 228. Titlebar: 24 × 22 px beside the wordmark; About: 80 × 72 px. Favicon follows the existing light/dark foreground colors.
- The titlebar retains its Logo and separate neutral PanelLeft navigation button, with persistent sidebar state, accessible labels and double-click isolation. The previously authorized removal of disabled history arrows is included in this delivery.
- UI names in en/zh, page title and native main-window title use Repolane. Locale keys, repository links, identifiers, user storage and update paths remain unchanged. Dock/installer artifacts and OAuth callback/application branding remain outside this change.
- Durable sources: `docs/brand/repolane-lane/README.md`, its preview, and `docs/verification/repolane-lane/README.md` with committed browser captures. Historical sources remain explicitly labeled in `docs/brand/repolane-solid/`. Naming evidence and limitations live in `docs/brand/naming-2026-09-07/`; design research lives in `docs/brand/commercial-logo-study.md`.
- No domains or accounts were acquired. Formal trademark and registrar availability checks remain unverified; earlier registry 404s are not availability guarantees.
- Lane-specific native-window inspection remains unperformed; the user accepted the current browser-verified result for this delivery. Preserve inline SVG: CSS masks previously rendered as a rectangle in native WebView.
- Implementation commit `a00d5a9` is pushed and PR [#85](https://github.com/Excelius-Wang/harbor/pull/85) is open against main. It includes the inherited branding, history-arrow removal and UI follow-up bookkeeping. The old `fix/remove-placeholder-history-arrows` branch remains untouched. GitHub is authoritative for CI/review status; no merge or release has been performed.
- CodeRabbit reviewed `7777dfd` and raised three actionable findings. All are addressed in the review-fix changes: brand mark/wordmark double-click propagation is stopped, the preserved branch is explicitly named, and the Repofront snapshot records 30 inspected / 73 uninspected results with unknown original pagination parameters. The historical snapshot was not replaced with a fresh search. Re-review of the fix remains pending; do not treat the earlier CodeRabbit SUCCESS status as approval of later changes.

## Next action

Verify CodeRabbit review and CI on the review-fix head of PR #85; keep the PR open until merge is authorized.

## Verification

- Focused titlebar suite: 5 tests passed. The two new mark/wordmark regression cases failed before the fix and passed after it; empty drag-region double-click still invokes maximize, and navigation toggling remains isolated. Snapshot coverage arithmetic and preserved branch existence verified.
- Eight en/zh × light/dark × 900/1440 browser navigation scenarios passed, including Enter/Space toggling and horizontal containment. Both About themes inspected; favicon foreground and SVG/component/preview path parity checked. Two paths remain separated at 16–64 px.
- The first full `pnpm check` had one 5-second timeout in the unrelated code-navigation suite (610/611 passed). Its isolated rerun passed all 4 tests. The full rerun passed: 611 tests/127 files, formatting, lint, TypeScript and production build. Cargo check also passed. Logs: `/tmp/harbor-lane-check-retry.log` and `/tmp/harbor-lane-cargo-check.log`.
- Existing rail hook and bundle-size warnings are non-blocking. Initial headed browser screenshots timed out; independent headless captures succeeded without product changes.

Success: the user accepted Lane D and the current UI integration; the complete local verification gate passed, the code is pushed and PR #85 is open for review.

Review-fix validation: `pnpm check` passed 613 tests in 127 files, formatting, lint, TypeScript and production build. Existing rail-hook and bundle-size warnings remain. No Rust/config changes were made in this fix; the prior cargo check remains applicable.
