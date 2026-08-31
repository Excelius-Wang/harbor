// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubPinnedIssuePage } from "./github-data";
import { GitHubPinnedIssues } from "./github-pinned-issues";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};

const pinnedPage: GitHubPinnedIssuePage = {
  repositoryId: "R_1",
  repositoryFullName: "octocat/hello-world",
  viewerCanManage: true,
  issues: [
    {
      nodeId: "I_9",
      number: 9,
      title: "Pinned roadmap",
      url: "https://github.com/octocat/hello-world/issues/9",
      state: "open",
      pinnedBy: "hubot",
    },
  ],
};

function renderPinnedIssues(onSelect = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GitHubPinnedIssues repository={repository} onSelect={onSelect} />
    </QueryClientProvider>
  );
  return onSelect;
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});
afterEach(() => cleanup());

describe("GitHub pinned Issues", () => {
  it("shows an independent loading state", async () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => undefined));

    renderPinnedIssues();

    expect(
      await screen.findByLabelText("workspace.repositories.loadingPinnedIssues")
    ).toBeDefined();
  });

  it("shows a bounded empty state without hiding the main Issue list", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...pinnedPage, issues: [] });

    renderPinnedIssues();

    expect(await screen.findByText("workspace.repositories.noPinnedIssues")).toBeDefined();
    expect(invoke).toHaveBeenCalledWith("github_get_repository_pinned_issues", {
      owner: "octocat",
      repository: "hello-world",
    });
  });

  it("keeps a load failure local and retries it", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("pinned query failed"))
      .mockResolvedValueOnce(pinnedPage);
    const user = userEvent.setup();

    renderPinnedIssues();

    expect(await screen.findByText("workspace.repositories.pinnedIssuesLoadFailed")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));
    expect(await screen.findByText("Pinned roadmap")).toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("opens a selected pinned Issue through native detail navigation", async () => {
    vi.mocked(invoke).mockResolvedValue(pinnedPage);
    const onSelect = renderPinnedIssues();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Pinned roadmap/ }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(9));
  });
});
