# Repository tab overflow — 2026-09-10

- [Native before, 1200 × 760](native-before-1200.png): both scrollbars are visible.
- [Native after, same size](native-after-1200.png): contained selection line and bounded arrow controls.
- [Native keyboard End](native-keyboard-end-1200.png): Settings is selected and fully visible.
- [Chinese dark, 900 px](zh-dark-900-start.png)
- [English light, 1440 px](en-light-1440-start.png)

Native images come from the isolated `com.harbor.acceptance.preview` app with the production frontend and intercepted business calls. Native observations cover the default 1200 × 760 window, arrow scrolling and keyboard Home/End. Browser checks additionally cover both languages/themes and 900/1200/1440 sizes. No OS scrollbar setting was changed.

Run [the regression](regression.js) through `playwright-cli run-code --filename docs/verification/repository-tabs/regression.js` against `pnpm dev:ui --port 1423`. The original component fails with a 36 px client height and 40 px scroll height; the fixed viewport is 40/40 and the last keyboard-selected tab remains visible. This browser-level check exercises CSS geometry, which jsdom cannot establish.

Complete scripts, 54 final browser captures and result manifests are under `output/playwright/repository-tabs/`. See [UI verification](../../UI_VERIFICATION.md) for checks, scope and failed-run explanations.
