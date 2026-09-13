import { invoke } from "@tauri-apps/api/core";

export type MonitorConfig = {
  repositories: string[];
  preferences: string;
  endpoint: string;
  model: string;
  intervalSeconds: number;
  includeLabels: string[];
  excludeLabels: string[];
  language: string;
};
export type Opportunity = {
  id: string;
  repository: string;
  number: number;
  title: string;
  updatedAt: string;
  checkedAt: string | null;
  pending: boolean;
  error: string | null;
  analysis: {
    decision: "recommend" | "clarify" | "skip";
    summary: string;
    reasons: string[];
    uncertainties: string[];
    firstStep: string;
    claimDraft: string;
  } | null;
};
export type MonitorSnapshot = {
  config: MonitorConfig;
  hasApiKey: boolean;
  enabled: boolean;
  busy: boolean;
  lastCheckedAt: string | null;
  nextCheckAt: number;
  error: string | null;
  items: Opportunity[];
  pendingCount: number;
};
export const monitorKey = ["opportunity-monitor"] as const;
export const readMonitor = () => invoke<MonitorSnapshot>("opportunity_snapshot");
export const saveMonitor = (config: MonitorConfig, apiKey?: string) =>
  invoke<MonitorSnapshot>("opportunity_save_config", { config, apiKey: apiKey || null });
export const setMonitorEnabled = (enabled: boolean) =>
  invoke<MonitorSnapshot>("opportunity_set_enabled", { enabled });
export const checkMonitor = (historyDays = 0) =>
  invoke<MonitorSnapshot>("opportunity_check", { historyDays });
export function monitorError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  return "network";
}
export function filterOpportunities(
  items: Opportunity[],
  search: string,
  repository: string,
  decision: string
) {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      (!repository || item.repository === repository) &&
      (!decision || item.analysis?.decision === decision) &&
      `${item.title} ${item.repository} #${item.number}`.toLocaleLowerCase().includes(query)
  );
}
