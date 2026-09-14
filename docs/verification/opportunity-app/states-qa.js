async (page) => {
  const base = "http://localhost:1437/ui-components?view=opportunities&writes=accept&links=record";
  const cases = [];
  for (const lang of ["zh", "en"])
    for (const theme of ["dark", "light"])
      for (const width of [900, 1440]) {
        await page.setViewportSize({ width, height: 620 });
        await page.evaluate(
          ({ lang, theme }) => {
            localStorage.setItem("i18nextLng", lang);
            localStorage.setItem("tauri-ui-theme", theme);
          },
          { lang, theme }
        );
        for (const scenario of ["setup", "empty", "pending", "stale", "long", "failure"]) {
          await page.goto(base + "&opportunities=" + scenario);
          await page
            .locator("header")
            .getByRole("button", {
              name: lang === "zh" ? "监控设置" : "Monitor settings",
              exact: true,
            })
            .waitFor();
          await page.waitForTimeout(200);
          if (scenario === "setup")
            await page
              .getByRole("heading", {
                name: lang === "zh" ? "发现值得参与的问题" : "Find your next contribution",
              })
              .waitFor();
          else if (scenario === "empty")
            await page
              .getByRole("button", {
                name: lang === "zh" ? "试筛最近 7 天" : "Screen the past 7 days",
              })
              .waitFor();
          else {
            const first = page.locator('button[aria-pressed="true"]');
            await first.waitFor();
            if (width === 900) await first.click();
          }
          if (
            scenario === "stale" &&
            !(await page
              .getByRole("button", { name: lang === "zh" ? "复制草稿" : "Copy draft" })
              .isDisabled())
          )
            throw new Error("Stale copy enabled");
          if (
            scenario === "pending" &&
            !(await page
              .getByRole("button", { name: lang === "zh" ? "立即检查" : "Check now" })
              .isDisabled())
          )
            throw new Error("Duplicate check enabled");
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
            throw new Error("Overflow");
          cases.push({ lang, theme, width, scenario });
        }
      }
  await page.goto(base);
  await page.getByRole("button", { name: "Monitor settings", exact: true }).click();
  await page.getByLabel("Model name", { exact: true }).fill("chosen-preview-model");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Monitor settings", exact: true }).click();
  if (
    (await page.getByLabel("Model name", { exact: true }).inputValue()) !== "chosen-preview-model"
  )
    throw new Error("Settings not retained");
  await page.screenshot({ path: "output/playwright/opportunity-app/settings-light-en-620.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Filter by repository" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const selected = page.locator('button[aria-pressed="true"]');
  await selected.waitFor();
  await page.getByRole("button", { name: "Open on GitHub", exact: true }).click();
  const urls = await page.evaluate(() => window.__harborPreviewOpenedUrls);
  if (!urls.some((u) => u.startsWith("https://github.com/harbor-labs/")))
    throw new Error("Link not recorded");
  return {
    passed: cases.length,
    cases,
    settingsSaved: true,
    keyboardFilter: true,
    externalLinkIntercepted: urls,
  };
};
