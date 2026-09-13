async (page) => {
  const base = "http://localhost:1437/ui-components?view=opportunities&writes=accept";
  const results = [];
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
        await page.goto(base);
        await page
          .locator("header")
          .getByRole("button", {
            name: lang === "zh" ? "监控设置" : "Monitor settings",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog");
        const area = dialog.locator("[data-slot=scroll-area]");
        await area.hover();
        const bar = area.locator("[data-slot=scroll-area-scrollbar]");
        await bar.waitFor();
        const input = dialog.locator("textarea").first();
        const inputBox = await input.boundingBox();
        const barBox = await bar.boundingBox();
        const gap = barBox.x - inputBox.x - inputBox.width;
        if (gap < 8) throw new Error("Scrollbar overlaps content: " + gap);
        const thumb = bar.locator("[data-slot=scroll-area-thumb]");
        const style = await thumb.evaluate((el) => ({
          width: getComputedStyle(el, "::before").width,
          hit: el.getBoundingClientRect().width,
        }));
        if (style.width !== "3px" || style.hit < 6) throw new Error("Thumb geometry incorrect");
        const box = await thumb.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 8 });
        await page.mouse.up();
        const viewport = area.locator("[data-slot=scroll-area-viewport]");
        if ((await viewport.evaluate((el) => el.scrollTop)) <= 0) throw new Error("Drag failed");
        await viewport.evaluate((el) => (el.scrollTop = el.scrollHeight));
        await page
          .getByRole("button", { name: lang === "zh" ? "保存" : "Save", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        results.push({ lang, theme, viewportWidth: width, gap, ...style, drag: true, save: true });
      }
  await page.setViewportSize({ width: 900, height: 760 });
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "zh");
    localStorage.setItem("tauri-ui-theme", "dark");
  });
  await page.goto(base + "&opportunities=setup");
  await page.locator("header").getByRole("button", { name: "监控设置", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("[data-slot=scroll-area]").hover();
  await page.waitForTimeout(180);
  await dialog.screenshot({ path: "docs/verification/opportunity-app/scrollbar-refined-dark.png" });
  return results;
};
