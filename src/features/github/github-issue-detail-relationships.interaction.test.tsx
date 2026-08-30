// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueDetail } from "./github-issue-detail";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("./github-readme", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));
vi.mock("./github-reactions-provider", () => ({
  GitHubReactionsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./github-reaction-bar", () => ({ GitHubReactionBar: () => null }));
vi.mock("./github-issue-metadata", () => ({ GitHubIssueMetadata: () => null }));
vi.mock("./github-issue-edit-dialog", () => ({ GitHubIssueEditDialog: () => null }));
vi.mock("./github-comment-form", () => ({ GitHubCommentForm: () => null }));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};
const issue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Root issue detail",
  body: "Persistent issue body",
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

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  let relationshipReads = 0;
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === "github_get_repository_issue") {
      return Promise.resolve({
        issue,
        timeline: [],
        timelinePage: 1,
        timelineHasPrevious: false,
        timelineHasMore: false,
      });
    }
    if (command === "github_get_repository_issue_state_capabilities") {
      return Promise.resolve({
        repositoryId: "R_1",
        repositoryFullName: "octocat/hello-world",
        issueNodeId: "I_7",
        number: 7,
        state: "open",
        updatedAt: issue.updatedAt,
        viewerCanClose: true,
        viewerCanReopen: false,
      });
    }
    if (command === "github_get_repository_issue_relationships") {
      relationshipReads += 1;
      if (relationshipReads === 1) {
        return Promise.reject({ code: "githubPermission", message: "permission changed" });
      }
      return Promise.resolve({
        parent: null,
        subIssues: [],
        page: 1,
        hasPrevious: false,
        hasMore: false,
      });
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});
afterEach(() => cleanup());

describe("GitHub Issue detail relationship failures", () => {
  it("keeps the real Issue body visible while relationship permission retry recovers", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueDetail repository={repository} issueNumber={7} onBack={vi.fn()} />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Persistent issue body")).toBeDefined();
    expect(
      await screen.findByText("workspace.repositories.issueRelationshipsPermissionDenied")
    ).toBeDefined();
    expect(screen.getByText("Persistent issue body")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));

    expect(await screen.findByText("workspace.repositories.noIssueRelationships")).toBeDefined();
    expect(screen.getByText("Persistent issue body")).toBeDefined();
  });
});
