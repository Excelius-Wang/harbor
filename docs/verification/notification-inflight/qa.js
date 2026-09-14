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
        const text =
          lang === "zh"
            ? { nav: "通知", read: "标为已读", done: "标记完成", all: "全部标为已读" }
            : {
                nav: "Notifications",
                read: "Mark as read",
                done: "Mark as done",
                all: "Mark all as read",
              };
        const load = async (extra) => {
          await page.goto(
            "http://localhost:1438/ui-components?view=opportunities&notifications=targets&writes=accept&links=record" +
              extra
          );
          await page.getByRole("button", { name: text.nav, exact: true }).click();
          await page.locator(`article button[aria-label="${text.read}"]`).first().waitFor();
        };
        await load("&state=loading&commands=github_update_notification");
        const reads = page.locator(`article button[aria-label="${text.read}"]`);
        await reads.nth(0).click();
        await reads.nth(1).click();
        await page.waitForFunction((label) => {
          const buttons = document.querySelectorAll(`article button[aria-label="${label}"]`);
          return buttons[0]?.disabled && buttons[1]?.disabled;
        }, text.read);
        if (!(await page.getByRole("button", { name: text.all, exact: true }).isDisabled()))
          throw new Error("Bulk write overlaps threads");
        const calls = await page.evaluate(
          () => window.__harborPreviewCalls.filter((c) => c === "github_update_notification").length
        );
        if (calls !== 2) throw new Error("Unexpected duplicate IPC");
        await page.screenshot({
          path: `output/playwright/notification-inflight/${lang}-${theme}-${width}-threads.png`,
        });
        cases.push({ lang, theme, width, scenario: "parallel-threads", calls });

        await load("&state=loading&commands=github_mark_all_notifications_read");
        await page.getByRole("button", { name: text.all, exact: true }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: text.all, exact: true })
          .click();
        await page.keyboard.press("Escape");
        await page.getByRole("alertdialog").waitFor();
        await page.waitForFunction(
          (label) => document.querySelector(`article button[aria-label="${label}"]`)?.disabled,
          text.read
        );
        await page.screenshot({
          path: `output/playwright/notification-inflight/${lang}-${theme}-${width}-bulk.png`,
        });
        cases.push({ lang, theme, width, scenario: "bulk-escape-guard" });

        await load("&state=loading&commands=github_update_notification");
        await page.getByRole("button", { name: text.done, exact: true }).first().click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: text.done, exact: true })
          .click();
        await page.keyboard.press("Escape");
        await page.getByRole("alertdialog").waitFor();
        cases.push({ lang, theme, width, scenario: "done-escape-guard" });

        await load("");
        const before = await reads.count();
        await reads.first().focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(
          ({ label, before }) =>
            document.querySelectorAll(`article button[aria-label="${label}"]`).length ===
            before - 1,
          { label: text.read, before }
        );
        await page.getByRole("button", { name: text.all, exact: true }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: text.all, exact: true })
          .click();
        await page.getByRole("alertdialog").waitFor({ state: "hidden" });
        await page.waitForFunction(
          (label) =>
            document.querySelectorAll(`article button[aria-label="${label}"]`).length === 0,
          text.read
        );
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
          throw new Error("Horizontal overflow");
        cases.push({ lang, theme, width, scenario: "keyboard-read-and-bulk-success" });
      }
  if (errors.length) throw new Error(errors.join("\n"));
  return { passed: cases.length, cases, errors };
};
