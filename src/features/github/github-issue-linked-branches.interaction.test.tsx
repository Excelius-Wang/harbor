// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssueLinkedBranchPage } from "./github-data";
import { GitHubIssueLinkedBranches } from "./github-issue-linked-branches";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};
const issue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" as const },
  number: 7,
  title: "Issue",
  body: "Body",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "open" as const,
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-08-30T08:00:00Z",
  updatedAt: "2026-08-30T08:00:00Z",
};

function page(branches: GitHubIssueLinkedBranchPage["branches"] = [], viewerCanCreate = true) {
  return {
    repositoryId: "R_1",
    repositoryFullName: "octocat/hello-world",
    issueNodeId: "I_7",
    issueNumber: 7,
    defaultBranch: "main",
    defaultBranchOid: "0123456789abcdef0123456789abcdef01234567",
    viewerCanCreate,
    viewerCanRead: true,
    branches,
    nextCursor: null,
  } satisfies GitHubIssueLinkedBranchPage;
}

function renderAction() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueLinkedBranches repository={repository} issue={issue} />
    </QueryClientProvider>
  );
  return queryClient;
}

beforeEach(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  vi.mocked(invoke).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue linked branches", () => {
  it("creates a branch from the authoritative default revision", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_linked_branches") return Promise.resolve(page());
      if (command === "github_create_repository_issue_linked_branch")
        return Promise.resolve(
          page([
            {
              id: "LB_1",
              name: "issue-7",
              repositoryId: "R_1",
              repositoryFullName: "octocat/hello-world",
              oid: "0123456789abcdef0123456789abcdef01234567",
            },
          ])
        );
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.createLinkedBranch" })
    );
    await user.type(screen.getByLabelText("workspace.repositories.linkedBranchName"), "issue-7");
    const createButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.createLinkedBranch",
    });
    await user.click(createButtons[createButtons.length - 1]);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_create_repository_issue_linked_branch", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
        expectedDefaultBranchOid: "0123456789abcdef0123456789abcdef01234567",
        branchName: "issue-7",
        branchRepository: null,
      })
    );
  });

  it("hides branch writes when GitHub denies repository write permission", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...page([], false), viewerCanRead: false });
    renderAction();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_linked_branches", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
        after: null,
      })
    );
    expect(
      screen.queryByRole("button", { name: "workspace.repositories.createLinkedBranch" })
    ).toBeNull();
  });

  it("localizes an initial rate-limit failure", async () => {
    vi.mocked(invoke).mockRejectedValue({
      code: "githubRateLimited",
      message: "secondary rate limit",
    });
    renderAction();
    expect(await screen.findAllByText("workspace.repositories.githubRateLimited")).not.toHaveLength(
      0
    );
    expect(screen.queryByText("secondary rate limit")).toBeNull();
  });

  it("passes an explicit destination repository for a linked branch", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_linked_branches") return Promise.resolve(page());
      if (command === "github_create_repository_issue_linked_branch")
        return Promise.resolve(page());
      return Promise.resolve();
    });
    const user = userEvent.setup();
    const queryClient = renderAction();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.createLinkedBranch" })
    );
    await user.type(screen.getByLabelText("workspace.repositories.linkedBranchName"), "issue-7");
    await user.clear(screen.getByLabelText("workspace.repositories.linkedBranchRepository"));
    await user.type(
      screen.getByLabelText("workspace.repositories.linkedBranchRepository"),
      "octocat/other"
    );
    const createButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.createLinkedBranch",
    });
    await user.click(createButtons[createButtons.length - 1]);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_create_repository_issue_linked_branch", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
        expectedDefaultBranchOid: "0123456789abcdef0123456789abcdef01234567",
        branchName: "issue-7",
        branchRepository: "octocat/other",
      })
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.codeRoot({ owner: "octocat", repository: "hello-world" }),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.codeRoot({ owner: "octocat", repository: "other" }),
    });
  });

  it("unlinks a branch without deleting it", async () => {
    const existing = {
      id: "LB_1",
      name: "issue-7",
      repositoryId: "R_1",
      repositoryFullName: "octocat/hello-world",
      oid: "0123456789abcdef0123456789abcdef01234567",
    };
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_linked_branches")
        return Promise.resolve(page([existing]));
      if (command === "github_delete_repository_issue_linked_branch")
        return Promise.resolve(page());
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderAction();
    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.unlinkLinkedBranch" })
    );
    const unlinkButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.unlinkLinkedBranch",
    });
    await user.click(unlinkButtons[unlinkButtons.length - 1]);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_delete_repository_issue_linked_branch", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
        linkedBranchId: "LB_1",
        expectedBranchName: "issue-7",
        expectedBranchOid: "0123456789abcdef0123456789abcdef01234567",
      })
    );
  });

  it("walks linked branch pages in both directions", async () => {
    const first = page([], true);
    const second = page(
      [
        {
          id: "LB_2",
          name: "issue-8",
          repositoryId: "R_1",
          repositoryFullName: "octocat/hello-world",
          oid: first.defaultBranchOid,
        },
      ],
      true
    );
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command !== "github_get_repository_issue_linked_branches") return Promise.resolve();
      return Promise.resolve(
        args && typeof args === "object" && "after" in args && args.after
          ? second
          : { ...first, nextCursor: "CURSOR_1" }
      );
    });
    const user = userEvent.setup();
    renderAction();

    await user.click(await screen.findByRole("link", { name: "workspace.repositories.nextPage" }));
    expect(await screen.findByText("issue-8")).toBeDefined();
    await user.click(screen.getByRole("link", { name: "workspace.repositories.previousPage" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_linked_branches", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
        after: "CURSOR_1",
      })
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_linked_branches", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
        after: null,
      })
    );
  });
});
