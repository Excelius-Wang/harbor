// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubDiscoveryView } from "./github-discovery-view";
import { TooltipProvider } from "@/components/ui/tooltip";

const tauriApi = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
const windowApi = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => tauriApi);
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@/lib/window", () => windowApi);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("./github-code-view", () => ({
  GitHubCodeView: ({
    repository,
    onBack,
  }: {
    repository: { fullName: string };
    onBack: () => void;
  }) => (
    <section aria-label="repository detail">
      <h2>{repository.fullName}</h2>
      <button onClick={onBack}>Back to discovery</button>
    </section>
  ),
}));

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

vi.mock("./github-profile-view", () => ({
  GitHubProfileView: ({
    initialUsername,
    onBack,
  }: {
    initialUsername: string;
    onBack: () => void;
  }) => (
    <section aria-label="developer profile">
      <h2>{initialUsername}</h2>
      <button onClick={onBack}>Back to discovery</button>
    </section>
  ),
}));

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
  it("opens developers only on demand and returns from their profile to the cached ranking", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    const searchResponse = {
      kind: "repositories",
      results: [],
      totalCount: 0,
      incompleteResults: false,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    };
    tauriApi.invoke.mockImplementation((command: string) =>
      Promise.resolve(
        command === "github_list_developer_feed"
          ? { events: [], page: 1, hasPrevious: false, hasMore: false }
          : command === "github_list_trending_developers"
            ? {
                period: "weekly",
                languages: [{ slug: "python", name: "Python" }],
                developers: [
                  {
                    rank: 1,
                    login: "octocat",
                    name: "The Octocat",
                    avatarUrl: null,
                    popularRepository: null,
                  },
                ],
              }
            : searchResponse
      )
    );
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <GitHubDiscoveryView onSelectRepository={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(tauriApi.invoke).toHaveBeenCalledWith("github_search_discovery", expect.anything())
    );
    expect(tauriApi.invoke).not.toHaveBeenCalledWith(
      "github_list_trending_developers",
      expect.anything()
    );

    await user.click(screen.getByRole("tab", { name: "workspace.discovery.tabs.repositories" }));
    await user.keyboard("{ArrowRight}");
    await screen.findByRole("button", { name: "The Octocat (@octocat)" });
    expect(screen.getByRole("tabpanel").getAttribute("data-state")).toBe("active");
    expect(tauriApi.invoke).toHaveBeenCalledWith("github_list_trending_developers", {
      period: "weekly",
      language: null,
      sponsorable: false,
    });
    await user.click(
      screen.getByRole("combobox", { name: "workspace.discovery.developers.language" })
    );
    await user.click(screen.getByRole("option", { name: "Python" }));
    await screen.findByRole("button", { name: "The Octocat (@octocat)" });
    await user.click(
      screen.getByRole("checkbox", { name: "workspace.discovery.developers.sponsorable" })
    );
    await screen.findByRole("button", { name: "The Octocat (@octocat)" });
    const developerViewport = screen
      .getByRole("button", { name: "The Octocat (@octocat)" })
      .closest<HTMLDivElement>("[data-radix-scroll-area-viewport]")!;
    developerViewport.scrollTop = 172;
    fireEvent.scroll(developerViewport);
    await user.click(screen.getByRole("button", { name: "The Octocat (@octocat)" }));
    expect(await screen.findByRole("region", { name: "developer profile" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back to discovery" }));
    expect(await screen.findByRole("button", { name: "The Octocat (@octocat)" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "The Octocat (@octocat)" })
        .closest<HTMLDivElement>("[data-radix-scroll-area-viewport]")?.scrollTop
    ).toBe(172);
    expect(
      screen.getByRole("combobox", { name: "workspace.discovery.developers.language" }).textContent
    ).toContain("Python");
    expect(
      screen
        .getByRole("checkbox", { name: "workspace.discovery.developers.sponsorable" })
        .getAttribute("data-state")
    ).toBe("checked");
    expect(
      screen
        .getByRole("tab", { name: "workspace.discovery.developers.tab" })
        .getAttribute("aria-selected")
    ).toBe("true");
    expect(
      tauriApi.invoke.mock.calls.filter(
        ([command]) => command === "github_list_trending_developers"
      )
    ).toHaveLength(3);

    await user.click(screen.getByRole("radio", { name: "workspace.discovery.tabs.feed" }));
    expect(screen.queryByRole("tab", { name: "workspace.discovery.developers.tab" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "workspace.discovery.tabs.trending" }));
    expect(await screen.findByRole("button", { name: "The Octocat (@octocat)" })).toBeTruthy();
    client.clear();
  });

  it("keeps the top-level discovery modes focused", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    const tabList = screen.getByRole("radiogroup", { name: "workspace.discovery.modes" });
    const activeTab = screen.getByRole("radio", { name: "workspace.discovery.tabs.trending" });

    expect(tabList.closest("section")?.className).toContain("harbor-content");
    expect(within(tabList).getAllByRole("radio")).toHaveLength(3);
    expect(activeTab.getAttribute("aria-checked")).toBe("true");
    expect(activeTab.hasAttribute("aria-controls")).toBe(false);
    expect(
      screen.getByRole("combobox", { name: "workspace.discovery.trendingPeriod" })
    ).toBeTruthy();
    const discoveryHeader = document.querySelector("header");
    expect(discoveryHeader).toBeTruthy();
    expect(
      within(discoveryHeader!).queryByRole("button", {
        name: "workspace.discovery.viewTrendingOnGitHub",
      })
    ).toBeNull();
    const fallback = screen.getByRole("button", {
      name: "workspace.discovery.viewTrendingOnGitHub",
    });
    await user.click(fallback);
    expect(windowApi.openExternalUrl).toHaveBeenCalledWith(
      "https://github.com/trending?since=weekly"
    );

    await user.click(screen.getByRole("radio", { name: "workspace.discovery.tabs.feed" }));
    expect(
      screen
        .getByRole("radio", { name: "workspace.discovery.tabs.feed" })
        .getAttribute("aria-checked")
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
    await user.click(screen.getByRole("radio", { name: "workspace.discovery.tabs.search" }));

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

const retainedRepository = {
  id: 21,
  owner: "octocat",
  name: "retained-results",
  fullName: "octocat/retained-results",
  url: "https://github.com/octocat/retained-results",
  stars: 80,
  forks: 2,
  openIssues: 3,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};
const retainedSearch = {
  kind: "repositories",
  results: [retainedRepository],
  totalCount: 1,
  incompleteResults: false,
  page: 1,
  hasPrevious: false,
  hasMore: false,
};
function renderRetainedDiscovery() {
  tauriApi.isTauri.mockReturnValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return client;
}
it("restores the repository result viewport when returning from detail", async () => {
  tauriApi.invoke.mockResolvedValue(retainedSearch);
  const client = renderRetainedDiscovery();
  const user = userEvent.setup();
  const row = await screen.findByRole("button", { name: retainedRepository.fullName });
  const viewport = row.closest<HTMLDivElement>("[data-radix-scroll-area-viewport]")!;
  viewport.scrollTop = 230;
  fireEvent.scroll(viewport);
  await user.click(row);
  await user.click(await screen.findByRole("button", { name: "Back to discovery" }));
  expect(
    (
      await screen.findByRole("button", { name: retainedRepository.fullName })
    ).closest<HTMLDivElement>("[data-radix-scroll-area-viewport]")?.scrollTop
  ).toBe(230);
  client.clear();
});
it("marks retained search results after a failed refresh and offers a retry", async () => {
  tauriApi.invoke.mockResolvedValue(retainedSearch);
  const client = renderRetainedDiscovery();
  await screen.findByRole("button", { name: retainedRepository.fullName });
  tauriApi.invoke.mockRejectedValue(new Error("Refresh unavailable"));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["github", "discovery", "search"] });
  });
  expect(screen.getByRole("button", { name: retainedRepository.fullName })).toBeTruthy();
  expect(await screen.findByText("common.staleResults")).toBeTruthy();
  tauriApi.invoke.mockResolvedValue(retainedSearch);
  await userEvent.setup().click(screen.getByRole("button", { name: "common.retry" }));
  await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
  client.clear();
});
it("keeps cached following events visible when their refresh fails", async () => {
  const event = {
    id: "retained-event",
    eventType: "PushEvent",
    actor: { id: 1, login: "octocat", avatarUrl: "", url: "https://github.com/octocat" },
    repository: retainedRepository,
    commitCount: 2,
    public: true,
    createdAt: "2026-09-01T10:00:00Z",
  };
  tauriApi.invoke.mockImplementation((command: string) =>
    Promise.resolve(
      command === "github_list_developer_feed"
        ? { events: [event], page: 1, hasPrevious: false, hasMore: false }
        : retainedSearch
    )
  );
  const client = renderRetainedDiscovery();
  await userEvent
    .setup()
    .click(screen.getByRole("radio", { name: "workspace.discovery.tabs.feed" }));
  await screen.findByText("workspace.discovery.events.PushEvent");
  tauriApi.invoke.mockRejectedValue(new Error("Feed refresh unavailable"));
  await act(async () => {
    await client.invalidateQueries();
  });
  expect(screen.getByText("workspace.discovery.events.PushEvent")).toBeTruthy();
  expect(await screen.findByText("common.staleResults")).toBeTruthy();
  client.clear();
});

