async (page) => {
  const cases = [];
  for (const lang of ["en", "zh"])
    for (const theme of ["light", "dark"])
      for (const width of [900, 1440]) {
        await page.setViewportSize({ width, height: 760 });
        await page.evaluate(
          ({ lang, theme }) => {
            localStorage.setItem("i18nextLng", lang);
            localStorage.setItem("tauri-ui-theme", theme);
            localStorage.setItem("global-shortcut-show-main", "Ctrl+Cmd+K");
          },
          { lang, theme }
        );
        await page.goto(
          "http://localhost:1438/ui-components?view=settings&shortcut=restore-error&writes=accept&links=record"
        );
        await page
          .getByRole("button", { name: lang === "zh" ? "快捷键" : "Shortcuts", exact: true })
          .click();
        const alert = page.getByRole("alert");
        await alert.waitFor();
        const retry = page.getByRole("button", {
          name: lang === "zh" ? "重试快捷键" : "Retry shortcut",
          exact: true,
        });
        await retry.focus();
        await page.keyboard.press("Enter");
        await retry.waitFor();
        if (
          (await page.evaluate(() => localStorage.getItem("global-shortcut-show-main"))) !==
          "Ctrl+Cmd+K"
        )
          throw new Error("Lost saved shortcut");
        await page.screenshot({
          path: `output/playwright/shortcut-registration/${lang}-${theme}-${width}-error.png`,
        });
        await page
          .getByRole("button", {
            name: lang === "zh" ? "清除快捷键" : "Clear shortcut",
            exact: true,
          })
          .click();
        await alert.waitFor({ state: "hidden" });
        if ((await page.evaluate(() => localStorage.getItem("global-shortcut-show-main"))) !== null)
          throw new Error("Clear failed");
        await page.goto(
          "http://localhost:1438/ui-components?view=settings&writes=accept&links=record"
        );
        await page
          .getByRole("button", { name: lang === "zh" ? "快捷键" : "Shortcuts", exact: true })
          .click();
        const capture = page.getByRole("button", {
          name: lang === "zh" ? /^显示主窗口/ : /^Show Main Window/,
        });
        await capture.click();
        await page.keyboard.press("Control+Meta+Alt+Shift+K");
        await page.getByText("Ctrl+Cmd+Alt+Shift+K", { exact: true }).waitFor();
        if (
          (await page.evaluate(() => localStorage.getItem("global-shortcut-show-main"))) !==
          "Ctrl+Cmd+Alt+Shift+K"
        )
          throw new Error("Modifier lost");
        await capture.focus();
        await page.keyboard.press("Tab");
        if (await capture.evaluate((e) => document.activeElement === e))
          throw new Error("Tab trapped");
        await page.screenshot({
          path: `output/playwright/shortcut-registration/${lang}-${theme}-${width}-success.png`,
        });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
          throw new Error("Overflow");
        cases.push({
          lang,
          theme,
          width,
          restoreError: true,
          retryFailureRetainsValue: true,
          clear: true,
          allModifiers: true,
          tabNavigation: true,
        });
      }
  return { passed: cases.length, cases };
}
