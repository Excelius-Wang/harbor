async (page) => {
  const results = [];
  for (const lang of ["zh", "en"])
    for (const theme of ["dark", "light"])
      for (const width of [900, 1440]) {
        await page.setViewportSize({ width, height: 760 });
        await page.goto("http://localhost:1437/ui-components");
        await page.evaluate(
          ({ lang, theme }) => {
            localStorage.setItem("i18nextLng", lang);
            localStorage.setItem("tauri-ui-theme", theme);
          },
          { lang, theme }
        );
        await page.reload();
        const gallery = page.locator("[data-slot=scroll-area]").first();
        await gallery.hover();
        await gallery.locator("[data-slot=scroll-area-thumb]").waitFor();
        const visual = await gallery
          .locator("[data-slot=scroll-area-thumb]")
          .first()
          .evaluate((el) => getComputedStyle(el, "::before").width);
        if (visual !== "3px") throw Error("Gallery scrollbar width " + visual);
        await page.evaluate(async () => {
          const { default: React } = await import("/node_modules/.vite/deps/react.js");
          const { default: ReactDOM } =
            await import("/node_modules/.vite/deps/react-dom_client.js");
          const { createRoot } = ReactDOM;
          const { ScrollArea, ScrollBar } = await import("/src/components/ui/scroll-area.tsx");
          const host = document.createElement("div");
          host.id = "scrollbar-qa";
          host.style =
            "position:fixed;inset:100px 80px auto;z-index:9999;padding:24px;background:var(--background);border:1px solid var(--border)";
          document.body.append(host);
          createRoot(host).render(
            React.createElement(
              React.Fragment,
              null,
              React.createElement(
                ScrollArea,
                { type: "always", style: { height: 160, width: 400 } },
                React.createElement(
                  "div",
                  { style: { width: 1200, height: 400, padding: 12 } },
                  "Horizontal / vertical scrollbar · 横向 / 纵向滚动条"
                ),
                React.createElement(ScrollBar, { orientation: "horizontal" })
              ),
              React.createElement("textarea", {
                "aria-label": "Native scrollbar",
                defaultValue: Array.from(
                  { length: 30 },
                  (_, i) => "Native textarea 原生输入框 " + i
                ).join("\n"),
                style: {
                  display: "block",
                  height: 100,
                  width: 400,
                  marginTop: 24,
                  overflow: "auto",
                },
              })
            )
          );
        });
        const host = page.locator("#scrollbar-qa");
        const area = host.locator("[data-slot=scroll-area]");
        const viewport = area.locator("[data-slot=scroll-area-viewport]");
        for (const axis of ["vertical", "horizontal"]) {
          const thumb = area.locator(
            "[data-orientation=" + axis + "] [data-slot=scroll-area-thumb]"
          );
          await thumb.waitFor();
          const size = await thumb.evaluate((el, axis) => {
            const s = getComputedStyle(el, "::before");
            return axis === "vertical" ? s.width : s.height;
          }, axis);
          if (size !== "3px") throw Error(axis + " " + size);
          const box = await thumb.boundingBox();
          const x = box.x + box.width / 2,
            y = box.y + box.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(
            x + (axis === "horizontal" ? 80 : 0),
            y + (axis === "vertical" ? 60 : 0),
            { steps: 8 }
          );
          await page.mouse.up();
          if (
            (await viewport.evaluate(
              (el, axis) => (axis === "vertical" ? el.scrollTop : el.scrollLeft),
              axis
            )) <= 0
          )
            throw Error(axis + " drag failed");
        }
        const native = host.locator("textarea");
        const styles = await native.evaluate((el) => {
          const t = getComputedStyle(el, "::-webkit-scrollbar-thumb");
          return {
            track: getComputedStyle(el, "::-webkit-scrollbar").width,
            border: t.borderLeftWidth,
            clip: t.backgroundClip,
          };
        });
        if (styles.track !== "9px" || styles.border !== "3px" || styles.clip !== "padding-box")
          throw Error(JSON.stringify(styles));
        await native.hover();
        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(150);
        if ((await native.evaluate((el) => el.scrollTop)) <= 0) throw Error("Native scroll failed");
        await host.screenshot({
          path:
            "docs/verification/opportunity-app/shared-scrollbars-" +
            lang +
            "-" +
            theme +
            "-" +
            width +
            ".png",
        });
        results.push({
          lang,
          theme,
          width,
          gallery: true,
          verticalDrag: true,
          horizontalDrag: true,
          nativeScroll: true,
          ...styles,
        });
      }
  return results;
};
