// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssueSummary } from "./github-data";
import { githubIssueDependencyQueryKeys } from "./github-issue-dependency-queries";
import { GitHubIssueDependencies } from "./github-issue-dependencies";

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

function renderDependencies(onNavigate = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueDependencies repository={repository} issueNumber={7} onNavigate={onNavigate} />
    </QueryClientProvider>
  );
  return { onNavigate, queryClient };
}

beforeEach(() => vi.mocked(invoke).mockReset());
afterEach(() => cleanup());

describe("GitHub Issue dependencies", () => {
  it("covers loading and the empty dependency state", async () => {
    let resolveDependencies: ((value: unknown) => void) | undefined;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDependencies = resolve;
      })
    );
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueDependencies repository={repository} issueNumber={7} onNavigate={vi.fn()} />
      </QueryClientProvider>
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    resolveDependencies?.({
      blockedBy: [],
      blocking: [],
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    expect(await screen.findByText("workspace.repositories.noIssueDependencies")).toBeDefined();
  });

  it("shows both directions and navigates through each related Issue", async () => {
    const prerequisite = summary("api", 9, "Ship API first");
    const dependent = summary("roadmap", 3, "Publish roadmap");
    vi.mocked(invoke).mockResolvedValueOnce({
      blockedBy: [prerequisite],
      blocking: [dependent],
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    const user = userEvent.setup();
    const { onNavigate } = renderDependencies();

    expect(await screen.findByText("workspace.repositories.blockedByIssues")).toBeDefined();
    expect(screen.getByText("workspace.repositories.blockingIssues")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Ship API first/ }));
    await user.click(screen.getByRole("button", { name: /Publish roadmap/ }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, prerequisite);
    expect(onNavigate).toHaveBeenNthCalledWith(2, dependent);
  });

  it("adds one blocking Issue from its GitHub Issue URL and refreshes the dependency page", async () => {
    const blocker = summary("api", 9, "Ship API first");
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_dependencies") {
        return Promise.resolve({
          blockedBy: [],
          blocking: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_add_repository_issue_dependency") {
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderDependencies();

    await screen.findByText("workspace.repositories.noIssueDependencies");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.addDependency" }));
    const issueUrl = screen.getByLabelText("workspace.repositories.dependencyIssueUrl");
    await user.type(issueUrl, blocker.issue.url);
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.addDependencyConfirm" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_add_repository_issue_dependency", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        blockingOwner: "octocat",
        blockingRepository: "api",
        blockingIssueNumber: 9,
      })
    );
  });

  it("requires confirmation before removing a selected blocking Issue", async () => {
    const blocker = summary("api", 9, "Ship API first");
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_dependencies") {
        return Promise.resolve({
          blockedBy: [blocker],
          blocking: [],
          page: 1,
          hasPrevious: false,
          hasMore: false,
        });
      }
      if (command === "github_remove_repository_issue_dependency") {
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    const user = userEvent.setup();
    renderDependencies();

    await screen.findByText("Ship API first");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.removeDependency" })
    );
    expect(
      await screen.findByRole("heading", { name: "workspace.repositories.removeDependencyConfirm" })
    ).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.removeDependencyConfirm" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_remove_repository_issue_dependency", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        blockingIssueId: 9,
      })
    );
  });

  it("keeps cached dependencies visible and retries after a permission refresh failure", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        blockedBy: [summary("api", 8, "Cached prerequisite")],
        blocking: [],
        page: 1,
        hasPrevious: false,
        hasMore: false,
      })
      .mockRejectedValueOnce({ code: "githubPermission", message: "permission changed" })
      .mockResolvedValueOnce({
        blockedBy: [summary("api", 9, "Refreshed prerequisite")],
        blocking: [],
        page: 1,
        hasPrevious: false,
        hasMore: false,
      });
    const user = userEvent.setup();
    const { queryClient } = renderDependencies();

    expect(await screen.findByText("Cached prerequisite")).toBeDefined();
    await queryClient.invalidateQueries({
      queryKey: githubIssueDependencyQueryKeys.root({
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
      }),
    });

    expect(
      await screen.findByText("workspace.repositories.issueDependenciesPermissionDenied")
    ).toBeDefined();
    expect(screen.getByText("Cached prerequisite")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));
    expect(await screen.findByText("Refreshed prerequisite")).toBeDefined();
  });

  it("pages both dependency directions and offers retry after a page failure", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        blockedBy: [summary("api", 8, "First prerequisite")],
        blocking: [],
        page: 1,
        hasPrevious: false,
        hasMore: true,
      })
      .mockRejectedValueOnce({ code: "github", message: "temporarily unavailable" })
      .mockResolvedValueOnce({
        blockedBy: [],
        blocking: [summary("roadmap", 10, "Second-page dependent")],
        page: 2,
        hasPrevious: true,
        hasMore: false,
      });
    const user = userEvent.setup();
    renderDependencies();

    await screen.findByText("First prerequisite");
    await user.click(screen.getByRole("link", { name: "workspace.repositories.nextPage" }));
    expect(
      await screen.findByText("workspace.repositories.issueDependenciesLoadFailed")
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));

    expect(await screen.findByText("Second-page dependent")).toBeDefined();
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("github_get_repository_issue_dependencies", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        page: 2,
      })
    );
  });
});
