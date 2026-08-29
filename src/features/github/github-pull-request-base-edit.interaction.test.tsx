// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubPullRequest, GitHubPullRequestBaseBranchPage } from "./github-data";
import { GitHubPullRequestBaseEdit } from "./github-pull-request-base-edit";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const pullRequest: GitHubPullRequest = {
  id: 3,
  number: 12,
  title: "Ship the PR workspace",
  body: "Pull request body",
  url: "https://github.com/octocat/hello-world/pull/12",
  state: "open",
  draft: false,
  merged: false,
  mergeable: true,
  mergeableState: "clean",
  author: "octocat",
  assignees: [],
  requestedReviewers: [],
  requestedTeams: [],
  labels: [],
  locked: false,
  headRef: "feature/pr-workspace",
  headSha: "abc1234",
  baseRef: "main",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  commits: 1,
  comments: 0,
  reviewComments: 0,
};

function branchPage(
  page: number,
  branches: GitHubPullRequestBaseBranchPage["branches"],
  hasMore: boolean
): GitHubPullRequestBaseBranchPage {
  return {
    pullRequestNumber: 12,
    currentBase: "main",
    currentBaseSha: "base1234",
    headSha: "abc1234",
    branches,
    page,
    hasPrevious: page > 1,
    hasMore,
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderBaseEdit(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <GitHubPullRequestBaseEdit
        repository={{
          owner: "octocat",
          name: "hello-world",
          fullName: "octocat/hello-world",
          url: "https://github.com/octocat/hello-world",
        }}
        pullRequest={pullRequest}
      />
    </QueryClientProvider>
  );
}

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pull request base edit dialog interactions", () => {
  it("opens by keyboard, loads every page, selects by keyboard, and locks while pending", async () => {
    const pendingMutation = new Promise(() => undefined);
    vi.mocked(invoke)
      .mockResolvedValueOnce(
        branchPage(1, [{ name: "main", sha: "base1234", protected: true }], true)
      )
      .mockResolvedValueOnce(
        branchPage(2, [{ name: "release", sha: "release123", protected: false }], false)
      )
      .mockReturnValueOnce(pendingMutation);
    const client = createQueryClient();
    const user = userEvent.setup();
    const view = renderBaseEdit(client);

    screen.getByRole("button", { name: "workspace.repositories.changePullRequestBase" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repository_pull_request_base_branches", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repository_pull_request_base_branches", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 2,
    });
    const search = screen.getByRole("combobox");
    await user.type(search, "release");
    await user.keyboard("{ArrowDown}{Enter}");
    const confirmButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.changePullRequestBase",
    });
    const confirm = confirmButtons[confirmButtons.length - 1];
    expect((confirm as HTMLButtonElement).disabled).toBe(false);

    await user.click(confirm);
    await waitFor(() =>
      expect((screen.getByRole("combobox") as HTMLInputElement).disabled).toBe(true)
    );

    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(
      within(screen.getByRole("dialog"))
        .getAllByRole("button", { hidden: true })
        .filter((button) => button.hasAttribute("disabled")).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen
        .getAllByRole("option")
        .every(
          (option) =>
            option.getAttribute("aria-disabled") === "true" || option.hasAttribute("data-disabled")
        )
    ).toBe(true);

    view.unmount();
    client.clear();
  });

  it("keeps the current base visible and retries a failed branch load", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(
        branchPage(1, [{ name: "release", sha: "release123", protected: false }], false)
      );
    const client = createQueryClient();
    const user = userEvent.setup();
    const view = renderBaseEdit(client);

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.changePullRequestBase" })
    );
    await screen.findByText(/network unavailable/);

    expect(screen.getByText("main")).toBeDefined();
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.retry",
      })
    );

    expect(await screen.findByRole("option", { name: /release/ })).toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(2);
    view.unmount();
    client.clear();
  });
});
