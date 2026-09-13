async (page) => {
  const base = "http://localhost:1437/ui-components?view=opportunities&writes=accept&links=record";
  const results = [];
  for (const lang of ["zh", "en"])
    for (const theme of ["light", "dark"])
      for (const width of [900, 1440]) {
        await page.setViewportSize({ width, height: 620 });
        await page.evaluate(
          ({ lang, theme }) => {
            localStorage.setItem("i18nextLng", lang);
            localStorage.setItem("tauri-ui-theme", theme);
          },
          { lang, theme }
        );
        await page.goto(base);
        await page
          .locator("header")
          .getByRole("button", {
            name: lang === "zh" ? "监控设置" : "Monitor settings",
            exact: true,
          })
          .click();
        const model = page.getByLabel(lang === "zh" ? "模型名称" : "Model name", { exact: true });
        await model.fill("chosen-preview-model");
        const viewport = page.getByRole("dialog").locator("[data-slot=scroll-area-viewport]");
        if ((await viewport.boundingBox()).height < 200)
          throw new Error("Settings viewport collapsed");
        await viewport.evaluate((el) => (el.scrollTop = el.scrollHeight));
        await page.screenshot({
          path: `output/playwright/opportunity-app/settings-${theme}-${lang}-${width}-620.png`,
        });
        await page
          .getByRole("button", { name: lang === "zh" ? "保存" : "Save", exact: true })
          .click({ timeout: 5000 });
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page
          .locator("header")
          .getByRole("button", {
            name: lang === "zh" ? "监控设置" : "Monitor settings",
            exact: true,
          })
          .click();
        if ((await model.inputValue()) !== "chosen-preview-model")
          throw new Error("Save not persisted");
        await page.keyboard.press("Escape");
        results.push({ lang, theme, width, height: 620, save: "pass" });
      }
  return results;
};
