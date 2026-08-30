// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssueSummary } from "./github-data";
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
  return onNavigate;
}

beforeEach(() => vi.clearAllMocks());
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
    const onNavigate = renderRelationships();

    expect(await screen.findByText("Parent roadmap item")).toBeDefined();
    expect(screen.getByText("Ship the API")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Parent roadmap item/ }));
    await user.click(screen.getByRole("button", { name: /Ship the API/ }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, parent);
    expect(onNavigate).toHaveBeenNthCalledWith(2, child);
  });

  it("pages sub-issues and offers retry without hiding the Issue body", async () => {
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
