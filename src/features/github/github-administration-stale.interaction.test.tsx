// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { administrationFixture } from "@/dev/administration-fixtures";
import { workspaceFixture } from "@/dev/workspace-fixtures";
import { repositoryFixture } from "@/dev/repository-fixtures";
import { GitHubRepositorySettingsView } from "./github-repository-settings-view";
import { GitHubRepositoryPagesView } from "./github-repository-pages-view";
import { GitHubDiscussionView } from "./github-discussion-view";
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
      : Promise.resolve(result);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("administration refresh failures", () => {
  it.each([
    ["settings", "github_get_personal_repository_settings"],
    ["collaborators", "github_list_personal_repository_collaborators"],
    ["invitations", "github_list_personal_repository_invitations"],
    ["topics", "github_get_personal_repository_topics"],
  ])("keeps the settings draft when %s refresh fails", async (_, command) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <GitHubRepositorySettingsView repository={repository} onOpenActions={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>
    );
    const name = await screen.findByLabelText("workspace.repositories.settings.name");
    await user.clear(name);
    await user.type(name, "unsaved-workspace");
    await waitFor(() => expect(screen.getByText("@lin-chen")).toBeTruthy());
    failingCommand = command;
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(await screen.findByText("common.staleResults")).toBeTruthy();
    expect((name as HTMLInputElement).value).toBe("unsaved-workspace");
    expect(screen.getByText("@lin-chen")).toBeTruthy();
    expect(screen.getByText("@alex-morgan")).toBeTruthy();
    failingCommand = undefined;
    await user.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
    expect((name as HTMLInputElement).value).toBe("unsaved-workspace");
    client.clear();
  });

  it("keeps the Pages form and unpublished domain when refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
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
    const domain = await screen.findByLabelText(
      "workspace.repositories.settings.pages.customDomain"
    );
    await waitFor(() => expect((domain as HTMLInputElement).value).toBe("docs.example.com"));
    await user.clear(domain);
    await user.type(domain, "preview.example.com");
    failingCommand = "github_get_repository_pages";
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(await screen.findByText("common.staleResults")).toBeTruthy();
    expect(domain.isConnected).toBe(true);
    expect((domain as HTMLInputElement).value).toBe("preview.example.com");
    failingCommand = undefined;
    await user.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
    expect((domain as HTMLInputElement).value).toBe("preview.example.com");
    client.clear();
  });

  it("marks retained discussion rows stale and retries", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <GitHubDiscussionView repository={repository} />
        </TooltipProvider>
      </QueryClientProvider>
    );
    const row = await screen.findByRole("button", { name: /Keeping review context/ });
    failingCommand = "github_list_repository_discussions";
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
