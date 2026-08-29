import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubCommentMutation,
  GitHubIssueDetailPage,
  GitHubIssueTimelineItem,
  GitHubPullRequestDetailPage,
  GitHubPullRequestReviewThreadComment,
  GitHubPullRequestReviewThreadPage,
} from "./github-data";
import {
  canSubmitCommentUpdate,
  mutateRepositoryIssueComment,
  mutateRepositoryPullRequestComment,
  mutateRepositoryPullRequestReviewComment,
  syncUpdatedIssueComment,
  syncUpdatedPullRequestComment,
  syncUpdatedPullRequestReviewComment,
} from "./github-comment-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const issueTarget = {
  owner: "octocat",
  repository: "hello-world",
  issueNumber: 7,
};
const pullRequestTarget = {
  owner: "octocat",
  repository: "hello-world",
  pullRequestNumber: 12,
};
const update: GitHubCommentMutation = {
  action: "update",
  commentId: "IC_42",
  expectedUpdatedAt: "2026-08-29T08:01:00Z",
  body: "Updated body",
};
const comment: GitHubIssueTimelineItem = {
  id: "IC_42",
  kind: "comment",
  event: "commented",
  actor: "octocat",
  body: "Current body",
  createdAt: "2026-08-29T08:00:00Z",
  updatedAt: "2026-08-29T08:01:00Z",
  viewerCanUpdate: true,
  viewerCanDelete: true,
  isMinimized: false,
};
const updatedComment = {
  ...comment,
  body: "Updated body",
  updatedAt: "2026-08-29T08:02:00Z",
};

describe("GitHub comment mutations", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("allows clearing an existing comment while rejecting no-op and pending updates", () => {
    expect(canSubmitCommentUpdate("", "Current body", false)).toBe(true);
    expect(canSubmitCommentUpdate("Current body", "Current body", false)).toBe(false);
    expect(canSubmitCommentUpdate("Updated body", "Current body", true)).toBe(false);
  });

  it("sends the exact target and stale revision to each focused command", async () => {
    vi.mocked(invoke).mockResolvedValue(updatedComment);

    await mutateRepositoryIssueComment(issueTarget, update);
    await mutateRepositoryPullRequestComment(pullRequestTarget, update);
    await mutateRepositoryPullRequestReviewComment(pullRequestTarget, update);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_mutate_repository_issue_comment", {
      ...issueTarget,
      mutation: update,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_mutate_repository_pull_request_comment", {
      ...pullRequestTarget,
      mutation: update,
    });
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      "github_mutate_repository_pull_request_review_comment",
      { ...pullRequestTarget, mutation: update }
    );
  });

  it("does not leak UI-only target discriminants into Tauri arguments", async () => {
    vi.mocked(invoke).mockResolvedValue(updatedComment);
    const issueUiTarget = { kind: "issue" as const, ...issueTarget };
    const pullRequestUiTarget = { kind: "pullRequest" as const, ...pullRequestTarget };

    await mutateRepositoryIssueComment(issueUiTarget, update);
    await mutateRepositoryPullRequestComment(pullRequestUiTarget, update);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_mutate_repository_issue_comment", {
      ...issueTarget,
      mutation: update,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_mutate_repository_pull_request_comment", {
      ...pullRequestTarget,
      mutation: update,
    });
  });

  it("replaces an updated Issue comment across cached timeline pages", () => {
    const queryClient = new QueryClient();
    const key = githubQueryKeys.issueDetail({ ...issueTarget, timelinePage: 2 });
    queryClient.setQueryData<GitHubIssueDetailPage>(key, {
      issue: {
        id: 7,
        number: 7,
        title: "Issue",
        url: "https://github.com/octocat/hello-world/issues/7",
        state: "open",
        author: "octocat",
        assignees: [],
        labels: [],
        locked: false,
        comments: 1,
        createdAt: "2026-08-29T08:00:00Z",
        updatedAt: "2026-08-29T08:00:00Z",
      },
      timeline: [comment],
      timelinePage: 2,
      timelineHasPrevious: true,
      timelineHasMore: false,
    });

    syncUpdatedIssueComment(queryClient, issueTarget, updatedComment);

    expect(queryClient.getQueryData<GitHubIssueDetailPage>(key)?.timeline[0]).toEqual(
      updatedComment
    );
  });

  it("replaces an updated pull request Conversation comment", () => {
    const queryClient = new QueryClient();
    const key = githubQueryKeys.pullRequestDetail({
      ...pullRequestTarget,
      timelinePage: 1,
    });
    queryClient.setQueryData<GitHubPullRequestDetailPage>(key, {
      pullRequest: {
        id: 12,
        number: 12,
        title: "Pull request",
        url: "https://github.com/octocat/hello-world/pull/12",
        state: "open",
        draft: false,
        merged: false,
        author: "octocat",
        assignees: [],
        requestedReviewers: [],
        requestedTeams: [],
        labels: [],
        locked: false,
        headRef: "feature",
        headSha: "abc1234",
        baseRef: "main",
        additions: 1,
        deletions: 0,
        changedFiles: 1,
        commits: 1,
        comments: 1,
        reviewComments: 0,
      },
      timeline: [comment],
      reviews: [],
      reviewsHaveMore: false,
      timelinePage: 1,
      timelineHasPrevious: false,
      timelineHasMore: false,
    });

    syncUpdatedPullRequestComment(queryClient, pullRequestTarget, updatedComment);

    expect(queryClient.getQueryData<GitHubPullRequestDetailPage>(key)?.timeline[0]).toEqual(
      updatedComment
    );
  });

  it("replaces a submitted review comment without changing thread state", () => {
    const queryClient = new QueryClient();
    const key = githubQueryKeys.pullRequestReviewThreads(pullRequestTarget);
    const reviewComment: GitHubPullRequestReviewThreadComment = {
      id: "PRRC_92",
      author: "reviewer",
      body: "Current review body",
      url: "https://github.com/octocat/hello-world/pull/12#discussion_r92",
      createdAt: "2026-08-29T08:00:00Z",
      updatedAt: "2026-08-29T08:01:00Z",
      pending: false,
      viewerCanUpdate: true,
      viewerCanDelete: true,
      isMinimized: false,
      outdated: false,
    };
    const page: GitHubPullRequestReviewThreadPage = {
      threads: [
        {
          id: "PRRT_1",
          path: "src/main.ts",
          side: "right",
          subjectType: "line",
          isResolved: true,
          isOutdated: false,
          isCollapsed: true,
          viewerCanReply: true,
          viewerCanResolve: false,
          viewerCanUnresolve: true,
          comments: [reviewComment],
          commentsHaveMore: false,
        },
      ],
      hasMore: false,
    };
    queryClient.setQueryData(key, { pages: [page], pageParams: [null] });
    const updatedReviewComment = {
      ...reviewComment,
      body: "Updated review body",
      updatedAt: "2026-08-29T08:02:00Z",
    };

    syncUpdatedPullRequestReviewComment(queryClient, pullRequestTarget, updatedReviewComment);

    const cached = queryClient.getQueryData<{
      pages: GitHubPullRequestReviewThreadPage[];
    }>(key);
    expect(cached?.pages[0].threads[0].isResolved).toBe(true);
    expect(cached?.pages[0].threads[0].comments[0]).toEqual(updatedReviewComment);
  });
});
