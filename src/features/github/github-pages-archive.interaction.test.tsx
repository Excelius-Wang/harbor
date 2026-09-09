// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { administrationFixture } from "@/dev/administration-fixtures";
import { workspaceFixture } from "@/dev/workspace-fixtures";
import { repositoryFixture } from "@/dev/repository-fixtures";
import { GitHubRepositorySettingsView } from "./github-repository-settings-view";
import { GitHubRepositoryPagesView } from "./github-repository-pages-view";
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
let archived = false;
let pendingWrites = false;
beforeEach(() => {
  failingCommand = undefined;
  archived = false;
  pendingWrites = false;
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
    if (
      pendingWrites &&
      (command === "github_mutate_repository_pages" ||
        command === "github_update_personal_repository_settings")
    )
      return new Promise(() => {});
    const result =
      administrationFixture(
        command,
        (payload ?? {}) as Record<string, unknown>,
        [repository],
        false
      ) ??
      workspaceFixture(command, (payload ?? {}) as Record<string, unknown>, [repository], false) ??
      repositoryFixture(command, (payload ?? {}) as Record<string, unknown>, [repository], false);
    if (command === "github_get_repository_pages" && archived && result)
      Object.assign(result, { isArchived: true });
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

function mountPages() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubRepositoryPagesView
          repository={repository}
          branches={["main"]}
          onBack={() => {}}
          onOpenActions={() => {}}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return client;
}
const pages = "workspace.repositories.settings.pages.";
describe("Pages archive and pending writes", () => {
  it("blocks a build request when the authoritative Pages workspace is archived", async () => {
    archived = true;
    const client = mountPages();
    const button = await screen.findByRole("button", { name: pages + "requestBuild" });
    expect(button.hasAttribute("disabled")).toBe(true);
    client.clear();
  });
  it.each(["save", "requestBuild"])("blocks competing controls during %s", async (action) => {
    pendingWrites = true;
    const client = mountPages();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: pages + action }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_mutate_repository_pages", expect.anything())
    );
    expect(
      screen
        .getByRole("button", { name: pages + (action === "save" ? "requestBuild" : "save") })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(screen.getByRole("button", { name: pages + "disable" }).hasAttribute("disabled")).toBe(
      true
    );
    client.clear();
  });
  it("keeps the archive confirmation open and locked during the write", async () => {
    pendingWrites = true;
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <GitHubRepositorySettingsView repository={repository} onOpenActions={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>
    );
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.settings.archive" })
    );
    const dialog = screen.getByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "workspace.repositories.settings.archive" })
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "github_update_personal_repository_settings",
        expect.anything()
      )
    );
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "common.cancel" }).hasAttribute("disabled")
    ).toBe(true);
    client.clear();
  });
});
