// @vitest-environment jsdom

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GitHubTrendingDevelopers } from "./github-trending-developers";
import {
  DEFAULT_TRENDING_FILTERS,
  trendingDevelopersQueryOptions,
  trendingWebUrl,
  type GitHubTrendingDeveloperPage,
  type GitHubTrendingPeriod,
} from "./github-trending";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
const links = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("@/lib/window", () => links);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const ranking: GitHubTrendingDeveloperPage = {
  period: "weekly",
  languages: [
    { slug: "python", name: "Python" },
    { slug: "rust", name: "Rust" },
  ],
  developers: [
    {
      rank: 1,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: null,
      popularRepository: {
        fullName: "github/hello-world",
        url: "https://github.com/github/hello-world",
        description: "Examples for developers",
      },
    },
    { rank: 2, login: "hubot", name: "Hubot", avatarUrl: null, popularRepository: null },
  ],
};

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
beforeEach(() => {
  native.isTauri.mockReturnValue(true);
  native.invoke.mockReset().mockResolvedValue(ranking);
  links.openExternalUrl.mockClear();
});
afterEach(cleanup);

function FilteredList({
  period,
  onSelect,
}: {
  period: GitHubTrendingPeriod;
  onSelect: (login: string) => void;
}) {
  const [filters, setFilters] = useState(DEFAULT_TRENDING_FILTERS);
  return (
    <GitHubTrendingDevelopers
      period={period}
      filters={filters}
      onFiltersChange={setFilters}
      onSelectDeveloper={onSelect}
    />
  );
}

function setup(period: GitHubTrendingPeriod = "weekly") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSelect = vi.fn();
  const view = (value: GitHubTrendingPeriod) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <FilteredList period={value} onSelect={onSelect} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const rendered = render(view(period));
  return {
    client,
    onSelect,
    rerender: (value: GitHubTrendingPeriod) => rendered.rerender(view(value)),
  };
}

describe("trending developers", () => {
  it("shows ranked identities, opens profiles and links to the actual popular repository", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.click(await screen.findByRole("button", { name: "The Octocat (@octocat)" }));
    expect(onSelect).toHaveBeenCalledWith("octocat");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Examples for developers")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "github/hello-world" }));
    expect(links.openExternalUrl).toHaveBeenCalledWith("https://github.com/github/hello-world");
  });

  it("isolates periods and never presents an old period as the new ranking", async () => {
    const { client, rerender } = setup();
    await screen.findByText("The Octocat");
    let finish!: (value: GitHubTrendingDeveloperPage) => void;
    native.invoke.mockImplementationOnce(
      () =>
        new Promise<GitHubTrendingDeveloperPage>((resolve) => {
          finish = resolve;
        })
    );
    rerender("monthly");
    expect(screen.queryByText("The Octocat")).toBeNull();
    expect(
      screen.getByRole("status", { name: "workspace.discovery.developers.loading" })
    ).toBeTruthy();
    await waitFor(() =>
      expect(native.invoke).toHaveBeenLastCalledWith("github_list_trending_developers", {
        period: "monthly",
        ...DEFAULT_TRENDING_FILTERS,
      })
    );
    await act(async () =>
      finish({
        period: "monthly",
        languages: ranking.languages,
        developers: [{ ...ranking.developers[1], rank: 1 }],
      })
    );
    await screen.findByText("Hubot");
    rerender("weekly");
    expect(await screen.findByText("The Octocat")).toBeTruthy();
    expect(native.invoke).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(trendingDevelopersQueryOptions("monthly").queryKey)).toEqual({
      period: "monthly",
      languages: ranking.languages,
      developers: [{ ...ranking.developers[1], rank: 1 }],
    });
  });

  it("combines filters, ignores late results for old conditions, and restores the unfiltered cache", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("The Octocat");
    let finishLanguage!: (value: GitHubTrendingDeveloperPage) => void;
    native.invoke.mockImplementationOnce(
      () =>
        new Promise<GitHubTrendingDeveloperPage>((resolve) => {
          finishLanguage = resolve;
        })
    );
    await user.click(
      screen.getByRole("combobox", { name: "workspace.discovery.developers.language" })
    );
    await user.type(
      await screen.findByRole("combobox", {
        name: "workspace.discovery.developers.searchLanguages",
      }),
      "Pyth"
    );
    await user.click(screen.getByRole("option", { name: "Python" }));
    expect(screen.queryByText("The Octocat")).toBeNull();
    expect(
      screen.getByRole("status", { name: "workspace.discovery.developers.loading" })
    ).toBeTruthy();
    expect(native.invoke).toHaveBeenLastCalledWith("github_list_trending_developers", {
      period: "weekly",
      language: "python",
      sponsorable: false,
    });
    native.invoke.mockResolvedValueOnce({ ...ranking, developers: [ranking.developers[1]] });
    await user.click(
      screen.getByRole("checkbox", { name: "workspace.discovery.developers.sponsorable" })
    );
    await screen.findByText("Hubot");
    expect(native.invoke).toHaveBeenLastCalledWith("github_list_trending_developers", {
      period: "weekly",
      language: "python",
      sponsorable: true,
    });
    await act(async () => finishLanguage(ranking));
    expect(screen.queryByText("The Octocat")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "workspace.discovery.developers.clearFilters" })
    );
    expect(await screen.findByText("The Octocat")).toBeTruthy();
    expect(native.invoke).toHaveBeenCalledTimes(3);
  });

  it("retains cached rows with a visible warning when refresh fails", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("The Octocat");
    native.invoke.mockRejectedValueOnce({ code: "github", message: "Temporarily unavailable" });
    await user.click(
      screen.getByRole("button", { name: "workspace.discovery.developers.refresh" })
    );
    expect(await screen.findByText("workspace.discovery.developers.refreshFailed")).toBeTruthy();
    expect(screen.getByText("The Octocat")).toBeTruthy();
  });

  it("offers a retry after initial failure without a GitHub ranking shortcut", async () => {
    native.invoke.mockRejectedValueOnce({ code: "github", message: "Temporarily unavailable" });
    const user = userEvent.setup();
    setup("daily");
    await screen.findByText("workspace.discovery.developers.failed");
    expect(
      screen.queryByRole("button", { name: "workspace.discovery.viewTrendingOnGitHub" })
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "common.retry" }));
    expect(await screen.findByText("The Octocat")).toBeTruthy();
  });

  it("renders an empty state and keeps browser preview free from native requests", async () => {
    native.invoke.mockResolvedValueOnce({
      period: "weekly",
      languages: ranking.languages,
      developers: [],
    });
    const first = setup();
    expect(await screen.findByText("workspace.discovery.developers.empty")).toBeTruthy();
    cleanup();
    first.client.clear();
    native.invoke.mockClear();
    native.isTauri.mockReturnValue(false);
    setup();
    expect(await screen.findByText("workspace.discovery.desktopOnly")).toBeTruthy();
    expect(native.invoke).not.toHaveBeenCalled();
    expect(trendingWebUrl("repositories", "monthly")).toBe(
      "https://github.com/trending?since=monthly"
    );
  });
});
