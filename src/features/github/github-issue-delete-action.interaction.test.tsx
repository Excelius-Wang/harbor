// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue } from "./github-data";
import { GitHubIssueDeleteAction } from "./github-issue-delete-action";
import { githubIssuePinQueryKeys } from "./github-issue-pin-queries";
import { githubQueryKeys } from "./github-queries";

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
  title: "Remove obsolete work",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "open",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

const status = {
  repositoryId: "R_1",
  repositoryFullName: "octocat/hello-world",
  issueNodeId: "I_7",
  number: 7,
  viewerCanDelete: true,
};

function renderAction(
  onDeleted = vi.fn(),
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueDeleteAction repository={repository} issue={issue} onDeleted={onDeleted} />
    </QueryClientProvider>
  );
  return { onDeleted, queryClient };
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue delete action", () => {
  it("shows a disabled action while the authoritative permission loads", async () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => undefined));

    renderAction();

    expect(
      (
        await screen.findByRole("button", {
          name: "workspace.repositories.deleteIssueLoading",
        })
      ).hasAttribute("disabled")
    ).toBe(true);
  });

  it("hides deletion without GitHub's authoritative permission", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...status, viewerCanDelete: false });

    renderAction();

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "workspace.repositories.deleteIssue" })).toBeNull();
  });

  it("requires a matching Issue identity before exposing deletion", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...status, issueNodeId: "I_changed" });

    renderAction();

    expect(
      await screen.findByRole("button", {
        name: "workspace.repositories.deleteIssueStatusUnavailable",
      })
    ).toBeDefined();
  });

  it("cancels without sending a delete mutation", async () => {
    vi.mocked(invoke).mockResolvedValue(status);
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.deleteIssue" })
    );
    await user.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("confirms and permanently deletes the exact authoritative Issue", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_delete_status") return Promise.resolve(status);
      if (command === "github_delete_repository_issue") {
        return Promise.resolve({
          repositoryId: "R_1",
          repositoryFullName: "octocat/hello-world",
          issueNodeId: "I_7",
          number: 7,
        });
      }
      return Promise.resolve();
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      githubQueryKeys.issues({
        owner: "octocat",
        repository: "hello-world",
        state: "open",
        assignment: "all",
        query: "",
        label: "",
        sort: "updated",
        page: 1,
      }),
      { issues: [issue], totalCount: 1, page: 1, hasPrevious: false, hasMore: false }
    );
    const pinTarget = { owner: "octocat", repository: "hello-world" };
    queryClient.setQueryData(githubIssuePinQueryKeys.root(pinTarget), {
      repositoryId: "R_1",
      repositoryFullName: "octocat/hello-world",
      viewerCanManage: true,
      issues: [
        {
          nodeId: "I_7",
          number: 7,
          title: issue.title,
          url: issue.url,
          state: "open",
          pinnedBy: "octocat",
        },
      ],
    });
    const { onDeleted } = renderAction(vi.fn(), queryClient);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.deleteIssue" })
    );
    expect(await screen.findByText("workspace.repositories.deleteIssueWarning")).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.confirmDeleteIssue" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_delete_repository_issue", {
        input: {
          owner: "octocat",
          repository: "hello-world",
          issueNumber: 7,
          expectedIssueNodeId: "I_7",
        },
      })
    );
    expect(toast.success).toHaveBeenCalledWith("workspace.repositories.issueDeleted");
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryData<{ issues: GitHubIssue[] }>(
        githubQueryKeys.issues({
          owner: "octocat",
          repository: "hello-world",
          state: "open",
          assignment: "all",
          query: "",
          label: "",
          sort: "updated",
          page: 1,
        })
      )?.issues
    ).toEqual([]);
    expect(
      queryClient.getQueryData<{ issues: Array<{ nodeId: string }> }>(
        githubIssuePinQueryKeys.root(pinTarget)
      )?.issues
    ).toEqual([]);
  });

  it("surfaces an explicit rate limit and reloads authoritative permission", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(status)
      .mockRejectedValueOnce({ code: "githubRateLimited", message: "slow down" })
      .mockResolvedValueOnce(status);
    const user = userEvent.setup();
    const { onDeleted } = renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.deleteIssue" })
    );
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.confirmDeleteIssue" })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("workspace.repositories.githubRateLimited", {
        description: "slow down",
      })
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
