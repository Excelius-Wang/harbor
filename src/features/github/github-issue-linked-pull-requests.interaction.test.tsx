// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue } from "./github-data";
import { GitHubIssueLinkedPullRequests } from "./github-issue-linked-pull-requests";
import { openExternalUrl } from "@/lib/window";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));
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
  title: "Issue with linked pull requests",
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

const firstPage = {
  pullRequests: [
    {
      fullName: "octocat/api",
      number: 9,
      title: "Ship API",
      url: "https://github.com/octocat/api/pull/9",
      state: "open" as const,
      draft: false,
      merged: false,
    },
  ],
  nextCursor: "cursor-2",
};

function renderLinkedPullRequests() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GitHubIssueLinkedPullRequests repository={repository} issue={issue} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(openExternalUrl).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue linked pull requests", () => {
  it("shows a loading placeholder before the linked pull requests arrive", async () => {
    let resolvePage: ((value: unknown) => void) | undefined;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      })
    );
    const { container } = renderLinkedPullRequests();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    resolvePage?.({ pullRequests: [], nextCursor: null });
    expect(await screen.findByText("workspace.repositories.noLinkedPullRequests")).toBeDefined();
  });

  it("shows linked pull requests and opens their canonical GitHub URL", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(firstPage);
    const user = userEvent.setup();
    renderLinkedPullRequests();

    await user.click(await screen.findByRole("button", { name: /Ship API/ }));

    expect(openExternalUrl).toHaveBeenCalledWith("https://github.com/octocat/api/pull/9");
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_linked_pull_requests", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      after: null,
    });
  });

  it("uses GitHub's next cursor when loading another page", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({ pullRequests: [], nextCursor: null });
    const user = userEvent.setup();
    renderLinkedPullRequests();

    await screen.findByText("Ship API");
    await user.click(screen.getByRole("link", { name: "workspace.repositories.nextPage" }));

    await screen.findByText("workspace.repositories.noLinkedPullRequests");
    expect(invoke).toHaveBeenLastCalledWith("github_get_repository_issue_linked_pull_requests", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      after: "cursor-2",
    });
  });

  it("renders an empty linked-pull-request state", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ pullRequests: [], nextCursor: null });
    renderLinkedPullRequests();

    expect(await screen.findByText("workspace.repositories.noLinkedPullRequests")).toBeDefined();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  });

  it("recovers from a linked-pull-request permission error after retry", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce({ code: "githubPermission", message: "permission changed" })
      .mockResolvedValueOnce({ pullRequests: [], nextCursor: null });
    const user = userEvent.setup();
    renderLinkedPullRequests();

    expect(
      await screen.findByText("workspace.repositories.issueLinkedPullRequestsPermissionDenied")
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));

    expect(await screen.findByText("workspace.repositories.noLinkedPullRequests")).toBeDefined();
  });
});
