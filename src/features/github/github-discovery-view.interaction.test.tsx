// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubDiscoveryView } from "./github-discovery-view";

const tauriApi = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@tauri-apps/api/core", () => tauriApi);
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  tauriApi.isTauri.mockReturnValue(false);
  tauriApi.invoke.mockImplementation((command: string) => {
    if (command === "github_list_developer_feed") {
      return Promise.resolve({ events: [], page: 1, hasPrevious: false, hasMore: false });
    }
    return Promise.resolve({
      kind: "repositories",
      results: [],
      totalCount: 0,
      incompleteResults: false,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GitHub discovery navigation", () => {
  it("keeps overflow available without showing native scrollbars", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    const tabList = screen.getByRole("tablist");
    const activeTab = screen.getByRole("tab", { name: "workspace.discovery.tabs.trending" });

    expect(tabList.closest("section")?.className).toContain("harbor-content");
    expect(tabList.className).toContain("scrollbar-none");
    expect(tabList.className).toContain("overflow-x-auto");
    expect(tabList.className).toContain("overflow-y-hidden");
    expect(activeTab.className).toContain("after:bottom-0!");
    expect(
      screen.getByRole("combobox", { name: "workspace.discovery.trendingPeriod" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "workspace.discovery.openTrendingOnGitHub" })
    ).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "workspace.discovery.tabs.feed" }));
    const feedWindow = screen.getByText("workspace.discovery.feedWindow");
    expect(feedWindow.className).toContain("min-[1240px]:block");
    expect(feedWindow.className).not.toContain("min-[900px]:block");
  });

  it("loads recent popular repositories through the existing GitHub search interface", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith(
        "github_search_discovery",
        expect.objectContaining({
          kind: "repositories",
          page: 1,
          query: expect.stringMatching(/^created:>=\d{4}-\d{2}-\d{2} fork:false archived:false$/),
          sort: "stars",
        })
      );
    });
  });

  it("announces background loading while keeping the previous repository list visible", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    let searchCount = 0;
    tauriApi.invoke.mockImplementation((command: string) => {
      if (command !== "github_search_discovery") return Promise.resolve(undefined);
      searchCount += 1;
      if (searchCount > 1) return new Promise(() => {});
      return Promise.resolve({
        kind: "repositories",
        results: [
          {
            id: 1,
            owner: "octocat",
            name: "hello-world",
            fullName: "octocat/hello-world",
            description: "A trending repository",
            url: "https://github.com/octocat/hello-world",
            language: "TypeScript",
            stars: 321,
            forks: 12,
            openIssues: 3,
            defaultBranch: "main",
            isPrivate: false,
            isFork: false,
            isArchived: false,
          },
        ],
        totalCount: 1,
        incompleteResults: false,
        page: 1,
        hasPrevious: false,
        hasMore: false,
      });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    expect(await screen.findByText("octocat/hello-world")).toBeTruthy();
    act(() => {
      void client.invalidateQueries({ queryKey: ["github", "discovery", "search"] });
    });

    expect(await screen.findByRole("status", { name: "workspace.discovery.loading" })).toBeTruthy();
    expect(screen.getByText("octocat/hello-world")).toBeTruthy();
  });
});
