async (page) => {
  const cases = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const lang of ["en", "zh"])
    for (const theme of ["light", "dark"])
      for (const width of [900, 1440]) {
        await page.setViewportSize({ width, height: 760 });
        await page.evaluate(
          ({ lang, theme }) => {
            localStorage.setItem("i18nextLng", lang);
            localStorage.setItem("tauri-ui-theme", theme);
          },
          { lang, theme }
        );
        await page.goto(
          "http://localhost:1437/ui-components?view=opportunities&opportunities=refresh-failed&writes=accept&links=record"
        );
        const row = page.locator('button[aria-pressed="true"]');
        await row.waitFor();
        if (width === 900) await row.click();
        const title = await page.locator("article h2").innerText();
        const copy = page.getByRole("button", {
          name: lang === "zh" ? "复制草稿" : "Copy draft",
          exact: true,
        });
        if (!(await copy.isDisabled())) throw new Error("Stale draft is copyable");
        await page.getByRole("alert").waitFor();
        await page.screenshot({
          path: `output/playwright/opportunity-refresh/${lang}-${theme}-${width}-stale.png`,
        });
        const retry = page.getByRole("alert").getByRole("button");
        await retry.focus();
        await page.keyboard.press("Enter");
        await page.getByRole("alert").waitFor({ state: "hidden" });
        if (await copy.isDisabled()) throw new Error("Retry did not enable fresh draft");
        if ((await page.locator("article h2").innerText()) !== title)
          throw new Error("Selection changed");
        if (width === 900) {
          await page
            .getByRole("button", { name: lang === "zh" ? "返回机会列表" : "Back to opportunities" })
            .click();
          await row.waitFor({ state: "visible" });
        }
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
          throw new Error("Horizontal overflow");
        cases.push({
          lang,
          theme,
          width,
          staleRetained: true,
          retry: true,
          selectionRetained: true,
        });
      }
  if (errors.length) throw new Error(errors.join("\n"));
  return { passed: cases.length, cases, errors };
};
