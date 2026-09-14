import type { MonitorSnapshot } from "@/features/opportunities/opportunity-data";

export function createOpportunityFixtures(scenario: string | null, writes: boolean) {
  const config = {
    repositories: ["harbor-labs/ui-kit", "harbor-labs/workbench", "harbor-labs/docs"],
    preferences: "TypeScript / React，优先复现步骤清晰的小问题。",
    endpoint: "https://model.example/v1",
    model: "preview-model",
    intervalSeconds: 300,
    includeLabels: [],
    excludeLabels: ["duplicate"],
    language: "zh-CN",
  };
  const names = [
    "关闭弹窗后键盘焦点丢失",
    "搜索结果切换后滚动位置重置",
    "窄窗口下筛选菜单超出边界",
    "补充本地开发启动说明",
    "列表加载失败后缺少重试入口",
  ];
  const state: MonitorSnapshot = {
    config,
    hasApiKey: true,
    enabled: true,
    busy: scenario === "pending",
    lastCheckedAt: "2026-09-13T06:32:00Z",
    nextCheckAt: 0,
    error: scenario === "failure" ? "rateLimit" : scenario === "refresh-failed" ? "network" : null,
    pendingCount: 0,
    items: Array.from({ length: scenario === "dense" || scenario === "long" ? 45 : 5 }, (_, i) => ({
      id: `harbor-labs/ui-kit#${128 + i}`,
      repository: config.repositories[i % 3],
      number: 128 + i,
      title:
        names[i % 5] +
        (scenario === "long"
          ? " — Keyboard navigation with unusually long repository and issue descriptions ".repeat(
              3
            )
          : ""),
      updatedAt: "2026-09-13T06:30:00Z",
      checkedAt: "2026-09-13T06:32:00Z",
      pending: scenario === "stale" || scenario === "refresh-failed",
      error: scenario === "refresh-failed" ? "network" : null,
      analysis: {
        decision: i % 3 === 2 ? "clarify" : "recommend",
        summary: "关闭弹窗后，焦点没有回到触发按钮，影响键盘连续操作。",
        reasons: [
          "与你关注的 TypeScript / React 问题匹配",
          "问题描述包含复现步骤，可先验证焦点恢复行为",
        ],
        uncertainties: ["最新评论中是否已有贡献者接手", "仓库贡献规则与关联 PR 尚需核查"],
        firstStep: "使用键盘打开并关闭弹窗，确认焦点返回位置。",
        claimDraft:
          "Hi, I would like to investigate the focus restoration issue. Is anyone already working on this? I can first verify the reproduction steps and share my findings.",
      },
    })),
  };
  if (scenario === "setup") {
    state.config = { ...config, repositories: [], model: "", endpoint: "" };
    state.hasApiKey = false;
    state.enabled = false;
    state.items = [];
  }
  if (scenario === "empty") state.items = [];
  return (command: string, args: Record<string, unknown>, empty: boolean) => {
    if (!command.startsWith("opportunity_")) return undefined;
    if (command !== "opportunity_snapshot" && !writes)
      throw {
        code: "previewWriteDisabled",
        message: "Enable preview writes to simulate this action.",
      };
    if (command === "opportunity_set_enabled") {
      state.enabled = !!args.enabled;
      state.busy = false;
    } else if (command === "opportunity_save_config") {
      state.config = structuredClone(args.config) as typeof config;
      state.hasApiKey = true;
    } else if (command === "opportunity_check") {
      state.lastCheckedAt = new Date().toISOString();
      state.error = null;
      state.busy = false;
      for (const item of state.items) {
        item.pending = false;
        item.error = null;
        item.checkedAt = state.lastCheckedAt;
      }
    } else if (command !== "opportunity_snapshot")
      throw { code: "previewFixtureMissing", message: "Unknown opportunity preview command." };
    return structuredClone({ ...state, items: empty ? [] : state.items });
  };
}
