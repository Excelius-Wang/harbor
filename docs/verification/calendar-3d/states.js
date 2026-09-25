async (page) => {
  const results = [];
  const url =
    "http://localhost:1439/ui-components?view=opportunities&calendar=real&commands=github_get_user_contributions";
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
        for (const state of ["loading", "error", "empty", "stale"]) {
          await page.goto(url + "&state=" + state);
          await page
            .getByRole("button", { name: lang === "en" ? "Account" : "账户", exact: true })
            .click();
          await page.getByRole("button", {name:lang === "en" ? "Edit profile" : "编辑个人资料", exact:true}).waitFor();
          if (state === "loading") {
            await page.locator('[data-slot="skeleton"]').first().waitFor();
            if (await page.locator(".harbor-contribution-calendar").count())
              throw Error("Unexpected calendar during loading");
          } else if (state === "error") {
            await page.getByRole("alert").waitFor();
            await page
              .getByRole("button", { name: lang === "en" ? "Try again" : "重试", exact: true })
              .first()
              .click();
            await page.getByRole("alert").waitFor();
          } else {
            await page.locator(".harbor-contribution-calendar").waitFor();
            if (state === "empty") {
              if (
                !(await page
                  .locator("[data-contribution-day]")
                  .evaluateAll((es) =>
                    es.every((e) => parseFloat(e.style.getPropertyValue("--day-height")) === 0)
                  ))
              )
                throw Error("Empty has columns");
            } else {
              await page.locator("[data-contribution-day]").last().click();
              const date = await page
                .locator("[data-selected-date]")
                .getAttribute("data-selected-date");
              await page
                .getByRole("button", { name: lang === "en" ? "Refresh" : "刷新", exact: true })
                .focus();
              await page.keyboard.press("Enter");
              await page
                .getByText("Preview request failed. Retry to check error feedback.", {
                  exact: true,
                })
                .waitFor();
              if (
                (await page.locator("[data-selected-date]").getAttribute("data-selected-date")) !==
                date
              )
                throw Error("Stale date lost");
              await page
                .getByRole("radio", { name: lang === "en" ? "Flat" : "平面", exact: true })
                .click();
              if (
                (await page.locator(".harbor-contribution-calendar").getAttribute("data-depth")) !==
                "false"
              )
                throw Error("Stale control");
            }
          }
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
            throw Error("Horizontal overflow");
          await page.screenshot({
            path: `output/playwright/calendar-3d/${lang}-${theme}-${width}-${state}.png`,
          });
          results.push({ lang, theme, width, state, passed: true });
        }
      }
  return results;
}
