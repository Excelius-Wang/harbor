# Harbor UI 设计指南

Harbor 的视觉方向是**带冷蓝底色的半透明玻璃、柔和的边缘高光，以及紧凑、清楚的桌面控件**。背景的颜色和明暗能够透进界面；文字、选中项和 GitHub 状态仍然一眼可辨。

本指南根据用户选定的图片整理，作为后续 UI 设计的视觉依据。**侧栏采用图四的结构，配色采用 Harbor 的冷蓝灰，整页层次参考 LeonAnd。导航选中态和行高由共享导航组件统一提供，新增页面复用该组件。**

这些选择已经确认。共享组件已开始迁移，当前实现与预览入口见[组件说明](UI_COMPONENTS.md)。下文的色表保留为初始候选值，不是从参考图测得的参数，也不代表全部采用；最终验收仍按全站覆盖清单逐项完成。

## 参考图与使用方式

先看图片，再读规则。需要直观看配色时，打开[参考图与深浅色板](design/reference-board.html)；图片来源和保存信息见[参考资料说明](design/references/README.md)。

| 用途           | 已选参考                           | 应采用的特征                                         |
| -------------- | ---------------------------------- | ---------------------------------------------------- |
| 侧栏结构       | 侧栏笔记图四                       | 紧凑导航、功能分组、展开与收起的对应关系             |
| 整页层次       | LeonAnd 工作台                     | 连续的玻璃环境、侧栏与顶部工具区、适合阅读的内容表面 |
| 颜色与玻璃观感 | Harbor 冷蓝灰，辅以 Vorssaint 图片 | 冷色基调、背景透入、柔和边缘与局部状态色             |
| 导航状态与尺寸 | Harbor 共享导航组件                | 统一选中态、行高、间距和折叠表现，新增页面直接复用   |

### 侧栏采用图四

[已选侧栏参考：原笔记图四，展示展开与收起两种形态的来源与本地缓存说明](design/references/README.md)

采用图中的导航分组、紧凑排列及两种宽度之间的对应关系。图中的黑色底与偏紫选中区域不改变 Harbor 的冷蓝灰配色。搜索控件可以参考其层级与快捷键提示，Harbor 的全局搜索继续位于标题栏。原笔记的其他侧栏方案不作为并行标准。

### 整页层次参考 LeonAnd

[已选整页参考：LeonAnd 玻璃工作台的来源与本地缓存说明](design/references/README.md)

侧栏和顶部工具区共享背景色彩，内容面板通过更稳定的填充承载文字。Harbor 采用这种表面关系，并保留已有导航、内容密度和页面宽度规则。图中的大标题、营收图表与装饰背景不决定 Harbor 的页面结构。

### 音量面板：看材质、控件和颜色分工

[用户选定的外部参考：Vorssaint 音量面板的来源与本地缓存说明](design/references/README.md)

外框有很细的亮边，面板内部带冷蓝灰色。图标分段和音量区域略亮于外层，边缘柔和。蓝色标识选中项，绿色标识运行状态，橙色用于特定数值。大部分面积仍然留给中性的背景和文字。

### 系统面板：看背景透入和长面板的层次

[用户选定的外部参考：Vorssaint 系统面板的来源与本地缓存说明](design/references/README.md)

面板右侧能够看见背景带来的蓝色明暗变化。温度组、图表和底部操作靠浅薄的表面、间距与细分隔线区分。这里参考的是材质和层次；Harbor 的仓库、开发者、Issues 和 PR 仍然沿用适合阅读的列表结构。

图片只能证明这些视觉特征，无法确认实际软件采用的模糊算法、透明度、字体尺寸或原生框架。本文用“冷蓝毛玻璃”描述观感，不把它认定为某个官方材质实现。

## 风格要保留什么

- **背景能参与界面配色。** 玻璃上有来自背景的缓慢色彩变化，但背景中的文字和细节不能干扰操作。
- **同一扇窗口有连续的材质。** 标题栏、侧栏、主区和菜单属于同一个冷色体系，菜单打开后仍然像 Harbor 的一部分。
- **层次薄而清楚。** 分组可以稍亮，浮层可以更明确；避免每层都加厚底色、完整边框和外阴影。
- **圆角随容器层级增大。** 小控件紧凑，大浮层舒展。参考图经过放大，不能把其中的控件尺寸直接搬进工作台。
- **亮色有明确用途。** 蓝色引导操作，状态色说明结果，正文保持中性。彩色背景不应占满工作区。

