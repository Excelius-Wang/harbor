// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssueSummary } from "./github-data";
import { githubIssueRelationshipQueryKeys } from "./github-issue-relationship-queries";
import { GitHubIssueRelationships } from "./github-issue-relationships";

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

function summary(repositoryName: string, number: number, title: string): GitHubIssueSummary {
  return {
    repository: {
      owner: "octocat",
      name: repositoryName,
      fullName: `octocat/${repositoryName}`,
      url: `https://github.com/octocat/${repositoryName}`,
      defaultBranch: "HEAD",
    },
    issue: {
      id: number,
      reactionSubject: { id: `I_${number}`, kind: "issue" },
      number,
      title,
      url: `https://github.com/octocat/${repositoryName}/issues/${number}`,
      state: "open",
      author: "octocat",
      assignees: [],
      labels: [],
      locked: false,
      comments: 0,
      createdAt: "2026-08-30T08:00:00Z",
      updatedAt: "2026-08-30T08:00:00Z",
    },
  };
}

function renderRelationships(onNavigate = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueRelationships repository={repository} issueNumber={7} onNavigate={onNavigate} />
    </QueryClientProvider>
  );
  return { onNavigate, queryClient };
}

beforeEach(() => vi.mocked(invoke).mockReset());
afterEach(() => cleanup());

