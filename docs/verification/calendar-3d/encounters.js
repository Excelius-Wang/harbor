async (page) => {
  const results = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = "http://localhost:1439/ui-components?view=opportunities&calendar=real&links=record";
  const idle = () => page.waitForFunction(() => {
    const marker = document.querySelector('.harbor-companion-position');
    return document.querySelector('.harbor-calendar-companion')?.dataset.phase === 'idle' && marker && getComputedStyle(marker).visibility === 'visible' && marker.getAnimations().every(a => a.playState === 'finished' || a.playState === 'idle');
  });
  for (const lang of ["en", "zh"])
    for (const theme of ["light", "dark"])
      for (const width of [900, 1440]) {
        const key = `${lang}-${theme}-${width}`;
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.evaluate(
          ({ lang, theme }) => {
            localStorage.setItem("i18nextLng", lang);
            localStorage.setItem("tauri-ui-theme", theme);
          },
          { lang, theme }
        );
        await page.goto(url + (width === 900 ? "&profile=long" : ""));
        await page
          .getByRole("button", { name: lang === "en" ? "Account" : "账户", exact: true })
          .click();
        const calendar = page.locator(".harbor-contribution-calendar");
        await calendar.waitFor();
        await idle();
        const target = page.locator('[data-contribution-day][data-level="4"]').last();
        const date = await target.getAttribute("data-contribution-day");
        await target.locator(".harbor-contribution-top").click();
        await page.mouse.move(5, 5);
        await idle();
        const label = await target.getAttribute("aria-label");
        if (!(await page.locator("[data-selected-date]").textContent()).includes(label))
          throw Error("Missing selected date");
        const check = async () =>
          page.evaluate(() => {
            const cell = document.querySelector('[data-contribution-day][aria-pressed="true"]');
            const face = cell.querySelector(".harbor-contribution-top").getBoundingClientRect();
            const sprite = document
              .querySelector(".harbor-companion-position")
              .getBoundingClientRect();
            return {
              footX: Math.abs(sprite.left + sprite.width / 2 - face.left - face.width * (document.querySelector('.harbor-calendar-companion').dataset.month === 'true' && document.querySelector('.harbor-column-object-anchor') ? 0.32 : 0.5)),
              footY: Math.abs(sprite.top + sprite.height * 0.98 - face.top - face.height / 2),
              continuous: !document.querySelector('[data-companion-lane="true"]') && Array.from(document.querySelectorAll('.harbor-contribution-week')).every(e => getComputedStyle(e).marginRight === '0px'),
              hasEncounter: !!document.querySelector('.harbor-calendar-companion .harbor-companion-object'),
              bounded: Array.from(document.querySelectorAll("[data-contribution-day]")).every(
                (e) =>
                  parseFloat(e.style.getPropertyValue("--day-height")) >= 0 &&
                  parseFloat(e.style.getPropertyValue("--day-height")) <= 44
              ),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
        await page.getByRole("tooltip").waitFor({state:"hidden"});
        const annual = await check();
        if (annual.footX > 1 || annual.footY > 1 || !annual.continuous || !annual.hasEncounter || !annual.bounded || annual.overflow)
          throw Error(JSON.stringify({ key, annual }));
        await calendar.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `output/playwright/calendar-3d/encounters-${key}-year.png` });
        await page
          .getByRole("radio", { name: lang === "en" ? "Flat" : "平面", exact: true })
          .click();
        if ((await target.getAttribute("aria-pressed")) !== "true")
          throw Error("Selection lost on flat switch");
        await page
          .getByRole("radio", { name: lang === "en" ? "Flat" : "平面", exact: true })
          .focus();
        await page.keyboard.press("ArrowRight", { delay: 80 });
        await page.waitForFunction(
          () => document.querySelector(".harbor-contribution-calendar")?.dataset.depth === "true"
        );
        if ((await calendar.getAttribute("data-depth")) !== "true") throw Error("Radio keyboard");
        await target.focus();
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
        if (
          (await page
            .locator('[data-contribution-day][aria-pressed="true"]')
            .getAttribute("data-contribution-day")) === date
        )
          throw Error("Date keyboard");
        await page
          .getByRole("button", { name: lang === "en" ? "Refresh" : "刷新", exact: true })
          .focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => !document.querySelector("svg.animate-spin"));
        if ((await page.locator('[data-contribution-day][aria-pressed="true"]').count()) !== 1)
          throw Error("Refresh selection");
        await page
          .getByRole("button", { name: lang === "en" ? "Month" : "月份", exact: true })
          .click();
        await page
          .getByRole("button", { name: lang === "en" ? "Previous month" : "上个月", exact: true })
          .click();
        const monthCell = page.locator("[data-contribution-day]").last();
        await monthCell.locator(".harbor-contribution-top").click();
        await page.mouse.move(5, 5);
        await idle();
        await page.getByRole("tooltip").waitFor({state:"hidden"});
        const detail = await page.locator(".harbor-contribution-detail").boundingBox();
        const board = await page.locator(".harbor-contribution-period").boundingBox();
        if (width === 1440 && detail.x < board.x + board.width) throw Error("Month details not beside board");
        if (width === 900 && detail.y < board.y + board.height) throw Error("Month details not below board");
        const monthly = await check();
        if (monthly.footX > 1 || monthly.footY > 1 || !monthly.continuous || !monthly.hasEncounter || !monthly.bounded || monthly.overflow)
          throw Error(JSON.stringify({ key, monthly }));
        await calendar.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `output/playwright/calendar-3d/encounters-${key}-month.png` });
        await page
          .getByRole("button", {
            name: lang === "en" ? "Pixel companion settings" : "像素伙伴设置",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: lang === "en" ? "Pause companion" : "暂停伙伴",
            exact: true,
          })
          .click();
        if (
          (await page.locator(".harbor-calendar-companion").getAttribute("data-active")) !== "false"
        )
          throw Error("Pause");
        await page.keyboard.press("Escape");
        if ((await page.locator('[data-contribution-day][aria-pressed="true"]').count()) !== 1)
          throw Error("Menu cleared date");
        await page
          .getByRole("button", { name: lang === "en" ? "Year" : "全年", exact: true })
          .click();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.locator("[data-contribution-day]").last().click();
        const reduced = await page
          .locator(".harbor-companion-position")
          .evaluate((e) => ({
            transition: getComputedStyle(e).transitionDuration,
            animation: getComputedStyle(e.querySelector(".harbor-companion-hero")).animationName,
          }));
        if (reduced.transition !== "0s" || reduced.animation !== "none")
          throw Error("Reduced motion");
        await page.keyboard.press("Escape");
        if (await page.locator("[data-selected-date]").count()) throw Error("Escape");
        results.push({ key, annual, monthly, keyboard: true, refresh: true, pause: true, reduced });
      }
  if (errors.length) throw Error(errors.join("\n"));
  return { results, errors };
}