## 颜色设计

### 基调与面积

深色主题以带蓝调的炭灰为基础，玻璃接受背景中的蓝色光感。避免把所有面板都填成均匀的深灰，也避免给整页覆盖一层高饱和度蓝色。浅色主题采用冷白和淡蓝灰，保留同样的颜色分工。

背景和正文应占据绝大部分视觉面积。主色用于链接、焦点和少量选中控件；绿色、橙色、红色与紫色集中出现在状态附近。头像、仓库语言色和正文图片保留数据本身的颜色。

Vorssaint 图片只有深色版本，候选浅色板最初由它推导。新增的 LeonAnd 图片提供浅色表面的层次参考。**Harbor 的浅色候选值仍需在实际界面中验证，不能把 LeonAnd 图片当作精确色值表。**

### 候选基础色板

表中的用途是稳定规则，色值是第一轮调试的起点。带百分比的颜色表示填充色的 alpha；最终看到的颜色还取决于它下面的内容。

| 用途             | 深色候选值      | 浅色候选值      | 使用说明                                             |
| ---------------- | --------------- | --------------- | ---------------------------------------------------- |
| 基础背景         | `#172131`       | `#EEF2F7`       | 无透明效果时的底色，也是色板的预览底色               |
| 主玻璃填充       | `#28364B / 64%` | `#F4F7FC / 68%` | 窗口材质的颜色倾向；需结合原生窗口效果调试           |
| 内容分组填充     | `#DCE8FF / 6%`  | `#FFFFFF / 40%` | 在主表面上轻轻提亮，通常不再单独模糊                 |
| 浮层填充         | `#2B3A51 / 72%` | `#F8FAFD / 78%` | 菜单、命令面板和临时浮层，保障选项可读               |
| 主要文字         | `#EDF3FA`       | `#202B3A`       | 标题、作者名、选项、重要内容                         |
| 次要文字         | `#AAB7C9`       | `#607085`       | 账号、描述、时间和辅助信息                           |
| 弱化图标         | `#7D8CA2`       | `#7B8899`       | 次要装饰或禁用提示，不用于关键说明                   |
| 细边界           | `#DCE8FF / 12%` | `#263A54 / 12%` | 面板轮廓和必要分隔线                                 |
| 边缘高光         | `#FFFFFF / 18%` | `#FFFFFF / 72%` | 玻璃边缘局部提亮，不能变成粗白框                     |
| 主色             | `#66AAFF`       | `#2768D3`       | 链接、焦点、可操作的强调                             |
| 强调控件选中底色 | `#66AAFF / 16%` | `#2768D3 / 10%` | 供明确采用蓝色强调的控件试做，导航状态由共享组件决定 |
| 悬停底色         | `#EDF3FA / 6%`  | `#202B3A / 5%`  | 中性反馈；选中态仍须更明确                           |

主色文字可以放在浅薄的选中底色上。需要实心蓝色按钮时，应单独校验按钮文字的对比度，不能直接把同一个蓝色同时当作链接色、按钮底色和按钮文字色。正文颜色保持稳定，不随背景壁纸直接取色。

### 状态色

| 语义             | 深色候选值 | 浅色候选值 | Harbor 中的用途               |
| ---------------- | ---------- | ---------- | ----------------------------- |
| 成功             | `#63C77D`  | `#257A46`  | 检查通过、完成状态、连接正常  |
| 警告             | `#E9B96B`  | `#90610D`  | 需要注意、等待处理的风险提示  |
| 错误或破坏性操作 | `#F17983`  | `#C64250`  | 检查失败、错误、删除操作      |
| 已合并           | `#BC9BEF`  | `#8055B9`  | PR 已合并；沿用 GitHub 的语义 |

状态尽量采用小图标、文字或浅底标签，同时写出含义。参考图中的橙色数值不意味着 Harbor 要增加第二个通用强调色；紫色也不用于给 Agent 页面做装饰。Diff 的增删色、语法高亮和仓库语言色各自遵循原有数据语义。

