// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("./github-code-view", () => ({
  GitHubCodeView: ({ repository }: { repository: { fullName: string } }) => (
    <section aria-label="repository detail">
      <h2>{repository.fullName}</h2>
    </section>
  ),
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
  it("keeps the top-level discovery modes focused", async () => {
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
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(activeTab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("combobox", { name: "workspace.discovery.trendingPeriod" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "workspace.discovery.openTrendingOnGitHub" })
    ).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "workspace.discovery.tabs.feed" }));
    expect(
      screen
        .getByRole("tab", { name: "workspace.discovery.tabs.feed" })
        .getAttribute("aria-selected")
    ).toBe("true");
  });

  it("keeps GitHub search controls inside the dedicated search mode", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    expect(screen.queryByRole("search")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "workspace.discovery.tabs.search" }));

    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "workspace.discovery.searchLabel" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "workspace.discovery.searchKind" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "workspace.discovery.searchSort" })).toBeTruthy();
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

    const repositoryRow = await screen.findByRole("button", { name: "octocat/hello-world" });
    expect(repositoryRow.hasAttribute("aria-pressed")).toBe(false);
    act(() => {
      void client.invalidateQueries({ queryKey: ["github", "discovery", "search"] });
    });

    expect(await screen.findByRole("status", { name: "workspace.discovery.loading" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "octocat/hello-world" })).toBeTruthy();
  });

  it("gives repository identity and metrics distinct visual semantics", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    tauriApi.invoke.mockResolvedValue({
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
          updatedAt: "2026-09-05T02:41:00Z",
        },
      ],
      totalCount: 1,
      incompleteResults: false,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    const row = await screen.findByRole("button", { name: "octocat/hello-world" });
    expect(within(row).getByText("octocat/").className).not.toContain("font-mono");
    expect(within(row).getByText("hello-world").className).toContain("harbor-repository-name");
    expect(row.querySelector("img")).toBeNull();
    const language = row.querySelector('[data-language="TypeScript"]');
    expect(language?.className).toContain("harbor-language-badge");
    expect(language?.className).toContain("font-medium");
    expect(language?.className).toContain("text-[11px]");
    expect(within(row).getByText("A trending repository").className).toContain("text-foreground");
    expect(row.querySelector('[data-metric="stars"]')?.className).toContain("text-foreground");
    expect(row.querySelector('[data-metric="stars"]')?.className).toContain("font-normal");
    expect(row.querySelector('[data-metric="forks"]')?.className).toContain(
      "text-muted-foreground"
    );
    expect(row.querySelector("time")).toBeNull();
  });

  it("opens a selected repository as full detail without a wide preview", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    tauriApi.invoke.mockResolvedValue({
      kind: "repositories",
      results: [
        {
          id: 1,
          owner: "octocat",
          name: "hello-world",
          fullName: "octocat/hello-world",
          description: "First repository",
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
        {
          id: 2,
          owner: "github",
          name: "second-repository",
          fullName: "github/second-repository",
          description: "Second repository",
          url: "https://github.com/github/second-repository",
          language: "Rust",
          stars: 144,
          forks: 8,
          openIssues: 2,
          defaultBranch: "main",
          isPrivate: false,
          isFork: false,
          isArchived: false,
        },
      ],
      totalCount: 2,
      incompleteResults: false,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    const onSelectRepository = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={onSelectRepository} />
      </QueryClientProvider>
    );

    expect(await screen.findByRole("button", { name: "octocat/hello-world" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "repository detail" })).toBeNull();
    expect(onSelectRepository).toHaveBeenLastCalledWith(null);

    await user.click(screen.getByRole("button", { name: "github/second-repository" }));

    expect(await screen.findByRole("region", { name: "repository detail" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "github/second-repository" })).toBeTruthy();
    await waitFor(() => {
      expect(onSelectRepository).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: "github/second-repository" })
      );
    });
  });
});
