// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueDetail } from "./github-issue-detail";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("./github-issue-timeline", () => ({
  GitHubIssueTimeline: ({ afterIssue }: { afterIssue?: React.ReactNode }) => <>{afterIssue}</>,
}));
vi.mock("./github-issue-relationships", () => ({
  GitHubIssueRelationships: ({
    onNavigate,
  }: {
    onNavigate: (summary: {
      repository: {
        owner: string;
        name: string;
        fullName: string;
        url: string;
        defaultBranch: string;
      };
      issue: { number: number };
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onNavigate({
          repository: {
            owner: "octocat",
            name: "roadmap",
            fullName: "octocat/roadmap",
            url: "https://github.com/octocat/roadmap",
            defaultBranch: "HEAD",
          },
          issue: { number: 3 },
        })
      }
    >
      Open parent natively
    </button>
  ),
}));
vi.mock("./github-issue-metadata", () => ({ GitHubIssueMetadata: () => null }));
vi.mock("./github-issue-edit-dialog", () => ({ GitHubIssueEditDialog: () => null }));
vi.mock("./github-comment-form", () => ({ GitHubCommentForm: () => null }));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};

function issue(number: number, title: string, repositoryName: string) {
  return {
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
  };
}

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockImplementation((command, args) => {
    if (command === "github_get_repository_issue") {
      const request = args as { repository: string; issueNumber: number };
      return Promise.resolve({
        issue:
          request.repository === "roadmap"
            ? issue(3, "Parent issue detail", "roadmap")
            : issue(7, "Root issue detail", "hello-world"),
        timeline: [],
        timelinePage: 1,
        timelineHasPrevious: false,
        timelineHasMore: false,
      });
    }
    if (command === "github_get_repository_issue_state_capabilities") {
      const request = args as { repository: string; issueNumber: number };
      return Promise.resolve({
        repositoryId: "R_1",
        repositoryFullName: `octocat/${request.repository}`,
        issueNodeId: `I_${request.issueNumber}`,
        number: request.issueNumber,
        state: "open",
        updatedAt: "2026-08-30T08:00:00Z",
        viewerCanClose: true,
        viewerCanReopen: false,
      });
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});
afterEach(() => cleanup());

describe("GitHub Issue detail relationship navigation", () => {
  it("opens a cross-repository parent in place and unwinds before leaving the host", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueDetail
          repository={repository}
          issueNumber={7}
          onBack={onBack}
          backLabel="Return to host"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Root issue detail")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Open parent natively" }));
    expect(await screen.findByText("Parent issue detail")).toBeDefined();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_get_repository_issue", {
        owner: "octocat",
        repository: "roadmap",
        issueNumber: 3,
        timelinePage: 1,
      })
    );

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.backToPreviousIssue" })
    );
    expect(await screen.findByText("Root issue detail")).toBeDefined();
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Return to host" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