### 透明度与颜色必须一起看

仅降低背景 alpha，可能让文字后面的内容过于清楚；仅增加模糊，可能仍然得到一整块均匀的灰色。每次调试都要同时观察填充色、透明度、背后内容和边缘。

- 背景有蓝色明暗时，玻璃应有柔和的对应变化；换成中性背景后，仍应保持冷灰基调。
- 菜单应清楚浮在内容上，文字背后的仓库名和图标不能抢眼。不要通过压成近黑色来解决层次问题。
- 如果主窗口、内容区、菜单及内部列表都叠了填充色，最终效果会变得厚重。先检查这些叠层，再调整局部颜色。
- 透明度只用于表面填充；避免降低整个容器的 `opacity`，连带把文字和图标一起淡化。
- 减少透明度或无法使用玻璃效果时，采用同色系实色，保留文字、选中项和层级关系。

## 材质与容器

| 层级     | Harbor 中的位置                | 处理方式                                           |
| -------- | ------------------------------ | -------------------------------------------------- |
| 窗口底层 | 原生窗口及其背后环境           | 提供背景色和光感；具体效果以桌面运行结果为准       |
| 主表面   | 标题栏、侧栏、主内容区         | 保持颜色连续，通过轻微明度差区分区域               |
| 内容分组 | 筛选工具栏、设置组、少量汇总区 | 浅薄填充或细分隔，不给每行再加模糊和阴影           |
| 临时浮层 | 下拉菜单、命令面板、Sheet      | 一层完整玻璃；内部搜索框和列表避免重复铺不透明底色 |
| 控件状态 | Hover、选中、焦点              | 以浅填充、主色和清楚的焦点提示表达，层级不跳动     |

圆角、边缘高光和阴影要配合使用。浮层外阴影柔和收敛，顶边可略亮，四周轮廓应细。背景本身透入的光感可以保留；页面中不额外画彩色光斑、霓虹描边或装饰渐变来代替玻璃。

候选起点：普通控件圆角 6–8 px，内容分组 10–12 px，菜单 12–14 px，大浮层 16–20 px。窗口外框继续服从原生窗口形状与裁切规则。浮层模糊可从 24–32 px 范围试做，数值需结合实际叠层调整；不能把模糊半径当作风格验收结果。

## 文字、密度与状态

继续使用系统字体和 Lucide 图标。页面标题约 24 px，列表主文字 13–14 px，辅助信息 11–12 px。正文与菜单选项以常规字重为主；标题、分组标题和必要的当前项才适度加重。小号说明不能因追求朦胧感而难以阅读。

保持 4 px 的间距节奏，内容边距通常为 16–24 px，行内间距按信息关系安排。长描述自然换行；仓库选择列表展示最多两行摘要，详情保留全文。紧凑名称和标识可截断，并提供完整名称提示。蓝色选中态应同时具备位置、底色或勾选标记，不能只靠文字变蓝；键盘焦点也应与 Hover 有区别。

**导航选中态和行高由共享导航组件统一提供。** 蓝色选中底不再作为整套导航的默认设计方向。任何状态、圆角或行高调整都在共享导航中完成，新增页面不得覆盖这些样式。二级内容标签继续复用线形结构。

### 窗口外缘

窗口容器和标题栏使用统一的 10 px 圆角，与当前原生透明效果对齐。外缘只保留一条低对比细描边，移除重复的内高光和 CSS 外阴影；桌面阴影由原生窗口提供。内部浮层材质不随这次调整改变。

### 默认窗口与侧栏开关

主窗口默认以 1200 × 760 逻辑尺寸居中打开，保留缩放和最大化。屏幕可用区域不足时才缩小，尺寸计算统一由原生窗口模块处理。

首次打开显示 226 px 的完整导航，点击标题栏的独立侧栏按钮可将其收起为 58 px 图标栏。按钮使用中性的侧栏图标，通过悬停提示和焦点反馈说明操作；品牌组合采用 Lane D 双路径 Logo 和紧凑的 Repolane 文字，使用一致的前景色与较近的间距；侧栏按钮放在品牌组合右侧，通过额外留白区分操作。记住用户的选择，调整窗口宽度时不自动覆盖。1280 px 断点继续控制内容区布局，不再决定主导航是否显示文字。收起时保留各入口的名称提示、选中态和键盘焦点。

