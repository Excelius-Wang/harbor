// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubIssue,
  GitHubIssueTrackingReference,
  GitHubIssueTrackingRepository,
} from "./github-data";
import { GitHubIssueTracking } from "./github-issue-tracking";

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

const issue: GitHubIssue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Task list issue",
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

function reference(
  repositoryName: string,
  number: number,
  title: string,
  state: "open" | "closed" = "open"
): GitHubIssueTrackingReference {
  const trackingRepository: GitHubIssueTrackingRepository = {
    owner: "octocat",
    name: repositoryName,
    fullName: "octocat/" + repositoryName,
    url: "https://github.com/octocat/" + repositoryName,
  };
  return {
    nodeId: "I_" + number,
    number,
    title,
    url: trackingRepository.url + "/issues/" + number,
    state,
    repository: trackingRepository,
  };
}

function renderTracking(onNavigate = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GitHubIssueTracking repository={repository} issue={issue} onNavigate={onNavigate} />
    </QueryClientProvider>
  );
  return onNavigate;
}

beforeEach(() => vi.mocked(invoke).mockReset());
afterEach(() => cleanup());

describe("GitHub Issue task-list tracking", () => {
  it("renders both tracking directions and navigates to a tracked Issue", async () => {
    const tracked = reference("api", 9, "Implement API");
    const tracker = reference("roadmap", 3, "Track roadmap", "closed");
    vi.mocked(invoke)
      .mockResolvedValueOnce({ direction: "tracked", issues: [tracked], nextCursor: null })
      .mockResolvedValueOnce({ direction: "trackedBy", issues: [tracker], nextCursor: null });
    const user = userEvent.setup();
    const onNavigate = renderTracking();

    expect(await screen.findByText("Implement API")).toBeDefined();
    expect(screen.getByText("Track roadmap")).toBeDefined();
    expect(screen.getByText("workspace.repositories.trackedIssues")).toBeDefined();
    expect(screen.getByText("workspace.repositories.trackedByIssues")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /Implement API/ }));
    expect(onNavigate).toHaveBeenCalledWith(tracked);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_issue_tracking", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      direction: "tracked",
      after: null,
    });
  });

  it("shows empty tracking sections and passes cursors when paging", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        direction: "tracked",
        issues: [reference("api", 9, "First tracked")],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({ direction: "trackedBy", issues: [], nextCursor: null })
      .mockResolvedValueOnce({
        direction: "tracked",
        issues: [reference("api", 10, "Second tracked")],
        nextCursor: null,
      });
    const user = userEvent.setup();
    renderTracking();

    await screen.findByText("First tracked");
    expect(screen.getByText("workspace.repositories.noTrackedByIssues")).toBeDefined();
    await user.click(screen.getByRole("link", { name: "workspace.repositories.nextPage" }));

    expect(await screen.findByText("Second tracked")).toBeDefined();
    expect(invoke).toHaveBeenLastCalledWith("github_get_repository_issue_tracking", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      direction: "tracked",
      after: "cursor-2",
    });
  });

  it("keeps the other direction visible and retries a failed tracking read", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce({ code: "githubPermission", message: "permission changed" })
      .mockResolvedValueOnce({
        direction: "trackedBy",
        issues: [reference("roadmap", 3, "Roadmap")],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ direction: "tracked", issues: [], nextCursor: null });
    const user = userEvent.setup();
    renderTracking();

    expect(
      await screen.findByText("workspace.repositories.issueTrackingPermissionDenied")
    ).toBeDefined();
    expect(screen.getByText("Roadmap")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));
    expect(await screen.findByText("workspace.repositories.noTrackedIssues")).toBeDefined();
  });
});
