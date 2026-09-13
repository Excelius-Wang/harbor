# 仓库贡献机会监控

现在提供 App 页面和独立命令行工具：读取指定仓库的新 issue，按规则初筛，用配置的模型分析，再输出推荐理由、待确认问题、开发第一步和认领草稿。实际开发和留言由用户完成。

工具不发送 GitHub 评论、不分配 issue、不修改仓库，也不启动编码 agent。没有选择具体仓库、配置模型并执行命令时，不会开始监控。

## 在 App 中使用

App 左侧导航新增“贡献机会”。进入“监控设置”，填写仓库、贡献偏好、模型 API 基础地址、模型名称和密钥，保存后点击“立即检查”或“开始监控”。首次检查建立基线；没有机会时，可点击“试筛最近 7 天”评估已有问题。

GitHub 使用 App 的现有登录。模型接口需要支持 Chat Completions JSON 模式；模型密钥保存在系统凭据库，不返回页面。分析使用保存配置时的界面语言，切换界面语言不会自动翻译已有分析。

监控由 Rust 后台负责，切换页面或隐藏窗口后继续运行。暂停会取消当前请求，退出 App 后进程停止。已启用的监控在下次启动时恢复并补查；断开 GitHub 登录会暂停监控。每轮最多分析 10 个候选，剩余任务留待后续检查。

App 中已有推荐在重新分析时会标记为待更新，并禁用草稿复制；分析完成后再更新结果。切换 GitHub 账号会重置页面缓存，后台返回结果时也会核对当前账号，只展示该账号的推荐。

原生状态保存在 App 数据目录中的 `opportunities.sqlite`，与下方 CLI 的数据库独立，目前不自动迁移 CLI 历史结果。App 不需要安装 Node。推荐列表可按仓库、建议和关键词筛选；宽窗口并排阅读，窄窗口在列表和详情间切换，并保留列表滚动位置。

认领状态始终需要核实。复制草稿后，由用户到 GitHub 确认最新讨论和贡献规则，再决定是否发言。App 不会发送评论、认领或创建 PR。

原生实现及本次验证见[App 接入记录](verification/opportunity-app/README.md)。

## 命令行使用

需要 Node.js 22.13 或更新版本、项目依赖，以及 GitHub 读取凭据和支持 Chat Completions JSON 模式的模型服务。Node.js 22 的内置 SQLite 会输出实验性功能提示。

```bash
pnpm install
mkdir -p monitor.local
cp scripts/opportunity-monitor/config.example.json monitor.local/config.json
```

编辑 `monitor.local/config.json`，把 `owner/repository` 换成实际仓库。`preferences` 填写技术偏好、可接受的任务范围及推荐正文语言。

| 配置              | 含义                                                      |
| ----------------- | --------------------------------------------------------- |
| `repositories`    | 1～20 个仓库，格式为 `owner/name`                         |
| `preferences`     | 给模型的个人偏好，不包含密钥                              |
| `includeLabels`   | 非空时，至少匹配其中一个标签才进入分析                    |
| `excludeLabels`   | 匹配任意一个标签即排除，优先于包含规则                    |
| `intervalSeconds` | 检查间隔，默认 300 秒，最少 60 秒                         |
| `maxAnalyses`     | 每轮最多处理的待筛选候选数，默认 10；剩余候选留到后续运行 |

在运行进程的环境中设置：

- `GH_TOKEN` 或 `GITHUB_TOKEN`：能够读取目标仓库 issue 和评论的 GitHub 凭据。工具不需要写权限。
- `MONITOR_AI_BASE_URL`：模型服务的 HTTPS API 基础地址，例如服务文档提供的 `/v1` 地址。程序在其后追加 `/chat/completions`。
- `MONITOR_AI_API_KEY`：该模型服务的凭据。
- `MONITOR_AI_MODEL`：服务支持的模型标识，不预设某个模型。

程序不自动读取 `.env`，也不读取桌面应用的凭据库。模型请求包含候选 issue 正文和评论；选择有权处理这些内容的服务。不要把密钥放入配置、命令参数或提交到 Git。

先试筛最近 7 天创建的 issue：

```bash
pnpm monitor --history-days 7 --lang zh-CN
```

执行一次增量检查，或持续运行：

```bash
pnpm monitor --lang zh-CN
pnpm monitor --watch --lang zh-CN
```

持续运行使用前台进程，按 Ctrl-C 停止。电脑休眠、关机或进程退出后不会检查；重新启动会从保存的进度补查。真正全天运行需要常驻机器，本次没有安装后台服务。

