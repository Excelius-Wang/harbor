// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { codeFixture } from "@/dev/code-fixtures";
import { workspaceFixture } from "@/dev/workspace-fixtures";
import { repositoryFixture } from "@/dev/repository-fixtures";
import { GitHubCodeView } from "./github-code-view";
import type { GitHubRepository } from "./github-data";

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
let paginateHistory = false;
beforeEach(() => {
  failingCommand = undefined;
  paginateHistory = false;
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
    const result =
      codeFixture(command, (payload ?? {}) as Record<string, unknown>, false) ??
      workspaceFixture(command, (payload ?? {}) as Record<string, unknown>, [repository], false) ??
      repositoryFixture(command, (payload ?? {}) as Record<string, unknown>, [repository], false);
    if (paginateHistory && command === "github_list_repository_commits") {
      const page = Number((payload as { page: number }).page);
      const data = result as { commits: Array<Record<string, unknown>> };
      return Promise.resolve({
        ...data,
        page,
        hasPrevious: page > 1,
        hasMore: page < 2,
        commits: [{ ...data.commits[0], title: `History page ${page}` }],
      });
    }
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

function mountCode() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubCodeView repository={repository} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return client;
}

describe("code workspace navigation and refresh", () => {
  it("returns from a search result with the submitted query and unsubmitted input intact", async () => {
    const user = userEvent.setup();
    const client = mountCode();
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.searchAction" })
    );
    const input = screen.getByRole("textbox", { name: "workspace.repositories.searchCode" });
    await user.type(input, "workspace{Enter}");
    const result = await screen.findByRole("button", { name: /workspace.ts/ });
    await user.type(input, " draft");
    await user.click(result);
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.backToCodeSearch" })
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "workspace.repositories.searchCode",
        }) as HTMLInputElement
      ).value
    ).toBe("workspace draft");
    expect(screen.getByRole("button", { name: /workspace.ts/ })).toBeTruthy();
    const searches = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "github_search_repository_code");
    expect(searches.every(([, args]) => (args as { query: string }).query === "workspace")).toBe(
      true
    );
    client.clear();
  });

  it("returns to the same history page after inspecting a commit", async () => {
    paginateHistory = true;
    const user = userEvent.setup();
    const client = mountCode();
    await user.click(await screen.findByRole("button", { name: "src" }));
    await user.click(await screen.findByRole("button", { name: "workspace.repositories.history" }));
    await screen.findByRole("button", { name: /History page 1/ });
    await user.click(screen.getByRole("link", { name: "workspace.repositories.nextPage" }));
    await user.click(await screen.findByRole("button", { name: /History page 2/ }));
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.viewSource" })
    );
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.backToCommits" })
    );
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.backToCommits" })
    );
    expect(await screen.findByRole("button", { name: /History page 2/ })).toBeTruthy();
    const historyReads = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "github_list_repository_commits");
    expect(historyReads.every(([, args]) => (args as { path: string }).path === "src")).toBe(true);
    client.clear();
  });

  it.each([
    [
      "github_list_repository_commits",
      "workspace.repositories.history",
      /Unify workspace surfaces/,
    ],
    ["github_list_repository_tags", "workspace.repositories.tags", /v1.4.0/],
  ])("retains results and retries %s", async (command, action, rowName) => {
    const client = mountCode();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: action }));
    const row = await screen.findByRole("button", { name: rowName });
    failingCommand = command;
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(await screen.findByText("common.staleResults")).toBeTruthy();
    expect(row.isConnected).toBe(true);
    failingCommand = undefined;
    await user.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
    client.clear();
  });
});
