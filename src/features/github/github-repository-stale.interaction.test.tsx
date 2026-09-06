// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { repositoryFixture } from "@/dev/repository-fixtures";
import { GitHubActionsView } from "./github-actions-view";
import type { GitHubRepository } from "./github-data";
import { GitHubSecurityView } from "./github-security-view";
import { GitHubWikiView } from "./github-wiki-view";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
const repository: GitHubRepository = {
  id: 1,
  owner: "harbor-preview",
  name: "harbor",
  fullName: "harbor-preview/harbor",
  url: "https://github.com/harbor-preview/harbor",
  stars: 1,
  forks: 0,
  openIssues: 1,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
  updatedAt: "2026-09-01T10:00:00Z",
};
let failingCommand: string | undefined;
beforeEach(() => {
  failingCommand = undefined;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  vi.mocked(invoke).mockImplementation((command, payload) => {
    if (command === failingCommand)
      return Promise.reject({ code: "preview", message: "Refresh unavailable" });
    const result = repositoryFixture(
      command,
      (payload ?? {}) as Record<string, unknown>,
      [repository],
      false
    );
    return result === undefined
      ? Promise.reject(new Error(`Unexpected command: ${command}`))
      : Promise.resolve(result);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("repository workspaces retain readable results on refresh failure", () => {
  it.each([
    ["Wiki overview", GitHubWikiView, "github_get_repository_wiki", null, "Home"],
    ["Wiki page", GitHubWikiView, "github_get_repository_wiki_page", null, "Home"],
    [
      "Security detail",
      GitHubSecurityView,
      "github_get_repository_security_alert",
      /Dependency input validation/,
      "Dependency input validation needs an update",
    ],
    [
      "Workflow jobs",
      GitHubActionsView,
      "github_list_workflow_run_jobs",
      /Check workspace surfaces/,
      "Check workspace surfaces and keyboard access",
    ],
  ] as const)(
    "keeps %s content and provides Retry",
    async (_, Component, command, selection, heading) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <Component repository={repository} />
          </TooltipProvider>
        </QueryClientProvider>
      );
      if (selection) await user.click(await screen.findByRole("button", { name: selection }));
      const title = (await screen.findAllByRole("heading", { name: heading }))[0];
      await waitFor(() => expect(document.querySelector('[data-slot="skeleton"]')).toBeNull());
      failingCommand = command;
      await act(async () => {
        await client.invalidateQueries();
      });
      expect(await screen.findByText("common.staleResults")).toBeTruthy();
      expect(title.isConnected).toBe(true);
      failingCommand = undefined;
      await user.click(screen.getByRole("button", { name: "common.retry" }));
      await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
      expect(title.isConnected).toBe(true);
      client.clear();
    }
  );
});
