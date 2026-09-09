import { createTransferFixtures } from "./transfer-fixtures";
import { createIssueActionFixtures } from "./issue-action-fixtures";
import { createPagesActionFixtures } from "./pages-action-fixtures";
import { createDiscussionActionFixtures } from "./discussion-action-fixtures";
import { createPackageFixtures } from "./package-fixtures";
import { createWorkflowFixtures } from "./workflow-fixtures";
import { createWikiFixtures } from "./wiki-fixtures";
import { createRepositoryActionFixtures } from "./repository-action-fixtures";
import { createConversationActionFixtures } from "./conversation-action-fixtures";
import { createProjectFixtures } from "./project-fixtures";
import { createGistFixtures } from "./gist-fixtures";
import { createNotificationTargetFixtures } from "./notification-target-fixtures";
import { discoveryFixture } from "./discovery-fixtures";
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

const repositoryFixtures: GitHubRepository[] = [
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
  // Native window calls remain real; application business invokes are intercepted.
  const native = isTauri();
  const parameters = new URLSearchParams(location.search);
  const openedUrls: string[] = [];
  Object.assign(window, { __harborPreviewOpenedUrls: openedUrls });
  const state = parameters.get("state") ?? "populated";
  const repositoryActions = parameters.get("repoActions");
  const externalRepository = repositoryActions && repositoryActions !== "owned";
  const repositories = repositoryFixtures.map((repository, index) => ({
    ...repository,
    ...(index === 0 && parameters.get("pages") === "archived" ? { isArchived: true } : {}),
    ...(index === 0 && parameters.get("repo") === "private" ? { isPrivate: true } : {}),
    ...(index === 0 && externalRepository
      ? {
          owner: "harbor-community",
          fullName: `harbor-community/${repository.name}`,
          url: `https://github.com/harbor-community/${repository.name}`,
        }
      : {}),
  }));
  const repositoryActionFixtures = createRepositoryActionFixtures(
    repositories,
    repositoryActions,
    parameters.get("writes") === "accept"
  );
  const discussionActionFixtures = createDiscussionActionFixtures(
    repositories,
    parameters.get("discussions"),
    parameters.get("writes") === "accept"
  );
  const pagesActionFixtures = createPagesActionFixtures(
    repositories,
    parameters.get("pages"),
    parameters.get("writes") === "accept"
  );
  const transferFixtures = createTransferFixtures(
    repositories,
    parameters.get("transfers"),
    parameters.get("writes") === "accept"
  );
  const notificationTargets = parameters.get("notifications") === "targets";
  const packageFixtures = createPackageFixtures(
    parameters.get("packages"),
    parameters.get("writes") === "accept"
  );
  const gistFixtures = createGistFixtures(
    parameters.get("gists"),
    parameters.get("writes") === "accept"
  );
  const projectFixtures = createProjectFixtures(
    repositories,
    parameters.get("projects"),
    parameters.get("writes") === "accept"
  );
  const issueActionFixtures = createIssueActionFixtures(
    repositories,
    parameters.get("issues"),
    parameters.get("writes") === "accept"
  );
  const conversationActionFixtures = createConversationActionFixtures(repositories, {
    conversation: parameters.get("conversation"),
    reactions: parameters.get("reactions"),
    pins: parameters.get("pins"),
    acceptWrites: parameters.get("writes") === "accept",
    pullRequest: parameters.get("pr"),
  });
  const workflowFixtures = createWorkflowFixtures(
    repositories,
    parameters.get("actions"),
    parameters.get("writes") === "accept",
    notificationTargets
  );
  const notificationFixtures = createNotificationTargetFixtures(repositories, notificationTargets);
  const wikiFixtures = createWikiFixtures(
    repositories,
    parameters.get("wiki"),
    parameters.get("writes") === "accept"
  );
  const scenarioCommands = parameters.get("commands")?.split(",").filter(Boolean);
  const requestCounts = new Map<string, number>();
  const shortcuts = new Set(
    [localStorage.getItem("global-shortcut-show-main")].filter((value): value is string =>
      Boolean(value)
    )
  );
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
    if (command === "plugin:updater|check") {
      const updateState = parameters.get("update");
      if (updateState === "loading") return new Promise(() => {});
      if (updateState === "error") throw new Error("Preview update check failed");
      if (updateState === "available")
        return {
          rid: 91000,
          currentVersion: "0.1.0",
          version: "0.2.0",
          date: "2026-09-06",
          body:
            "Harbor preview release notes.\n\n" +
            "Keep repository navigation, review controls and drafts readable across window sizes.\n\n".repeat(
              8
            ),
          rawJson: {},
        };
      return null;
    }
    if (command === "plugin:resources|close" && args.rid === 91000) return null;
    if (!native && command.startsWith("plugin:global-shortcut|")) {
      if (command.endsWith("is_registered")) return shortcuts.has(String(args.shortcut));
      const shortcutState = parameters.get("shortcut");
      if (shortcutState === "loading") return new Promise(() => {});
      if (shortcutState === "error") throw new Error("Preview shortcut registration failed");
      if (Array.isArray(args.shortcuts))
        for (const shortcut of args.shortcuts) {
          if (command.endsWith("|register")) shortcuts.add(String(shortcut));
          else if (command.endsWith("|unregister")) shortcuts.delete(String(shortcut));
        }
      if (command.endsWith("unregister_all")) shortcuts.clear();
      return null;
    }
    if (command === "update_tray_menu") return null;
    if (command === "github_login_availability") {
      const auth = parameters.get("auth");
      if (auth === "loading") return new Promise(() => {});
      await new Promise((resolve) => setTimeout(resolve, 120));
      const attempt = (requestCounts.get(command) ?? 0) + 1;
      requestCounts.set(command, attempt);
      if (auth === "availability-error" && attempt === 1)
        throw new Error("Preview sign-in check failed");
      return { configured: auth !== "unavailable" };
    }
    if (
      command === "plugin:opener|open_url" &&
      args.url === "https://example.invalid/harbor-preview-auth"
    )
      return null;
    if (
      !native &&
      parameters.get("links") === "record" &&
      command === "plugin:opener|open_url" &&
      typeof args.url === "string"
    ) {
      const url = new URL(args.url);
      if (url.protocol === "https:" && ["github.com", "gist.github.com"].includes(url.hostname)) {
        openedUrls.push(args.url);
        return null;
      }
    }
    if (command === "github_connection_status")
      return { connected: true, identity: { login: "harbor-preview" } };
    if (command.startsWith("github_") || command === "repository_context_ask") {
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
    if (command === "github_begin_login")
      return { authorizationUrl: "https://example.invalid/harbor-preview-auth" };
    if (command === "github_disconnect") return { connected: false };
    if (command === "repository_context_ask") {
      if (parameters.get("agent") === "slow")
        await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        repository: `${args.owner}/${args.repository}`,
        provider: "Controlled preview",
        answer:
          "This is a controlled response for the selected repository.\n\n" +
          "Repository navigation keeps lists, reading surfaces and review actions together. A long response stays inside this pane while the question control remains available.\n\n".repeat(
            12
          ),
      };
    }
    if (
      command === "github_list_developer_feed" &&
      parameters.get("discovery") === "next-loading" &&
      Number(args.page) > 1
    )
      return new Promise(() => {});
    const discoveryResult = discoveryFixture(
      command,
      args,
      repositories,
      commandState === "empty",
      parameters.get("discovery")
    );
    if (discoveryResult !== undefined) return discoveryResult;
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
    const notificationResult = notificationFixtures(command, args, commandState === "empty");
    if (notificationResult !== undefined) return notificationResult;
    const wikiResult = wikiFixtures(command, args, commandState === "empty");
    if (wikiResult !== undefined) return wikiResult;
    const workflowResult = workflowFixtures(command, args, commandState === "empty");
    if (workflowResult !== undefined) return workflowResult;
    const repositoryActionResult = repositoryActionFixtures(
      command,
      args,
      commandState === "empty"
    );
    if (repositoryActionResult !== undefined) return repositoryActionResult;
    const transferResult = transferFixtures(command, args, commandState === "empty");
    if (transferResult !== undefined) return transferResult;
    const issueActionResult = issueActionFixtures(command, args, commandState === "empty");
    if (issueActionResult !== undefined) return issueActionResult;
    const pagesActionResult = pagesActionFixtures(command, args, commandState === "empty");
    if (pagesActionResult !== undefined) return pagesActionResult;
    const discussionActionResult = discussionActionFixtures(
      command,
      args,
      commandState === "empty"
    );
    if (discussionActionResult !== undefined) return discussionActionResult;
    const conversationActionResult = conversationActionFixtures(
      command,
      args,
      commandState === "empty"
    );
    if (conversationActionResult !== undefined) return conversationActionResult;
    const projectResult = projectFixtures(command, args, commandState === "empty");
    if (projectResult !== undefined) return projectResult;
    const packageResult = packageFixtures(command, args, commandState === "empty");
    if (packageResult !== undefined) return packageResult;
    const gistResult = gistFixtures(command, args, commandState === "empty");
    if (gistResult !== undefined) return gistResult;
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
