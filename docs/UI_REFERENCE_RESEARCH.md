# Harbor UI 参考研究

本文只引用产品官网、官方文档、官方设计系统和官方更新日志。这里比较的是可观察、可迁移的设计做法，不把厂商宣传当成第三方口碑，也不声称下面的产品构成客观排名。

## 先说结论

`harbor-discover-glass-concept.png` 的方向值得保留。它的三栏比例稳，列表与详情关系清楚，玻璃外壳也让整扇窗口像一件完整的桌面工具。上一版把 Context Dock 做成常驻第四栏，挤窄了主内容，反而丢掉了原稿的气氛。

Harbor 最合适的组合是：用 GitHub 的语义做底，用 Linear 控制层级和密度，用 Raycast 串起键盘操作，再从 Arc 学材质与临时预览。Zed 和 Tower 分别补上低干扰原则、Git 操作的状态反馈。

## 最值得看的六个参考

| 参考 | 最值得学的部分 | Harbor 的落法 | 不该照搬的部分 |
| --- | --- | --- | --- |
| Linear | 安静的应用框架和高密度层级 | 降低侧栏亮度，统一标题与筛选器的位置，减少无意义分隔线 | 黑灰配色、胶囊标签和 SaaS 式侧栏不要原样复制 |
| Raycast | 列表、详情和动作面板组成一套键盘模型 | 方向键浏览，右侧同步预览，`Enter` 执行主操作，动作面板承载次要操作 | 不能把完整工作台缩成一个启动器，也不能把常用操作全藏起来 |
| Arc | 侧栏承载上下文，Peek 保持当前任务，材质服从窗口 | 固定仓库恢复现场，热门仓库先预览后进入，玻璃留给应用框架和浮层 | 不要再造一层 Space 概念，也不要让通透背景承载长文本 |
| GitHub Desktop 与 Primer | GitHub 语义、仓库上下文、父级到详情的稳定导航 | 保留用户熟悉的 PR 状态、Checks、Review 和仓库身份；列表与详情独立滚动 | 不复制 GitHub Web 的整套页头，也不把 Harbor 做成本地提交工具 |
| Zed | 低干扰界面和随焦点变化的命令入口 | 命令面板只显示当前页面可用的动作，主内容始终占据视觉中心 | 不引入 IDE 的面板数量、编辑器标签和终端式复杂度 |
| Tower | 复杂 Git 状态的可读反馈和可恢复操作 | 写操作明确展示结果、同步状态和撤销入口 | 不复制提交图、Working Copy 和完整本地 Git 工作流 |

### Linear：让高密度界面安静下来

Linear 在 2026 年界面更新中提出，导航与定位元素应该后退，用户正在处理的内容才应占据视觉中心。新版侧栏更暗，标签更紧凑，图标更少、更小；分隔线也降低了对比度，让结构能够被感知，却不持续抢眼。[Linear：A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)

Harbor 可以把侧栏压暗一个层级，固定页面标题、筛选器、刷新状态和主操作的位置。列表主要靠间距和表面明度分组，不必每行都画完整边框。Linear 的黑灰外观已经很有辨识度，Harbor 应继续使用深海蓝和 GitHub 状态色，避免看起来像另一个项目管理工具。

### Raycast：把浏览与操作串在一起

