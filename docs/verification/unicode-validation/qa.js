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
          },
          { lang, theme }
        );
        await page.goto(
          "http://localhost:1437/ui-components?view=opportunities&opportunities=preferences-error&writes=accept&links=record"
        );
        const settings = page.getByRole("button", {
          name: lang === "zh" ? "监控设置" : "Monitor settings",
          exact: true,
        });
        await settings.click();
        const preferences = page.getByLabel(
          lang === "zh" ? "贡献偏好" : "Contribution preferences",
          { exact: true }
        );
        const value = "测".repeat(2667) + "😀";
        await preferences.fill(value);
        const save = page.getByRole("button", {
          name: lang === "zh" ? "保存" : "Save",
          exact: true,
        });
        await save.click();
        await page.getByRole("dialog").getByRole("alert").waitFor();
        if ((await preferences.getAttribute("aria-invalid")) !== "true")
          throw new Error("Missing field error");
        if ((await preferences.inputValue()) !== value) throw new Error("Lost Unicode draft");
        await preferences.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `output/playwright/unicode-validation/${lang}-${theme}-${width}.png`,
        });
        await save.focus();
        await page.keyboard.press("Enter");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await settings.click();
        if ((await preferences.inputValue()) !== value)
          throw new Error("Save did not preserve Unicode");
        const limit = await preferences.getAttribute("maxlength");
        if (limit !== "8000") throw new Error("Changed input limit");
        await page.keyboard.press("Escape");
        cases.push({
          lang,
          theme,
          width,
          draftRetained: true,
          fieldError: true,
          keyboardRetry: true,
          unicodeSaved: true,
        });
      }
  return { passed: cases.length, cases };
};
