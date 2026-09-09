# Shared/native acceptance — 2026-09-09

Four production detail views retain one main landmark owned by WindowFrame (32 browser scenarios). Dialog, Sheet and Command add 48 normal/reduced-media scenarios across both themes, languages and sizes. Final pnpm check passes 660 tests; three native appearance regressions, four window-layout tests, cargo check and the isolated native build pass.

The native correction removes accumulated macOS vibrancy layers before applying one background-responsive layer. Reduced transparency removes every layer. Existing CSS palette and geometry are unchanged.

Final native coverage: 24 main captures (both themes/languages/sizes, three backgrounds), 12 Command captures (dark English/light Chinese, both sizes, three backgrounds), and 12 reduced-transparency captures (both themes/sizes, English, three backgrounds). Backgrounds come from a temporary native QA window behind the preview, not browser layers. Raw images and dimension/restoration manifests are in output/playwright/native-final. Before/candidate captures are excluded. Native motion observation reuses this session's unchanged motion behavior plus the browser duration checks.

- [Dark before: accumulated layers](before-hud-native-main-en-dark-900-cool.png)
- [Dark corrected: cool background](native-final-main-en-dark-900-cool.png)
- [Dark corrected: bright background](native-final-main-en-dark-900-bright.png)
- [Light Chinese wide](native-final-main-zh-light-1440-cool.png)
- [Light Chinese Command at 900 px](native-final-command-zh-light-900-bright.png)
- [Dark English Command wide](native-final-command-en-dark-1440-neutral.png)
- [Reduced transparency](native-reduced-main-en-light-900-bright.png)
- [Gist at 900 px](shared-landmark-Gists-zh-dark-900.png)
- [Project at 1440 px](shared-landmark-Projects-en-light-1440.png)
- [Reduced-media Command](shared-media-command-reduced-zh-dark-900.png)
- [Normal Sheet](shared-media-sheet-normal-en-light-1440.png)

Settings synchronization/return, maximize/restore, navigation and native reduced preferences were observed. Original wallpaper and accessibility values are restored after QA. Business operations remain controlled fixtures; this evidence does not establish live GitHub writes or native transfer IO. Actual review and final delivery are tracked in the migration checklist.