it("retains following events and retries a failed next page independently of refresh", async () => {
  const event = {
    id: "first-page",
    eventType: "PushEvent",
    actor: { id: 1, login: "octocat", avatarUrl: "", url: "https://github.com/octocat" },
    repository: retainedRepository,
    commitCount: 2,
    public: true,
    createdAt: "2026-09-01T10:00:00Z",
  };
  let failNext = true;
  tauriApi.invoke.mockImplementation((command: string, args: { page?: number }) => {
    if (command !== "github_list_developer_feed") return Promise.resolve(retainedSearch);
    if (args.page === 2 && failNext) return Promise.reject(new Error("Next page unavailable"));
    return Promise.resolve({
      events: [{ ...event, id: args.page === 2 ? "second-page" : "first-page" }],
      page: args.page,
      hasPrevious: args.page === 2,
      hasMore: args.page === 1,
    });
  });
  const client = renderRetainedDiscovery();
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: "workspace.discovery.tabs.feed" }));
  await screen.findByText("workspace.discovery.events.PushEvent");
  await user.click(screen.getByRole("button", { name: "common.loadMore" }));
  expect(await screen.findByText("workspace.discovery.feedMoreFailed")).toBeTruthy();
  expect(screen.getByText("workspace.discovery.events.PushEvent")).toBeTruthy();
  expect(screen.queryByText("common.staleResults")).toBeNull();
  failNext = false;
  await user.click(screen.getByRole("button", { name: "common.loadMore" }));
  await waitFor(() =>
    expect(screen.getAllByText("workspace.discovery.events.PushEvent")).toHaveLength(2)
  );
  expect(screen.queryByText("workspace.discovery.feedMoreFailed")).toBeNull();
  client.clear();
});