### 共享导航如何复用

主导航容器位于 [harbor-workspace.tsx](../src/features/workspace/harbor-workspace.tsx) 的 `PrimaryNavigation`。主入口、“更多”、账户和设置共用 [NavigationButton](../src/features/workspace/navigation-button.tsx)，由它提供 40 px 行高、图标与文字布局、收起时的提示和键盘焦点。选中与悬停样式使用 [src/index.css](../src/index.css) 的 `harbor-nav-item`。材质与选中配色仍在本次重构中验收。

- 新增页面接入现有工作区，继承它的侧栏，不在页面中再画一份导航。
- 页面提供导航数据、当前项与操作；行高、内边距、图标位置、选中态和焦点反馈由共享导航负责。
- 其他位置确需复用导航行时，直接使用 `NavigationButton`，避免复制 JSX 和样式。40 px 是当前实现值，后续变化也必须统一发生在共享层。
- 展开与收起保持导航顺序和当前项一致；图标模式提供名称提示与可访问名称。
- 导航调整同时检查主要入口、“更多”、账户和设置，避免它们因重复样式而出现不同的行高或反馈。

## 对应到 Harbor 的页面

| 区域                   | 应迁移的设计                                   | 需要保留的工作方式                                         |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| 标题栏和侧栏           | 连续的冷色玻璃、细亮边、柔和选中区域           | 现有导航、标题栏功能和自适应宽度                           |
| 热门开发者             | 列表上方的轻分组、安静的 Hover、清楚的文字层级 | 头像在前，作者、仓库与描述紧密成组；宽窗口不拆成远距离两列 |
| 语言筛选菜单           | 与窗口同色系的通透表面、轻边界、清楚的当前项   | 搜索、滚动、勾选、键盘操作；13 px 常规文字和紧凑行高       |
| 仓库、Issues、PR 列表  | 连续底色、浅薄状态标签、细分隔                 | 扫读密度、实际 GitHub 状态与列表返回位置                   |
| 正文、代码、Diff       | 同一冷色家族，必要时提高底色稳定性             | 长时间阅读和增删、语法、评论定位的可辨性                   |
| 命令面板和 Agent Sheet | 稍大的圆角、完整的一层玻璃、柔和浮起感         | 内容结构、输入焦点、关闭与返回操作                         |

Discovery 保持居中的最大内容宽度，标题、筛选与列表对齐。窄窗口通过换行和收纳次要信息适应，不能通过缩小文字或隐藏筛选入口换取整齐。

## 后续实现如何使用这份指南

开始设计时，按本指南的用途表打开对应参考和色板。侧栏看图四，整页层次看 LeonAnd，颜色遵循 Harbor 冷蓝灰。再读 `src/index.css`、共享导航和相邻页面，找到已有组件及其状态。视觉方向遵循本指南；具体的现有交互与数据行为以代码为准。

候选值应映射到已有的 `background`、`foreground`、`muted-foreground`、`primary`、状态色及 `--harbor-*-fill` 等语义 token。共用颜色在共用位置调整，不把本表的十六进制色值散落到页面中。当前筛选菜单的玻璃试做版也需要与参考图对照，不能因它已经写进代码就视为最终标准。

一次材质调整应选择能同时看到窗口、正文、控件和浮层的真实页面，并保留修改前后同尺寸截图。先确认主表面的颜色和背景透入程度，再看分组、菜单和选中项，避免各个局部单独调到不同方向。

### 验收要看什么

- **颜色与背景：** 在冷蓝、中性、明亮且有细节的背景下观察；背景能影响玻璃色调，文字和选中项仍然清楚。
- **深浅主题：** 浅色保留冷白层次，边界不消失；深色有明暗变化，菜单不会变成突兀的黑块。
- **材质连贯：** 菜单、搜索区和选项列表属于同一表面；内容分组没有层层模糊、厚阴影或粗边框。
- **布局与操作：** 在最小可用窗口和宽窗口检查中英文、长名称、键盘焦点、筛选、滚动和返回后的状态。
- **复杂内容：** 检查正文、Diff、状态色、加载与错误状态；不要只验收一张内容很少的静态截图。
- **运行环境：** 浏览器可检查页面内布局与叠层；涉及桌面背景透入的效果，还需在 Tauri 原生窗口观察。色板不代表运行效果。
- **降级显示：** 减少透明度时仍有完整层次；减少动态效果时仍有清楚反馈。

