import {
  isTauri,
  invoke as nativeInvoke,
  type InvokeArgs,
  type InvokeOptions,
} from "@tauri-apps/api/core";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { GitHubRepository } from "@/features/github/github-data";
import "./preview.css";
import { workspaceFixture } from "./workspace-fixtures";
import { moreFixture } from "./more-fixtures";
import { repositoryFixture } from "./repository-fixtures";
import { administrationFixture } from "./administration-fixtures";
import { codeFixture } from "./code-fixtures";

export const previewCalls: string[] = [];
let previewHandler:
  | ((command: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<unknown>)
  | undefined;

export function invokePreview<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions
): Promise<T> {
  if (!previewHandler)
    return Promise.reject({
      code: "previewNotInstalled",
      message: "The UI preview is not installed.",
    });
  return previewHandler(command, args, options) as Promise<T>;
}

const repositories: GitHubRepository[] = [
  [
    "harbor",
    "A focused GitHub workspace for reading code, reviewing changes and keeping work in view.",
    "TypeScript",
  ],
  [
    "workflow-engine",
    "Durable workflows with typed events, retries and a small runtime for background jobs.",
    "Rust",
  ],
  [
    "accessible-components",
    "Keyboard-first components, tested across languages, themes and compact desktop windows.",
    "TypeScript",
  ],
  [
    "developer-tools-and-observability",
    "Tools for debugging distributed services. Long descriptions wrap within the list so filters and actions remain reachable.",
    "Go",
  ],
  [
    "notebook",
    "A small collection of working notes, code examples and practical documentation.",
    "Python",
  ],
  ["terminal", "A fast terminal workspace with sessions, search and readable output.", "Rust"],
  ["design-system", "Shared tokens and components for everyday product workflows.", "CSS"],
  ["query-cache", "A predictable cache for asynchronous queries and mutations.", "TypeScript"],
].map(([name, description, language], index) => ({
  id: index + 1,
  owner: "harbor-preview",
  name,
  fullName: `harbor-preview/${name}`,
  description,
  language,
  url: `https://github.com/harbor-preview/${name}`,
  stars: 1348 - index * 143,
  forks: 124 - index * 11,
  openIssues: 12,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
  updatedAt: "2026-09-01T10:00:00Z",
}));

const languages = [
  "TypeScript",
  "Rust",
  "Python",
  "Go",
  "JavaScript",
  "C++",
  "C#",
  "CSS",
  "Java",
  "Kotlin",
  "Swift",
  "Ruby",
  "C",
  "HTML",
  "Shell",
].map((name) => ({ name, slug: name.toLowerCase() }));

export function installPreview() {
  Object.assign(window, { __harborPreviewCalls: previewCalls });
  // Native window commands remain real; every business command is intercepted.
  const native = isTauri();
  const parameters = new URLSearchParams(location.search);
  const state = parameters.get("state") ?? "populated";
  const scenarioCommands = parameters.get("commands")?.split(",").filter(Boolean);
  const requestCounts = new Map<string, number>();
  if (!native) {
    mockWindows("main");
    Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  }
  if (!native)
    document.documentElement.dataset.previewBackground = parameters.get("background") ?? "cool";
  document.documentElement.dataset.uiPreview = "true";

  // Native bridge properties are readonly. Only the browser uses the SDK mock.
  previewHandler = async (command, payload, options) => {
    const commandState =
      !scenarioCommands?.length || scenarioCommands.includes(command) ? state : "populated";
    const args = (payload ?? {}) as Record<string, unknown>;
    previewCalls.push(command);
    if (
      command.startsWith("plugin:window|") ||
      command.startsWith("plugin:webview|") ||
      (native && command.startsWith("plugin:event|"))
    ) {
      if (native) return nativeInvoke(command, payload, options);
      if (command.endsWith("get_all_windows")) return ["main"];
      if (command.endsWith("is_maximized")) return false;
      return null;
    }
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:updater|check") return null;
    if (command === "update_tray_menu") return null;
    if (command === "github_login_availability") return { available: false, reason: "UI preview" };
    if (command === "github_connection_status")
      return { connected: true, identity: { login: "harbor-preview" } };
    if (command.startsWith("github_")) {
      if (commandState === "loading") return new Promise(() => {});
      await new Promise((resolve) => setTimeout(resolve, 120));
      const requestKey = JSON.stringify([command, args]);
      const attempts = (requestCounts.get(requestKey) ?? 0) + 1;
      requestCounts.set(requestKey, attempts);
      if (commandState === "error" || (commandState === "stale" && attempts > 1))
        throw {
          code: "preview",
          message: "Preview request failed. Retry to check error feedback.",
        };
    }
    if (command === "github_search_discovery") {
      return {
        kind: args.kind,
        results: commandState === "empty" ? [] : args.kind === "repositories" ? repositories : [],
        totalCount: commandState === "empty" ? 0 : repositories.length,
        incompleteResults: false,
        page: 1,
        hasPrevious: false,
        hasMore: false,
      };
    }
    if (command === "github_list_trending_developers") {
      return {
        period: args.period,
        languages,
        developers:
          commandState === "empty"
            ? []
            : repositories.map((repo, index) => ({
                rank: index + 1,
                login: `developer-${index + 1}`,
                name: [
                  "Alex Morgan",
                  "Lin Chen / 陈林",
                  "Sam Rivera",
                  "A developer with a deliberately long display name",
                ][index % 4],
                avatarUrl: null,
                popularRepository: {
                  fullName: repo.fullName,
                  url: repo.url,
                  description: repo.description,
                },
              })),
      };
    }
    if (command === "github_list_developer_feed")
      return { events: [], page: 1, hasPrevious: false, hasMore: false };
    const workspaceResult = workspaceFixture(
      command,
      args,
      repositories,
      commandState === "empty",
      parameters.get("pr")
    );
    const fixture =
      workspaceResult === undefined
        ? moreFixture(command, args, repositories, commandState === "empty")
        : workspaceResult;
    if (fixture !== undefined) return fixture;
    const repositoryResult = repositoryFixture(
      command,
      args,
      repositories,
      commandState === "empty"
    );
    if (repositoryResult !== undefined) return repositoryResult;
    const administrationResult = administrationFixture(
      command,
      args,
      repositories,
      commandState === "empty"
    );
    if (administrationResult !== undefined) return administrationResult;
    const codeResult = codeFixture(command, args, commandState === "empty");
    if (codeResult !== undefined) return codeResult;
    // Missing fixtures fail visibly. Never fall through to a real GitHub write.
    throw { code: "previewFixtureMissing", message: `No UI preview fixture for ${command}` };
  };
  if (!native) mockIPC(previewHandler, { shouldMockEvents: true });
}

// Fixture edits need a clean bridge and root, including native preview reloads.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
