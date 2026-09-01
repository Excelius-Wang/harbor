// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue, GitHubIssueTransferStatus } from "./github-data";
import { GitHubIssueTransferAction } from "./github-issue-transfer";
import {
  parseGitHubRepositoryReference,
  syncTransferredIssue,
} from "./github-issue-transfer-queries";
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
  title: "Move this work",
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

const status: GitHubIssueTransferStatus = {
  sourceRepositoryId: "R_1",
  sourceRepositoryFullName: "octocat/hello-world",
  sourceIssueNodeId: "I_7",
  sourceIssueNumber: 7,
  sourceIssueOpen: true,
  sourcePrivate: false,
  sourceViewerCanTransfer: true,
  targetRepositoryId: "R_2",
  targetRepositoryFullName: "octocat/destination",
  targetRepositoryUrl: "https://github.com/octocat/destination",
  targetDefaultBranch: "main",
  targetPrivate: false,
  targetViewerCanTransfer: true,
  sameOwner: true,
  privateCompatible: true,
  viewerCanTransfer: true,
};

const transfer = {
  sourceRepositoryId: "R_1",
  sourceRepositoryFullName: "octocat/hello-world",
  sourceIssueNodeId: "I_7",
  sourceIssueNumber: 7,
  targetRepositoryId: "R_2",
  targetRepositoryFullName: "octocat/destination",
  targetRepositoryUrl: "https://github.com/octocat/destination",
  targetDefaultBranch: "main",
  targetIssueNodeId: "I_7",
  targetIssueNumber: 11,
  targetIssueUrl: "https://github.com/octocat/destination/issues/11",
};

function renderAction(onTransferred = vi.fn(), queryClient = new QueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueTransferAction
        repository={repository}
        issue={issue}
        onTransferred={(target) => onTransferred(target)}
      />
    </QueryClientProvider>
  );
  return { onTransferred, queryClient };
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue transfer action", () => {
  it("parses only bounded repository references", () => {
    expect(parseGitHubRepositoryReference("octocat/destination")).toEqual({
      owner: "octocat",
      repository: "destination",
    });
    expect(parseGitHubRepositoryReference("https://github.com/octocat/destination")).toEqual({
      owner: "octocat",
      repository: "destination",
    });
    expect(parseGitHubRepositoryReference("https://github.com/octocat/destination/")).toBeNull();
    expect(parseGitHubRepositoryReference("https://github.com/octocat/destination?x=1")).toBeNull();
    expect(parseGitHubRepositoryReference("octocat//destination")).toBeNull();
    expect(parseGitHubRepositoryReference("octocat/.")).toBeNull();
  });

  it("requires an authoritative target review before transferring", async () => {
    vi.mocked(invoke).mockResolvedValue(status);
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "workspace.repositories.transferIssue" }));
    const input = screen.getByRole("textbox");
    await user.type(input, "octocat/destination");
    expect(
      screen
        .getByRole("button", { name: "workspace.repositories.confirmTransferIssue" })
        .hasAttribute("disabled")
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.checkTransferTarget" })
    );
    await screen.findByText("workspace.repositories.transferIssueConfirmDescription");
    expect(
      screen
        .getByRole("button", { name: "workspace.repositories.confirmTransferIssue" })
        .hasAttribute("disabled")
    ).toBe(false);
  });

  it("transfers the reviewed Issue and navigates to the destination", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_transfer_status") return Promise.resolve(status);
      if (command === "github_transfer_repository_issue") return Promise.resolve(transfer);
      return Promise.resolve();
    });
    const onTransferred = vi.fn();
    const user = userEvent.setup();
    renderAction(onTransferred);

    await user.click(screen.getByRole("button", { name: "workspace.repositories.transferIssue" }));
    await user.type(screen.getByRole("textbox"), "octocat/destination");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.checkTransferTarget" })
    );
    await screen.findByText("workspace.repositories.transferIssueConfirmDescription");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.confirmTransferIssue" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_transfer_repository_issue", {
        input: {
          sourceOwner: "octocat",
          sourceRepository: "hello-world",
          issueNumber: 7,
          targetOwner: "octocat",
          targetRepository: "destination",
          expectedIssueNodeId: "I_7",
        },
      })
    );
    expect(toast.success).toHaveBeenCalledWith("workspace.repositories.issueTransferred");
    expect(onTransferred).toHaveBeenCalledWith({
      owner: "octocat",
      name: "destination",
      url: "https://github.com/octocat/destination",
      defaultBranch: "main",
      issueNumber: 11,
    });
  });

  it("surfaces a permission failure and refreshes the target review", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(status)
      .mockRejectedValueOnce({ code: "githubPermission", message: "write access required" })
      .mockResolvedValueOnce(status);
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "workspace.repositories.transferIssue" }));
    await user.type(screen.getByRole("textbox"), "octocat/destination");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.checkTransferTarget" })
    );
    await screen.findByText("workspace.repositories.transferIssueConfirmDescription");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.confirmTransferIssue" })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "workspace.repositories.issueTransferPermissionDenied",
        { description: "write access required" }
      )
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
  });

  it("removes the source Issue from list and pinned caches after transfer", () => {
    const queryClient = new QueryClient();
    const listKey = githubQueryKeys.issues({
      owner: "octocat",
      repository: "hello-world",
      state: "open",
      assignment: "all",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    queryClient.setQueryData(listKey, {
      issues: [issue],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    const target = {
      sourceOwner: "octocat",
      sourceRepository: "hello-world",
      issueNumber: 7,
      targetOwner: "octocat",
      targetRepository: "destination",
      expectedIssueNodeId: "I_7",
    };

    expect(syncTransferredIssue(queryClient, target, transfer)).toEqual({
      owner: "octocat",
      repository: "destination",
      issueNumber: 11,
    });
    expect(queryClient.getQueryData<{ issues: GitHubIssue[] }>(listKey)?.issues).toEqual([]);
  });
});
