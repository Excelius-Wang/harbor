import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubIssue,
  GitHubIssueDetailPage,
  GitHubIssueInboxPage,
  GitHubIssuePage,
  GitHubIssueSummary,
  GitHubIssueTimelineItem,
} from "./github-data";
import {
  createRepositoryIssue,
  createRepositoryIssueComment,
  syncCreatedIssue,
  syncCreatedIssueComment,
  syncUpdatedIssue,
  updateRepositoryIssue,
  updateRepositoryIssueMetadata,
  updateRepositoryIssueState,
} from "./github-issue-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = {
  owner: "octocat",
  repository: "hello-world",
  issueNumber: 7,
};

const issue: GitHubIssue = {
  id: 2,
  number: 7,
  title: "Keep the example focused",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "open",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 1,
  createdAt: "2026-08-25T08:00:00Z",
  updatedAt: "2026-08-25T08:00:00Z",
};

const comment: GitHubIssueTimelineItem = {
  id: "IC_84",
  kind: "comment",
  event: "commented",
  actor: "octocat",
  body: "Fixed in #41.",
  createdAt: "2026-08-26T10:00:00Z",
  viewerCanUpdate: true,
  viewerCanDelete: true,
  isMinimized: false,
};

const summary: GitHubIssueSummary = {
  issue,
  repository: {
    owner: target.owner,
    name: target.repository,
    fullName: "octocat/hello-world",
    url: "https://github.com/octocat/hello-world",
    defaultBranch: "HEAD",
  },
};

describe("GitHub Issue mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("invokes the focused Tauri commands with typed Issue targets", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ ...issue, number: 8 })
      .mockResolvedValueOnce({ ...issue, title: "Updated title" })
      .mockResolvedValueOnce({
        ...issue,
        assignees: ["hubot"],
        labels: [{ name: "bug", color: "d73a4a" }],
        milestone: "Harbor 0.2",
        milestoneNumber: 3,
      })
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce({
        ...issue,
        state: "closed",
      });

    await createRepositoryIssue(target, "New Issue", "Issue body");
    await updateRepositoryIssue(target, "Updated title", "Updated body");
    await updateRepositoryIssueMetadata(target, {
      labels: ["bug"],
      assignees: ["hubot"],
      milestoneNumber: 3,
    });
    await createRepositoryIssueComment(target, "Fixed in #41.");
    await updateRepositoryIssueState(target, "closed");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_create_repository_issue", {
      owner: target.owner,
      repository: target.repository,
      title: "New Issue",
      body: "Issue body",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_repository_issue", {
      ...target,
      title: "Updated title",
      body: "Updated body",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_update_repository_issue_metadata", {
      ...target,
      labels: ["bug"],
      assignees: ["hubot"],
      milestoneNumber: 3,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_create_repository_issue_comment", {
      ...target,
      body: "Fixed in #41.",
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "github_update_repository_issue_state", {
      ...target,
      issueState: "closed",
    });
  });

  it("primes the first conversation page for a newly created Issue", () => {
    const queryClient = new QueryClient();
    const createdIssue = { ...issue, id: 8, number: 8, title: "New Issue", comments: 0 };
    const detailKey = githubQueryKeys.issueDetail({
      ...target,
      issueNumber: createdIssue.number,
      timelinePage: 1,
    });

    syncCreatedIssue(queryClient, target, createdIssue);

    expect(queryClient.getQueryData<GitHubIssueDetailPage>(detailKey)).toEqual({
      issue: createdIssue,
      timeline: [],
      timelinePage: 1,
      timelineHasPrevious: false,
      timelineHasMore: false,
    });
  });

  it("adds a created comment to the cached final timeline page and updates counts", () => {
    const queryClient = new QueryClient();
    const detailKey = githubQueryKeys.issueDetail({ ...target, timelinePage: 1 });
    const listKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "open",
      assignment: "all",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const inboxKey = githubQueryKeys.issueInbox({
      scope: "assigned",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    const detail: GitHubIssueDetailPage = {
      issue,
      timeline: [],
      timelinePage: 1,
      timelineHasPrevious: false,
      timelineHasMore: false,
    };
    const page: GitHubIssuePage = {
      issues: [issue],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    };
    queryClient.setQueryData(detailKey, detail);
    queryClient.setQueryData(listKey, page);
    queryClient.setQueryData<GitHubIssueInboxPage>(inboxKey, {
      issues: [summary],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });

    syncCreatedIssueComment(queryClient, target, comment);

    expect(queryClient.getQueryData<GitHubIssueDetailPage>(detailKey)?.timeline).toEqual([comment]);
    expect(queryClient.getQueryData<GitHubIssueDetailPage>(detailKey)?.issue.comments).toBe(2);
    expect(queryClient.getQueryData<GitHubIssuePage>(listKey)?.issues[0].comments).toBe(2);
    expect(queryClient.getQueryData<GitHubIssueInboxPage>(inboxKey)?.issues[0].issue.comments).toBe(
      2
    );
  });

  it("syncs state across detail pages, removes stale lists, and updates matching lists", () => {
    const queryClient = new QueryClient();
    const firstKey = githubQueryKeys.issueDetail({ ...target, timelinePage: 1 });
    const secondKey = githubQueryKeys.issueDetail({ ...target, timelinePage: 2 });
    const detail = (timelinePage: number): GitHubIssueDetailPage => ({
      issue,
      timeline: [],
      timelinePage,
      timelineHasPrevious: timelinePage > 1,
      timelineHasMore: timelinePage === 1,
    });
    queryClient.setQueryData(firstKey, detail(1));
    queryClient.setQueryData(secondKey, detail(2));
    const openListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "open",
      assignment: "all",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const closedListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const openInboxKey = githubQueryKeys.issueInbox({
      scope: "authored",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    const closedInboxKey = githubQueryKeys.issueInbox({
      scope: "authored",
      state: "closed",
      query: "",
      sort: "updated",
      page: 1,
    });
    queryClient.setQueryData<GitHubIssuePage>(openListKey, {
      issues: [issue],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    const previouslyClosed = { ...issue, state: "closed" as const, stateReason: "notPlanned" };
    queryClient.setQueryData<GitHubIssuePage>(closedListKey, {
      issues: [previouslyClosed],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssueInboxPage>(openInboxKey, {
      issues: [summary],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssueInboxPage>(closedInboxKey, {
      issues: [{ ...summary, issue: previouslyClosed }],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    const closedIssue = { ...issue, state: "closed" as const, stateReason: "completed" };

    syncUpdatedIssue(queryClient, target, closedIssue);

    expect(queryClient.getQueryData<GitHubIssueDetailPage>(firstKey)?.issue.state).toBe("closed");
    expect(queryClient.getQueryData<GitHubIssueDetailPage>(secondKey)?.issue.stateReason).toBe(
      "completed"
    );
    expect(queryClient.getQueryData<GitHubIssuePage>(openListKey)).toMatchObject({
      issues: [],
      totalCount: 0,
    });
    expect(queryClient.getQueryData<GitHubIssuePage>(closedListKey)?.issues[0]).toEqual(
      closedIssue
    );
    expect(queryClient.getQueryData<GitHubIssueInboxPage>(openInboxKey)).toMatchObject({
      issues: [],
      totalCount: 0,
    });
    expect(queryClient.getQueryData<GitHubIssueInboxPage>(closedInboxKey)?.issues[0].issue).toEqual(
      closedIssue
    );
  });
});