查看本地已保存的推荐，不访问网络、不需要凭据：

```bash
pnpm monitor --list --lang zh-CN
```

需要程序读取 JSON 时直接运行 Node，避免包管理器自己的启动提示混入标准输出：

```bash
node scripts/opportunity-monitor/cli.mjs --list --json
```

`--config` 可指定其他配置文件，`--db` 可指定其他数据库。相对路径均相对于命令的当前目录。默认配置和数据库放在已忽略的 `monitor.local/` 中；使用其他路径时自行确保不提交本地数据。

## 推荐代表什么

推荐包含 `recommend`（推荐参与）或 `clarify`（需要澄清）。明确规则排除、模型认为不适合的 issue 留在数据库，不进入推荐输出。候选默认排除已关闭、锁定讨论和已有正式负责人的 issue。

每份简报标明检查时间，认领状态始终为“未核实”。模型会阅读评论中的认领线索，但没有负责人不能证明无人处理。本期没有读取源代码、仓库贡献规则或系统查询关联 PR；这些需要用户在发言前核实。模型提供的工作入口和难度判断也不等于代码验证结论。

草稿只是建议文字，工具不会发送。请在 GitHub 复查最新状态、贡献规则和其他人的处理进展，再决定是否留言。

## 同步与恢复

- 首次增量运行保存起始时间。旧 issue 不会因为被修改就自动导入；使用 `--history-days 1` 到 `90` 显式试筛历史问题。
- 已记录的历史候选会继续跟踪更新。历史试筛不会跳过尚未补查的增量区间。
- 按仓库分别保存检查进度，完成分页读取后才推进游标，并重叠读取一分钟。同一仓库的分页失败不会跳过未读数据。
- 候选和分析状态保存在 SQLite。未完成的分析会在后续运行重试；重复收到相同 issue 状态不会再次调用模型。
- 偏好、标签规则或模型配置变化时，已有候选重新进入筛选。修改配置后需重新启动进程。
- 一轮最多处理 `maxAnalyses` 个候选，包含规则排除的候选。失败候选排在未尝试候选后，避免单个故障阻塞所有任务。
- 网络超时和服务端临时故障最多尝试三次；限流时保存下次可请求时间。单次运行有错误时退出码为 1，持续运行会保留错误并等待后续检查。
- GitHub 请求只使用 GET。分页最多 100 页；单个讨论最多 10 页、模型输入最多 60,000 字符，超出限制报错，不会截断后当作完整上下文。
- 同一数据库只允许一个检查进程。进程意外退出时当前事务回滚，后续可重试；已经提交的结果可用 `--list` 找回。终端输出不是保证恰好送达一次的通知服务。

`--list` 展示保存时的快照，不保证仓库此刻仍是同一状态。更新中的候选会暂时退出推荐列表，等待重新分析。

## 实现边界

`scripts/opportunity-monitor/cli.mjs` 负责参数和运行周期，`clients.mjs` 封装 GitHub 读取与模型调用，`monitor.mjs` 处理筛选流程，`store.mjs` 管理持久化。命令行使用 Node 内置 SQLite 和项目已有的 i18next。App 接入另由 `src-tauri/src/opportunity/` 提供原生实现，新增最小功能集的 rusqlite 依赖，不打包 Node。

后续可以在已有 GitHub 读取接口旁增加独立的认领执行接口，并在执行前复核最新状态。当前不预建任务平台、消息队列或多 agent 编排。

## 验证

```bash
pnpm exec vitest run scripts/opportunity-monitor/monitor.test.mjs
pnpm exec prettier --check scripts/opportunity-monitor docs/OPPORTUNITY_MONITOR.md
pnpm check
```

自动测试使用隔离数据库与模拟网络，不会访问或修改真实 GitHub 数据。真实仓库上的推荐质量和模型服务兼容性，需要配置首批目标和模型后单独试用。

实现参考：[GitHub issue 接口](https://docs.github.com/en/rest/issues/issues#list-repository-issues)、[GitHub API 调用建议](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)、[Chat Completions 接口](https://developers.openai.com/api/reference/typescript/resources/chat/subresources/completions/methods/create)、[Node.js SQLite](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html)。

本次开发验证（2026-09-13）：监控工具的 18 项测试通过，包含真实命令行配合模拟 HTTP 的完整运行与重复检查；全仓 `pnpm check` 通过，合计 707 项测试、141 个测试文件。格式和构建检查通过。既有 Hook 与构建包体积提示仍存在，Node.js 22 的 SQLite 实验性提示不影响本次检查结果。尚未进行真实仓库和模型服务试用。
