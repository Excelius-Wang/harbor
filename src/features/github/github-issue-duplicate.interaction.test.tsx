// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { GitHubIssue } from "./github-data";
import { GitHubIssueDuplicate } from "./github-issue-duplicate";

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

const duplicateIssue: GitHubIssue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Duplicated Issue",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "closed",
  stateReason: "duplicate",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-08-30T08:00:00Z",
  updatedAt: "2026-08-30T08:00:00Z",
};

function renderDuplicate(issue = duplicateIssue, onNavigate = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueDuplicate repository={repository} issue={issue} onNavigate={onNavigate} />
    </QueryClientProvider>
  );
  return { onNavigate, queryClient };
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue duplicate reference", () => {
  it("loads the canonical Issue and navigates to it", async () => {
    const duplicate = {
      owner: "octocat",
      repository: "api",
      fullName: "octocat/api",
      repositoryUrl: "https://github.com/octocat/api",
      issueNumber: 9,
      title: "Canonical Issue",
      url: "https://github.com/octocat/api/issues/9",
      viewerCanUnmark: true,
    };
    vi.mocked(invoke).mockResolvedValueOnce(duplicate);
    const { onNavigate } = renderDuplicate();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Canonical Issue/ }));

    expect(onNavigate).toHaveBeenCalledWith(duplicate);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_duplicate", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
    });
  });

  it("confirms before unmarking the current Issue as a duplicate", async () => {
    const duplicate = {
      owner: "octocat",
      repository: "api",
      fullName: "octocat/api",
      repositoryUrl: "https://github.com/octocat/api",
      issueNumber: 9,
      title: "Canonical Issue",
      url: "https://github.com/octocat/api/issues/9",
      viewerCanUnmark: true,
    };
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_duplicate") return Promise.resolve(duplicate);
      if (command === "github_unmark_repository_issue_duplicate") {
        return Promise.resolve({ ...duplicateIssue, stateReason: "completed" });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderDuplicate();

    await screen.findByText("Canonical Issue");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.unmarkIssueDuplicate" })
    );
    expect(
      await screen.findByRole("heading", {
        name: "workspace.repositories.unmarkIssueDuplicateConfirm",
      })
    ).toBeDefined();
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.unmarkIssueDuplicateConfirm",
      })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_unmark_repository_issue_duplicate", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
      })
    );
  });

  it("keeps a read-only duplicate navigable without showing the unmark action", async () => {
    const duplicate = {
      owner: "octocat",
      repository: "api",
      fullName: "octocat/api",
      repositoryUrl: "https://github.com/octocat/api",
      issueNumber: 9,
      title: "Canonical Issue",
      url: "https://github.com/octocat/api/issues/9",
      viewerCanUnmark: false,
    };
    vi.mocked(invoke).mockResolvedValueOnce(duplicate);
    const { onNavigate } = renderDuplicate();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Canonical Issue/ }));

    expect(onNavigate).toHaveBeenCalledWith(duplicate);
    expect(
      screen.queryByRole("button", { name: "workspace.repositories.unmarkIssueDuplicate" })
    ).toBeNull();
  });

  it("reports an unmark rate limit and keeps the confirmation open", async () => {
    const duplicate = {
      owner: "octocat",
      repository: "api",
      fullName: "octocat/api",
      repositoryUrl: "https://github.com/octocat/api",
      issueNumber: 9,
      title: "Canonical Issue",
      url: "https://github.com/octocat/api/issues/9",
      viewerCanUnmark: true,
    };
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_duplicate") return Promise.resolve(duplicate);
      if (command === "github_unmark_repository_issue_duplicate") {
        return Promise.reject({ code: "githubRateLimited", message: "slow down" });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderDuplicate();

    await user.click(
      await screen.findByRole("button", {
        name: "workspace.repositories.unmarkIssueDuplicate",
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.unmarkIssueDuplicateConfirm",
      })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("workspace.repositories.githubRateLimited", {
        description: "slow down",
      })
    );
    expect(
      screen.getByRole("heading", {
        name: "workspace.repositories.unmarkIssueDuplicateConfirm",
      })
    ).toBeDefined();
  });

  it("reports a duplicate lookup rate limit explicitly", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "githubRateLimited",
      message: "slow down",
    });

    renderDuplicate();

    expect(await screen.findByText("workspace.repositories.githubRateLimited")).toBeDefined();
    expect(screen.getByText("slow down")).toBeDefined();
  });

  it("does not load a canonical Issue when this Issue is not marked duplicate", async () => {
    renderDuplicate({ ...duplicateIssue, stateReason: "completed" });

    await waitFor(() => expect(invoke).not.toHaveBeenCalled());
    expect(screen.queryByText("workspace.repositories.duplicateOfIssue")).toBeNull();
  });
});
