# Shared/native acceptance — 2026-09-09

Browser evidence: four production detail views now retain one main landmark owned by WindowFrame; 32 theme/language/size scenarios pass. Gallery Dialog, Sheet and Command normal/reduced-media checks add 48 scenarios. Reduced transparency removes backdrop blur; reduced motion uses the existing short-duration fallback. No shared material tokens changed.

- [Gist at 900 px](shared-landmark-Gists-zh-dark-900.png)
- [Project at 1440 px](shared-landmark-Projects-en-light-1440.png)
- [Reduced-media Command](shared-media-command-reduced-zh-dark-900.png)
- [Normal Sheet](shared-media-sheet-normal-en-light-1440.png)

Native observations in the conversation show a real controlled Tauri main window at 1200 × 760 and Settings at 600 × 500, dark Chinese and light English, theme/language synchronization, Shortcuts and closing Settings back to the main window. These images have not been exported to files. They do not establish the desktop-background, reduced transparency/motion or full dimension matrix. At 13:19 UTC the screen locked; CUA reported cgWindowNotFound while app inventory still showed the preview running. Those remaining native gates require an unlocked visible desktop.
