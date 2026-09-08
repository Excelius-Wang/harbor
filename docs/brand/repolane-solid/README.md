# Repolane Solid 02

历史方案：2026-09-08 已由用户选定的 [Lane D](../repolane-lane/README.md) 替代。下文保留当时的制作与验证记录，不代表当前生产标志。

用户已认可 Solid 02 的方向：两条支流汇为一条，保留水墨的笔势、粗细变化和留白，去掉墨色晕染与飞白。

这是根据概念图手工重建的矢量初稿，并非原图的逐像素描摹。轮廓仍需用户确认。参照图为本次会话生成的 `exec-987ea7f0-80ba-4b84-b5c9-c4a6627225f7.png` 右侧第二行。

- [标准 SVG](mark.svg)：完整收笔，用于较大尺寸。
- [小尺寸 SVG](mark-small.svg)：增加支流与汇合处的分量，减少末端的脆弱感。
- [浏览器预览](preview.html)：同页比较深浅背景、标题栏比例与 16/20/24/32/48 px 宽度。没有外部依赖，可以直接打开。

两个 SVG 都使用 `viewBox="0 0 320 180"`、单个闭合填充路径和 `currentColor`。没有内嵌位图、脚本、外部资源或字体依赖。通过 img 标签加载时，外部 CSS 的 color 不会自动传入 SVG；需要随主题变化时应内联 SVG，或使用 CSS mask。预览中的内联图形为装饰用途，使用 aria-hidden；独立 SVG 有 title。

## 验证结果

2026-09-07 使用 Playwright/Chromium 检查了 1200 px、1 倍像素密度，以及 900 px、2 倍像素密度的预览。两种背景下均比较标准版和小尺寸版。截图：

- `output/playwright/repolane-solid/preview-1200.png`
- `output/playwright/repolane-solid/preview-900-retina.png`

人工查看结果：32 px 宽的小尺寸版能较清楚地保留汇合关系，建议作为标题栏的起始尺寸；16–20 px 宽时笔触细节明显减少，不推荐作为默认展示尺寸。这里的尺寸是宽度，不是高度，也没有宣称所有尺寸都通过可读性验收。

SVG XML 解析通过，文件差异无空白错误。本次没有修改生产组件，因此未重复运行全量应用测试。预览的初次 favicon 404 已通过空 favicon 声明处理。

标题栏是静态比例示意，未连接生产导航行为。原生 Tauri 窗口、Dock 包装、图标相似性与跨浏览器表现尚未验证。产品显示名、发布配置、稳定标识和 GitHub 仓库路径未改变；仓库继续使用 `Excelius-Wang/harbor`。

## App 界面接入

Solid 02 已接入 `src/components/brand-mark.tsx`，标题栏和关于页共用该组件。标题栏采用 32 px 宽，保留导航开关行为。界面中英文品牌文案、网页标题/favicon 和主窗口标题已更新为 Repolane。原生截图为 `output/playwright/repolane-solid/native-integrated-svg.png`。

原生 WebView 中 CSS mask 曾显示为矩形，最终改用内联 SVG；修正后已查看原生截图。品牌界面接入不包含安装包 productName、Dock 图标和远端 OAuth 应用名称的迁移。
