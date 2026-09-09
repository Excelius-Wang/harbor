// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { administrationFixture } from "@/dev/administration-fixtures";
import { workspaceFixture } from "@/dev/workspace-fixtures";
import { repositoryFixture } from "@/dev/repository-fixtures";
import { GitHubRepositoryBrowser } from "./github-repository-browser";
import { githubQueryKeys } from "./github-queries";
import type { GitHubRepository } from "./github-data";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("./github-repository-settings-view", () => ({
  GitHubRepositorySettingsView: () => <p>Selected repository settings</p>,
}));
vi.mock("./github-code-view", () => ({ GitHubCodeView: () => <p>Repository code</p> }));
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
    const result =
      administrationFixture(
        command,
        (payload ?? {}) as Record<string, unknown>,
        [repository],
        false
      ) ??
      workspaceFixture(command, (payload ?? {}) as Record<string, unknown>, [repository], false) ??
      repositoryFixture(command, (payload ?? {}) as Record<string, unknown>, [repository], false);
    return result === undefined
      ? Promise.reject(new Error(`Unexpected command: ${command}`))
      : Promise.resolve(structuredClone(result));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("retains the selected repository tab when refreshed metadata changes", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubRepositoryBrowser onSelectRepository={() => {}} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const tab = await screen.findByRole("tab", { name: "workspace.repositories.tabs.settings" });
  await user.click(tab);
  await screen.findByText("Selected repository settings");
  await act(async () => {
    client.setQueryData(githubQueryKeys.repositories, {
      pages: [{ repositories: [{ ...repository, isArchived: true }], page: 1, hasMore: false }],
      pageParams: [1],
    });
  });
  await screen.findByText("workspace.repositories.archived");
  expect(tab.getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByText("Selected repository settings")).not.toBeNull();
  const other = { ...repository, id: 2, name: "another", fullName: "harbor-preview/another" };
  await act(async () => {
    client.setQueryData(githubQueryKeys.repositories, {
      pages: [
        { repositories: [{ ...repository, isArchived: true }, other], page: 1, hasMore: false },
      ],
      pageParams: [1],
    });
  });
  await user.click(await screen.findByRole("button", { name: /harbor-preview\/another/ }));
  await screen.findByText("Repository code");
  expect(
    screen
      .getByRole("tab", { name: "workspace.repositories.tabs.code" })
      .getAttribute("aria-selected")
  ).toBe("true");
  client.clear();
});
