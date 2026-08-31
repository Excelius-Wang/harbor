// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { GitHubIssue, GitHubIssueDetailPage } from "./github-data";
import { GitHubIssueMarkDuplicateAction } from "./github-issue-mark-duplicate-action";

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
  title: "Repeated report",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "open",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-08-30T08:00:00Z",
  updatedAt: "2026-08-30T08:00:00Z",
};

const candidate: GitHubIssueDetailPage = {
  issue: {
    ...issue,
    id: 9,
    reactionSubject: { id: "I_9", kind: "issue" },
    number: 9,
    title: "Canonical Issue",
    url: "https://github.com/octocat/hello-world/issues/9",
  },
  timeline: [],
  timelinePage: 1,
  timelineHasPrevious: false,
  timelineHasMore: false,
};

function capabilities(viewerCanClose: boolean) {
  return {
    repositoryId: "R_1",
    repositoryFullName: "octocat/hello-world",
    issueNodeId: "I_7",
    number: 7,
    state: "open",
    stateReason: null,
    updatedAt: issue.updatedAt,
    viewerCanClose,
    viewerCanReopen: false,
  };
}

function renderAction() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueMarkDuplicateAction repository={repository} issue={issue} />
    </QueryClientProvider>
  );
  return queryClient;
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue mark duplicate action", () => {
  it("shows a disabled action while GitHub close capability is loading", async () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => undefined));

    renderAction();

    expect(
      (
        await screen.findByRole("button", {
          name: /workspace\.repositories\.markIssueDuplicateLoading/,
        })
      ).hasAttribute("disabled")
    ).toBe(true);
  });

  it("previews a same-repository canonical Issue before marking the current Issue", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        return Promise.resolve(capabilities(true));
      }
      if (command === "github_get_repository_issue") return Promise.resolve(candidate);
      if (command === "github_mark_repository_issue_duplicate") {
        return Promise.resolve({ ...issue, state: "closed", stateReason: "duplicate" });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.markIssueDuplicate" })
    );
    await user.type(screen.getByLabelText("workspace.repositories.canonicalIssueNumber"), "9");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.reviewDuplicateTarget" })
    );

    expect(await screen.findByText("Canonical Issue")).toBeDefined();
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 9,
      timelinePage: 1,
    });

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.markIssueDuplicateConfirm" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_mark_repository_issue_duplicate", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        canonicalIssueNumber: 9,
        expectedIssueNodeId: "I_7",
      })
    );
  });

  it("hides the action when GitHub does not allow the current Issue to close", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(capabilities(false));

    renderAction();

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_state_capabilities", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
      })
    );
    expect(
      screen.queryByRole("button", { name: "workspace.repositories.markIssueDuplicate" })
    ).toBeNull();
  });

  it("does not accept a canonical Issue that is itself marked duplicate", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        return Promise.resolve(capabilities(true));
      }
      if (command === "github_get_repository_issue") {
        return Promise.resolve({
          ...candidate,
          issue: { ...candidate.issue, state: "closed", stateReason: "duplicate" },
        });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.markIssueDuplicate" })
    );
    await user.type(screen.getByLabelText("workspace.repositories.canonicalIssueNumber"), "9");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.reviewDuplicateTarget" })
    );

    expect(
      await screen.findByText("workspace.repositories.duplicateTargetIsDuplicate")
    ).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "workspace.repositories.markIssueDuplicateConfirm",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("reports a mark rate limit explicitly", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        return Promise.resolve(capabilities(true));
      }
      if (command === "github_get_repository_issue") return Promise.resolve(candidate);
      if (command === "github_mark_repository_issue_duplicate") {
        return Promise.reject({ code: "githubRateLimited", message: "slow down" });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderAction();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.markIssueDuplicate" })
    );
    await user.type(screen.getByLabelText("workspace.repositories.canonicalIssueNumber"), "9");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.reviewDuplicateTarget" })
    );
    await screen.findByText("Canonical Issue");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.markIssueDuplicateConfirm" })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("workspace.repositories.githubRateLimited", {
        description: "slow down",
      })
    );
  });
});