describe("GitHub Issue relationships", () => {
  it("covers loading and the empty hierarchy state", async () => {
    let resolveRelationships: ((value: unknown) => void) | undefined;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRelationships = resolve;
      })
    );
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueRelationships repository={repository} issueNumber={7} onNavigate={vi.fn()} />
      </QueryClientProvider>
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    resolveRelationships?.({
      parent: null,
      subIssues: [],
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    expect(await screen.findByText("workspace.repositories.noIssueRelationships")).toBeDefined();
  });

  it("explains missing Issues read permission and offers retry", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "githubPermission",
      message: "resource not accessible",
    });
    renderRelationships();

    expect(
      await screen.findByText("workspace.repositories.issueRelationshipsPermissionDenied")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "workspace.repositories.retry" })).toBeDefined();
  });

  it("opens parent and sub-issues through native Issue navigation", async () => {
    const parent = summary("roadmap", 3, "Parent roadmap item");
    const child = summary("api", 9, "Ship the API");
    vi.mocked(invoke).mockResolvedValueOnce({
      parent,
      subIssues: [child],
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    const user = userEvent.setup();
    const { onNavigate } = renderRelationships();

    expect(await screen.findByText("Parent roadmap item")).toBeDefined();
    expect(screen.getByText("Ship the API")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "workspace.repositories.removeSubIssue" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /moveSubIssue/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Parent roadmap item/ }));
    await user.click(screen.getByRole("button", { name: /Ship the API/ }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, parent);
    expect(onNavigate).toHaveBeenNthCalledWith(2, child);
  });

  it("adds one existing Issue from the same repository as a sub-issue", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_add_repository_issue_sub_issue") return Promise.resolve();
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("workspace.repositories.noIssueRelationships");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.addSubIssue" }));
    await user.type(screen.getByLabelText("workspace.repositories.subIssueNumber"), "42");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.addSubIssueConfirm" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_add_repository_issue_sub_issue", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        subIssueNumber: 42,
      })
    );
  });

  it("creates one blank Issue directly as a sub-issue and refreshes both identities", async () => {
    const child = summary("hello-world", 42, "Child work");
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_get_repository_issue_creation_policy") {
        return Promise.resolve({
          blankIssueAllowed: true,
          contactLinks: [],
          templates: [],
          templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
        });
      }
      if (command === "github_create_repository_issue_sub_issue") return Promise.resolve(child);
      return Promise.resolve();
    });
    const user = userEvent.setup();
    const { queryClient } = renderRelationships();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("workspace.repositories.noIssueRelationships");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.createSubIssue" }));
    await user.type(
      await screen.findByLabelText("workspace.repositories.issueTitle"),
      "Child work"
    );
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.createSubIssueConfirm" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_create_repository_issue_sub_issue", {
        input: {
          owner: "octocat",
          repository: "hello-world",
          issueNumber: 7,
          title: "Child work",
          body: "",
        },
      })
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: githubIssueRelationshipQueryKeys.root({
          owner: "octocat",
          repository: "hello-world",
          issueNumber: 42,
        }),
        refetchType: "active",
      })
    );
  });

  it("keeps native sub-issue creation hidden when the repository requires templates", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_get_repository_issue_creation_policy") {
        return Promise.resolve({
          blankIssueAllowed: false,
          contactLinks: [],
          templates: [],
          templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
        });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("workspace.repositories.noIssueRelationships");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.createSubIssue" }));

    expect(
      await screen.findByText("workspace.repositories.subIssueCreationRestricted")
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "workspace.repositories.createSubIssueConfirm" })
    ).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(
      "github_create_repository_issue_sub_issue",
      expect.anything()
    );
  });

  it("labels a sub-issue creation policy rate limit explicitly", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_get_repository_issue_creation_policy") {
        return Promise.reject({ code: "githubRateLimited", message: "slow down" });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("workspace.repositories.noIssueRelationships");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.createSubIssue" }));

    expect(await screen.findByText("workspace.repositories.githubRateLimited")).toBeDefined();
  });

  it("preserves the new sub-issue title after a failed write", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_get_repository_issue_creation_policy") {
        return Promise.resolve({
          blankIssueAllowed: true,
          contactLinks: [],
          templates: [],
          templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
        });
      }
      if (command === "github_create_repository_issue_sub_issue") {
        return Promise.reject({ code: "github", message: "write failed" });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("workspace.repositories.noIssueRelationships");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.createSubIssue" }));
    const title = await screen.findByLabelText("workspace.repositories.issueTitle");
    await user.type(title, "Keep this child title");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.createSubIssueConfirm" })
    );

    expect(await screen.findByText("write failed")).toBeDefined();
    expect((title as HTMLInputElement).value).toBe("Keep this child title");
  });

  it("labels a new sub-issue write rate limit explicitly", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_get_repository_issue_creation_policy") {
        return Promise.resolve({
          blankIssueAllowed: true,
          contactLinks: [],
          templates: [],
          templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
        });
      }
      if (command === "github_create_repository_issue_sub_issue") {
        return Promise.reject({ code: "githubRateLimited", message: "slow down" });
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("workspace.repositories.noIssueRelationships");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.createSubIssue" }));
    await user.type(
      await screen.findByLabelText("workspace.repositories.issueTitle"),
      "Rate-limited child"
    );
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.createSubIssueConfirm" })
    );

    expect(await screen.findByText("workspace.repositories.githubRateLimited")).toBeDefined();
  });

  it("confirms before removing a same-repository sub-issue", async () => {
    const child = summary("hello-world", 42, "Detach this child");
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [child],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_remove_repository_issue_sub_issue") return Promise.resolve();
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("Detach this child");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.removeSubIssue" }));
    expect(
      await screen.findByRole("heading", {
        name: "workspace.repositories.removeSubIssueConfirm",
      })
    ).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.removeSubIssueConfirm" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_remove_repository_issue_sub_issue", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        subIssueNumber: 42,
      })
    );
  });

  it("moves one same-repository sub-issue after its adjacent sibling", async () => {
    const first = summary("hello-world", 41, "Move this child");
    const second = summary("hello-world", 42, "Adjacent child");
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_relationships") {
        return Promise.resolve({
          parent: null,
          subIssues: [first, second],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_reprioritize_repository_issue_sub_issue") return Promise.resolve();
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("Move this child");
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.moveSubIssueDown 41",
      })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_reprioritize_repository_issue_sub_issue", {
        input: {
          owner: "octocat",
          repository: "hello-world",
          issueNumber: 7,
          page: 1,
          subIssueNumber: 41,
          relativeIssueNumber: 42,
          placement: "after",
        },
      })
    );
  });

  it("keeps cached rows visible and offers retry after a permission refresh failure", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        parent: null,
        subIssues: [summary("hello-world", 8, "Cached child")],
        page: 1,
        hasPrevious: false,
        hasMore: false,
      })
      .mockRejectedValueOnce({ code: "githubPermission", message: "permission changed" })
      .mockResolvedValueOnce({
        parent: null,
        subIssues: [summary("hello-world", 9, "Refreshed child")],
        page: 1,
        hasPrevious: false,
        hasMore: false,
      });
    const user = userEvent.setup();
    const { queryClient } = renderRelationships();

    expect(await screen.findByText("Cached child")).toBeDefined();
    await queryClient.invalidateQueries({
      queryKey: githubIssueRelationshipQueryKeys.root({
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
      }),
    });

    expect(
      await screen.findByText("workspace.repositories.issueRelationshipsPermissionDenied")
    ).toBeDefined();
    expect(screen.getByText("Cached child")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));
    expect(await screen.findByText("Refreshed child")).toBeDefined();
  });

  it("pages sub-issues and offers retry after a page failure", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        parent: null,
        subIssues: [summary("hello-world", 8, "First child")],
        page: 1,
        hasPrevious: false,
        hasMore: true,
      })
      .mockRejectedValueOnce({ code: "github", message: "temporarily unavailable" })
      .mockResolvedValueOnce({
        parent: null,
        subIssues: [summary("hello-world", 10, "Second-page child")],
        page: 2,
        hasPrevious: true,
        hasMore: false,
      });
    const user = userEvent.setup();
    renderRelationships();

    await screen.findByText("First child");
    await user.click(screen.getByRole("link", { name: "workspace.repositories.nextPage" }));
    expect(
      await screen.findByText("workspace.repositories.issueRelationshipsLoadFailed")
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));

    expect(await screen.findByText("Second-page child")).toBeDefined();
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("github_get_repository_issue_relationships", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        page: 2,
      })
    );
  });
});
