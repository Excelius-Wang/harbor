// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue, GitHubPinnedIssuePage } from "./github-data";
import { GitHubIssuePinAction } from "./github-issue-pin-action";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};

const issue: GitHubIssue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Important work",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "open",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-08-31T08:00:00Z",
  updatedAt: "2026-08-31T08:00:00Z",
};

function page(
  viewerCanManage: boolean,
  issues: GitHubPinnedIssuePage["issues"] = []
): GitHubPinnedIssuePage {
  return {
    repositoryId: "R_1",
    repositoryFullName: "octocat/hello-world",
    viewerCanManage,
    issues,
  };
}

const currentPinned = {
  nodeId: "I_7",
  number: 7,
  title: issue.title,
  url: issue.url,
  state: "open" as const,
  pinnedBy: "hubot",
};

function renderAction() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GitHubIssuePinAction repository={repository} issue={issue} />
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue pin action", () => {
  it.each(["repository", "issue"])(
    "blocks writes when the %s identity differs",
    async (identity) => {
      vi.mocked(invoke).mockResolvedValue(
        identity === "repository"
          ? { ...page(true), repositoryFullName: "octocat/other" }
          : page(true, [{ ...currentPinned, nodeId: "I_replaced" }])
      );
      renderAction();
      await screen.findByRole("button", {
        name: "workspace.repositories.pinIssueStatusUnavailable",
      });
      expect(screen.queryByRole("button", { name: "workspace.repositories.pinIssue" })).toBeNull();
      expect(invoke).toHaveBeenCalledTimes(1);
    }
  );

  it("blocks cached pin actions after refresh failure and retries only the status read", async () => {
    vi.mocked(invoke).mockResolvedValue(page(true));
    const client = renderAction();
    await screen.findByRole("button", { name: "workspace.repositories.pinIssue" });
    vi.mocked(invoke).mockRejectedValue({ code: "preview", message: "Status unavailable" });
    await act(async () => {
      await client.invalidateQueries();
    });
    const retry = await screen.findByRole("button", {
      name: "workspace.repositories.pinIssueStatusUnavailable",
    });
    expect(screen.queryByRole("button", { name: "workspace.repositories.pinIssue" })).toBeNull();
    await userEvent.setup().click(retry);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.every(([command]) => command === "github_get_repository_pinned_issues")
    ).toBe(true);
  });

  it("shows a disabled action while the authoritative pin state loads", async () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => undefined));

    renderAction();

    expect(
      (
        await screen.findByRole("button", { name: /workspace\.repositories\.pinIssueLoading/ })
      ).hasAttribute("disabled")
    ).toBe(true);
  });

  it("hides pin controls without repository write permission", async () => {
    vi.mocked(invoke).mockResolvedValue(page(false));

    renderAction();

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_get_repository_pinned_issues", {
        owner: "octocat",
        repository: "hello-world",
      })
    );
    expect(screen.queryByRole("button", { name: "workspace.repositories.pinIssue" })).toBeNull();
  });

  it("pins the current Issue and reconciles the shared pinned cache", async () => {
    let reads = 0;
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_pinned_issues") {
        reads += 1;
        return Promise.resolve(page(true, reads > 1 ? [currentPinned] : []));
      }
      if (command === "github_update_repository_issue_pin") {
        return Promise.resolve(page(true, [currentPinned]));
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.pinIssue" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_update_repository_issue_pin", {
        input: {
          owner: "octocat",
          repository: "hello-world",
          issueNumber: 7,
          expectedIssueNodeId: "I_7",
          action: "pin",
        },
      })
    );
    expect(toast.success).toHaveBeenCalledWith("workspace.repositories.issuePinned");
    expect(
      await screen.findByRole("button", { name: "workspace.repositories.unpinIssue" })
    ).toBeDefined();
  });

  it("unpins the current Issue", async () => {
    let reads = 0;
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_pinned_issues") {
        reads += 1;
        return Promise.resolve(page(true, reads === 1 ? [currentPinned] : []));
      }
      if (command === "github_update_repository_issue_pin") return Promise.resolve(page(true));
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.unpinIssue" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_update_repository_issue_pin", {
        input: {
          owner: "octocat",
          repository: "hello-world",
          issueNumber: 7,
          expectedIssueNodeId: "I_7",
          action: "unpin",
        },
      })
    );
    expect(toast.success).toHaveBeenCalledWith("workspace.repositories.issueUnpinned");
    expect(
      await screen.findByRole("button", { name: "workspace.repositories.pinIssue" })
    ).toBeDefined();
  });

  it("surfaces an explicit rate limit and reloads the authoritative state", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(page(true))
      .mockRejectedValueOnce({ code: "githubRateLimited", message: "slow down" })
      .mockResolvedValueOnce(page(true));
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.pinIssue" })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("workspace.repositories.githubRateLimited", {
        description: "slow down",
      })
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
  });

  it("explains GitHub's three-Issue limit without attempting a write", async () => {
    vi.mocked(invoke).mockResolvedValue(
      page(
        true,
        [8, 9, 10].map((number) => ({
          ...currentPinned,
          nodeId: `I_${number}`,
          number,
          title: `Pinned ${number}`,
          url: `https://github.com/octocat/hello-world/issues/${number}`,
        }))
      )
    );

    renderAction();

    const button = await screen.findByRole("button", {
      name: "workspace.repositories.pinIssueLimitReached",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
