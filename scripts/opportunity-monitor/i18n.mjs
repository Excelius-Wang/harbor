import i18next from "i18next";

const en = {
  empty: "No new opportunities. Use --list to view saved recommendations.",
  decision: "Decision: {{decision}} | Availability: unverified | Checked: {{time}}",
  reasons: "Reasons:",
  uncertainties: "Uncertainties:",
  scope:
    "Scope: issue and comments only. Check contribution rules, linked PRs and source code manually.",
  firstStep: "First step: {{step}}",
  draft: "Claim draft (not sent; recheck the issue and contribution rules before posting):",
  recommend: "Recommended",
  clarify: "Needs clarification",
  help: `Repository opportunity monitor (Node.js 22.13+)

pnpm monitor --config monitor.local/config.json [options]
  --watch                 Repeat checks until Ctrl-C (foreground process)
  --history-days <1-90>    Analyze recent existing issues; one-shot only
  --list                  Read saved opportunities without network access
  --db <path>             Default: monitor.local/opportunities.sqlite
  --json                  Output JSON instead of a plain-text brief
  --lang <en|zh-CN>       Output language (default: en)
  --help                  Show this help

Default: one incremental check. First check establishes a baseline; existing issues
are not recommended unless --history-days is supplied. Drafts are never posted.
Required for checks: GH_TOKEN (or GITHUB_TOKEN), MONITOR_AI_BASE_URL,
MONITOR_AI_API_KEY, MONITOR_AI_MODEL. Model requests include issue text/comments.
`,
};
const zh = {
  empty: "暂无新机会。使用 --list 查看已保存的推荐。",
  decision: "建议：{{decision}}｜认领状态：未核实｜检查时间：{{time}}",
  reasons: "推荐理由：",
  uncertainties: "待确认：",
  scope: "分析范围：仅包含 issue 和评论。贡献规则、关联 PR 和源代码需要人工核查。",
  firstStep: "建议第一步：{{step}}",
  draft: "认领草稿（尚未发送，请先复查 issue 最新状态和仓库贡献规则）：",
  recommend: "推荐参与",
  clarify: "需要澄清",
  help: `仓库贡献机会监控（需要 Node.js 22.13+）

pnpm monitor --config monitor.local/config.json [选项]
  --watch                 持续检查，按 Ctrl-C 停止（在前台运行）
  --history-days <1-90>    试筛最近几天创建的已有 issue，仅支持单次运行
  --list                  离线查看已保存的机会
  --db <路径>             默认：monitor.local/opportunities.sqlite
  --json                  输出 JSON 格式
  --lang <en|zh-CN>       输出语言（默认 en）
  --help                  显示帮助

默认执行一次增量检查。首次检查建立基线，已有 issue 需要使用 --history-days 试筛。
工具只生成草稿，不会发送评论。
执行检查需要 GH_TOKEN（或 GITHUB_TOKEN）、MONITOR_AI_BASE_URL、
MONITOR_AI_API_KEY 和 MONITOR_AI_MODEL。模型请求会包含 issue 正文和评论。
`,
};
export function translator(language = "en") {
  const instance = i18next.createInstance();
  instance.init({
    lng: language,
    showSupportNotice: false,
    fallbackLng: "en",
    initAsync: false,
    interpolation: { escapeValue: false },
    resources: { en: { translation: en }, "zh-CN": { translation: zh } },
  });
  return instance.t.bind(instance);
}