Raycast 把 `List` 作为默认界面，列表项可在右侧直接显示详情。官方还建议，右侧详情打开时，原本挤在列表末尾的附加信息应转移到详情区，让列表保持易扫读。[Raycast List](https://developers.raycast.com/api-reference/user-interface/list)

Action Panel 会随选中项变化，主操作默认使用 `Enter`，次操作使用 `Command + Enter`，其他动作按语义分组并显示快捷键。[Raycast Action Panel](https://developers.raycast.com/api-reference/user-interface/action-panel)

这正适合 Harbor：方向键移动仓库或 PR，详情同步更新；`Enter` 打开详情，`Command + Enter` 打开 GitHub，`Command + K` 展开当前对象的动作。常用按钮仍需可见，不能把整个应用都藏进命令面板。

### Arc：玻璃材质要保护上下文

Arc 的 Spaces 会分别保存固定内容、临时内容、主题和图标，切换后能回到各自的工作现场。[Arc Spaces](https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas) 从固定页面打开外部链接时，Peek 会先做临时预览，关闭后用户仍停留在原上下文中。[Arc Peek](https://resources.arc.net/hc/en-us/articles/19335302900887-Peek-Preview-Sites-From-Pinned-Tabs)

Harbor 可以让固定仓库记住上次查看的 PR、筛选条件和滚动位置。热门仓库先在右侧预览，用户再决定是否固定或进入完整工作区。Arc 的彩色 Space 模型不宜移植，仓库本身已经是天然上下文。

### GitHub Desktop 与 Primer：沿用用户已经会的语义

Primer 建议把导航放在它所影响的内容旁边。父级到详情的分栏布局应让父级导航持续可见；列表与详情各自滚动时，用户滚动长列表也不会丢失当前选中对象。[Primer Navigation](https://www.primer.style/product/ui-patterns/navigation/) [Primer Layout](https://primer.style/product/getting-started/foundations/layout/)

GitHub Desktop 的顶部仓库栏始终显示当前仓库和当前分支，并把切换入口放在同一处。[GitHub Desktop repository bar](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop)

Harbor 应沿用 `Open`、`Draft`、`Merged`、`Checks`、`Review requested` 等名称和状态色，顶部始终说明当前仓库。热门浏览时明确显示 `Discover`，避免让人误以为已进入仓库工作区。GitHub Web 的全站页头和横向导航是为浏览器设计的，不适合直接复制到桌面端。

### Zed：工具入口随当前焦点变化

Zed 将“响应快、专注、协作”列为产品目标，其中“专注”意味着界面尽量减少干扰，让位给正在编辑的内容。[Zed Is Our Office](https://zed.dev/blog/zed-is-our-office) 它的命令面板会根据当前焦点改变可用命令：焦点在项目面板时出现项目操作，焦点在编辑器时则显示编辑器操作。[Zed Features](https://zed.dev/features)

Harbor 的命令面板和右侧轨道也应随上下文变化。选中热门仓库时显示固定、打开主页和复制地址；选中 PR 时显示 Checks、复制链接和 Agent 总结。没有意义的入口不要提前占位。

### Tower：复杂状态要能看懂，也要能恢复

Tower 的官方功能说明显示，历史视图同时呈现提交元数据和精确 Diff，未推送与未拉取提交会直接标出；复杂 Git 操作也提供撤销和恢复入口。[Tower feature overview](https://www.git-tower.com/features/all-features)

Harbor 未来加入评论、审批或合并时，应参考这种明确的结果反馈和可恢复性。第一阶段不需要提交图、Working Copy 和复杂 Git 操作，否则产品会从 GitHub 工作台偏向本地 Git 客户端。

## 毛玻璃的边界

Apple 将 Liquid Glass 定义为控件和导航的功能层，并明确不建议铺进内容层。[Apple Human Interface Guidelines：Materials](https://developer.apple.com/design/human-interface-guidelines/materials) 微软也建议 Acrylic 用于菜单、浮层等临时界面，长期存在的窗口底层更适合 Mica；多层 Acrylic 叠加会制造视觉噪声。[Microsoft Acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic) [Microsoft Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)

因此不必放弃用户喜欢的毛玻璃稿，只需收紧材质层级：

- 标题栏、左侧导航和临时浮层使用清透材质。
- 列表与详情使用高遮罩率的烟黑表面，只透出背景色，不透出具体景物。
- 选中行使用一层浅蓝玻璃高亮，不给每一行套卡片。
- macOS 优先使用系统 vibrancy，Windows 11 用 Mica 承载窗口底层、Acrylic 承载临时浮层，其他平台使用同色系实色。
- 窗口失焦、减少透明度或高对比度模式下自动换成稳定实色。

跨平台需要保持一致的是层级、间距和操作方式，不是模糊半径。

## Harbor 的记忆点应留在右侧细轨道

当前毛玻璃稿最有价值的独特元素，是最右侧那条克制的窄轨道。建议将它发展成 Harbor 自己的上下文轨道：

- 默认宽度约 `48px`，只显示当前对象真正存在的 Checks、Review、Comments 和 Agent 状态。
- 点开后，以 `320–360px` 的抽屉覆盖详情区，不再常驻挤压三栏。
- 轨道顶部兼作同步反馈：同步时出现缓慢移动的蓝色细线，完成后收回成静态圆点；旁边仍保留文字或无障碍标签，不能只靠颜色。
- 轨道与标题栏使用清透材质，正文保持稳定。用户看到“深海窗口 + 右侧细轨道”，就能认出 Harbor。

下一张图应沿用 `harbor-discover-glass-concept.png` 的三栏结构，只做精修：压低背景水面在正文区的存在感，收敛选中态渐变，保留右侧轨道，并补一个覆盖式展开态。现代感来自稳定的空间关系、材质层级和细致的状态反馈，不需要继续增加光晕、渐变和漂浮卡片。