验收通过后再把采用的色值和尺寸记录为正式 token，并同步这份指南。尚未验证的候选参数继续保留候选标记。

## Implementation layout contracts

- Keep the system font stack in `src/index.css` (SF Pro on macOS). Use monospace for code,
  identifiers, and shortcuts. Do not add a display font to a feature page.
- Use a 24 px semibold page title, 13–14 px primary row text, and 11–12 px secondary metadata.
  Long descriptions should wrap naturally. Repository selector rows are a summary exception: show at most two description lines and retain the full text in details; compact names and identifiers may truncate with a full-name tooltip.
- Follow the 4 px spacing rhythm: 16–24 px content padding and 12–16 px row gaps. Keep compact
  controls at 6–8 px corners. Larger groups and overlays can use the guide's candidate radii
  when redesigned together; respect native window clipping. Avatars remain round.
- Searchable filter menus use `harbor-filter-trigger` and `harbor-filter-menu`: 13 px regular
  text, compact 28 px rows, a quiet scrollbar, and a single down chevron. Keep the inner Command
  transparent so the shared `harbor-popover` surface stays visible; avoid stacking opaque fills.
- Keep the shared title bar and primary navigation. The navigation starts expanded at 226 px and can be
  collapsed to a 58 px icon rail by clicking the title-bar sidebar button beside the product
  Logo and wordmark; persist the user’s choice. The Lane D brand mark remains visible.
  The `workspace-wide` (80rem) breakpoint still controls content layouts; the optional context rail is 52 px. Do not create a second
  page-level sidebar for filters that fit in a toolbar.
- Current primary navigation lives in `PrimaryNavigation` within
  `src/features/workspace/harbor-workspace.tsx`. Its main destinations, More trigger, account,
  and settings reuse `NavigationButton` from `src/features/workspace/navigation-button.tsx`.
  This shared control owns the 40 px row, icon/label layout, collapsed tooltip and keyboard
  focus. Selection and hover use `harbor-nav-item` in `src/index.css`. New pages inherit the
  shell; do not copy rows or override row dimensions/states in consumers.
- Reuse `WorkspacePageHeader` for list headers and `WorkspaceStaleNotice` for retained
  results after a failed refresh. For list/detail swaps, keep `useListScroll` in the parent,
  key it by the actual query parameters, and spread its viewport bindings onto ScrollArea.
  This preserves pane scroll without changing query keys or persisting state globally.
- Discovery uses a centered 1120 px maximum content width. Other workspaces may fill their pane.
  Page header, filters, and scrollable content should share alignment.
- Developer discovery rows keep the author, popular repository, and description in one vertical
  group at every width. Place the account beside the name when space allows; wrap it below when
  needed. Keep the avatar in a compact leading column and descriptions within a readable line
  length. Do not split related identity and project content into distant proportional columns.
- Preserve `min-w-0`, `min-h-0`, and pane-local `ScrollArea` containment. At the 900 px minimum
  app width, secondary row content stacks below the primary identity; text must not stretch the
  window or hide controls. Use the shared 1200 × 760 logical startup size with work-area clamping; do not resize the window from feature views.

### 仓库选择列表与详情头部 — 2026-09-10

用户已确认紧凑摘要列表方案。仓库名为主文字，所有者另起一行弱化显示；中性仓库图标与名称顶部对齐。列表描述最多两行，无描述时留空，不使用 URL 替代。普通行以 96 px 最小高度和 12 px 纵向内边距试排，星标日期等真实状态可增加高度。选中项沿用共享选中填充，不叠加卡片边框；键盘焦点继续由 Button 提供。

详情名称允许换行，描述使用整个详情区宽度，操作区独立排列并按可用宽度换行。描述默认最多三行，溢出时显示“展开描述”；展开区在窄详情区最高 96 px、宽详情区最高 112 px，支持键盘滚动和收起。切换仓库后恢复收起状态。完整内容始终保留，筛选与选中逻辑不随布局调整改变。
