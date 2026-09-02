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
  invalidateRepositoryIssue,
  issueStateMutationInput,
  syncCreatedIssue,
  syncCreatedIssueComment,
  syncIssueLockedState,
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
  reactionSubject: { id: "I_2", kind: "issue" },
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
    await updateRepositoryIssueState(
      target,
      issueStateMutationInput(issue, {
        desiredState: "closed",
        closeReason: "notPlanned",
      })
    );

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
      mutation: {
        desiredState: "closed",
        closeReason: "notPlanned",
        expected: {
          issueId: issue.id,
          issueNodeId: issue.reactionSubject.id,
          state: "open",
          stateReason: null,
          updatedAt: issue.updatedAt,
        },
      },
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

  it("syncs the lock state across Issue detail, repository, and inbox caches", () => {
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
      scope: "authored",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    queryClient.setQueryData<GitHubIssueDetailPage>(detailKey, {
      issue,
      timeline: [],
      timelinePage: 1,
      timelineHasPrevious: false,
      timelineHasMore: false,
    });
    queryClient.setQueryData<GitHubIssuePage>(listKey, {
      issues: [issue],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssueInboxPage>(inboxKey, {
      issues: [summary],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });

    syncIssueLockedState(queryClient, target, true);

    expect(queryClient.getQueryData<GitHubIssueDetailPage>(detailKey)?.issue.locked).toBe(true);
    expect(queryClient.getQueryData<GitHubIssuePage>(listKey)?.issues[0].locked).toBe(true);
    expect(queryClient.getQueryData<GitHubIssueInboxPage>(inboxKey)?.issues[0].issue.locked).toBe(
      true
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
    queryClient.setQueryData<GitHubIssuePage>(closedListKey, {
      issues: [],
      totalCount: 0,
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
      issues: [],
      totalCount: 0,
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

  it("bounds updated destination pages and invalidates destinations whose order is not exact", () => {
    const queryClient = new QueryClient();
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
    const closedUpdatedListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const closedUpdatedListSecondKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      sort: "updated",
      page: 2,
    });
    const closedCreatedListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      sort: "created",
      page: 1,
    });
    const openInboxKey = githubQueryKeys.issueInbox({
      scope: "authored",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    const closedUpdatedInboxKey = githubQueryKeys.issueInbox({
      scope: "authored",
      state: "closed",
      query: "",
      sort: "updated",
      page: 1,
    });
    const closedUpdatedInboxSecondKey = githubQueryKeys.issueInbox({
      scope: "authored",
      state: "closed",
      query: "",
      sort: "updated",
      page: 2,
    });
    const closedCommentsInboxKey = githubQueryKeys.issueInbox({
      scope: "authored",
      state: "closed",
      query: "",
      sort: "comments",
      page: 1,
    });
    const existingIssues = Array.from({ length: 30 }, (_, index) => ({
      ...issue,
      id: 100 + index,
      number: 100 + index,
      reactionSubject: { id: `I_${100 + index}`, kind: "issue" as const },
      url: `https://github.com/octocat/hello-world/issues/${100 + index}`,
      state: "closed" as const,
      stateReason: "completed",
    }));
    const existingSummaries = existingIssues.map((existingIssue) => ({
      ...summary,
      issue: existingIssue,
    }));
    const closedIssue = { ...issue, state: "closed" as const, stateReason: "completed" };
    const secondPageIssue = {
      ...existingIssues[0],
      id: 200,
      number: 200,
      reactionSubject: { id: "I_200", kind: "issue" as const },
      url: "https://github.com/octocat/hello-world/issues/200",
    };
    queryClient.setQueryData<GitHubIssuePage>(openListKey, {
      issues: [issue],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssuePage>(closedUpdatedListKey, {
      issues: existingIssues,
      totalCount: 30,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssuePage>(closedUpdatedListSecondKey, {
      issues: [closedIssue, secondPageIssue],
      totalCount: 31,
      page: 2,
      hasPrevious: true,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssuePage>(closedCreatedListKey, {
      issues: [],
      totalCount: 0,
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
    queryClient.setQueryData<GitHubIssueInboxPage>(closedUpdatedInboxKey, {
      issues: existingSummaries,
      totalCount: 30,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssueInboxPage>(closedUpdatedInboxSecondKey, {
      issues: [
        { ...summary, issue: closedIssue },
        { ...summary, issue: secondPageIssue },
      ],
      totalCount: 31,
      page: 2,
      hasPrevious: true,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssueInboxPage>(closedCommentsInboxKey, {
      issues: [],
      totalCount: 0,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    syncUpdatedIssue(queryClient, target, closedIssue);

    expect(queryClient.getQueryData<GitHubIssuePage>(closedUpdatedListKey)).toMatchObject({
      totalCount: 31,
      hasMore: true,
    });
    expect(queryClient.getQueryData<GitHubIssuePage>(closedUpdatedListKey)?.issues).toHaveLength(
      30
    );
    expect(queryClient.getQueryData<GitHubIssuePage>(closedUpdatedListKey)?.issues[0]).toEqual(
      closedIssue
    );
    expect(
      queryClient
        .getQueryData<GitHubIssuePage>(closedUpdatedListSecondKey)
        ?.issues.some((item) => item.number === target.issueNumber)
    ).toBe(false);
    expect(queryClient.getQueryData<GitHubIssuePage>(closedUpdatedListSecondKey)?.totalCount).toBe(
      31
    );
    expect(queryClient.getQueryState(closedUpdatedListSecondKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(closedCreatedListKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData<GitHubIssuePage>(closedCreatedListKey)?.issues).toEqual([]);
    expect(queryClient.getQueryData<GitHubIssueInboxPage>(closedUpdatedInboxKey)).toMatchObject({
      totalCount: 31,
      hasMore: true,
    });
    expect(
      queryClient.getQueryData<GitHubIssueInboxPage>(closedUpdatedInboxKey)?.issues
    ).toHaveLength(30);
    expect(
      queryClient.getQueryData<GitHubIssueInboxPage>(closedUpdatedInboxKey)?.issues[0].issue
    ).toEqual(closedIssue);
    expect(
      queryClient
        .getQueryData<GitHubIssueInboxPage>(closedUpdatedInboxSecondKey)
        ?.issues.some((item) => item.issue.number === target.issueNumber)
    ).toBe(false);
    expect(
      queryClient.getQueryData<GitHubIssueInboxPage>(closedUpdatedInboxSecondKey)?.totalCount
    ).toBe(31);
    expect(queryClient.getQueryState(closedUpdatedInboxSecondKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(closedCommentsInboxKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData<GitHubIssueInboxPage>(closedCommentsInboxKey)?.issues).toEqual(
      []
    );
  });

  it("keeps closed Issue lists scoped to their selected close reason", () => {
    const queryClient = new QueryClient();
    const completedListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      closeReason: "completed",
      sort: "updated",
      page: 1,
    });
    const notPlannedListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      closeReason: "notPlanned",
      sort: "updated",
      page: 1,
    });
    const closedIssue = { ...issue, state: "closed" as const, stateReason: "completed" };
    for (const key of [completedListKey, notPlannedListKey]) {
      queryClient.setQueryData<GitHubIssuePage>(key, {
        issues: [],
        totalCount: 0,
        page: 1,
        hasPrevious: false,
        hasMore: false,
      });
    }

    syncUpdatedIssue(queryClient, target, closedIssue);

    expect(queryClient.getQueryData<GitHubIssuePage>(completedListKey)?.issues).toEqual([
      closedIssue,
    ]);
    expect(queryClient.getQueryData<GitHubIssuePage>(notPlannedListKey)?.issues).toEqual([]);
    expect(queryClient.getQueryState(notPlannedListKey)?.isInvalidated).toBe(true);
  });

  it("moves an Issue between close-reason caches when its reason changes", () => {
    const queryClient = new QueryClient();
    const completedListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      closeReason: "completed",
      sort: "updated",
      page: 1,
    });
    const notPlannedListKey = githubQueryKeys.issues({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      assignment: "all",
      query: "",
      label: "",
      closeReason: "notPlanned",
      sort: "updated",
      page: 1,
    });
    const completedIssue = { ...issue, state: "closed" as const, stateReason: "completed" };
    const notPlannedIssue = { ...completedIssue, stateReason: "notPlanned" };
    queryClient.setQueryData<GitHubIssuePage>(completedListKey, {
      issues: [completedIssue],
      totalCount: 1,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });
    queryClient.setQueryData<GitHubIssuePage>(notPlannedListKey, {
      issues: [],
      totalCount: 0,
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });

    syncUpdatedIssue(queryClient, target, notPlannedIssue);

    expect(queryClient.getQueryData<GitHubIssuePage>(completedListKey)?.issues).toEqual([]);
    expect(queryClient.getQueryData<GitHubIssuePage>(completedListKey)?.totalCount).toBe(0);
    expect(queryClient.getQueryState(completedListKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData<GitHubIssuePage>(notPlannedListKey)?.issues).toEqual([
      notPlannedIssue,
    ]);
  });

  it("invalidates only Issue detail, list, and inbox roots", async () => {
    const queryClient = new QueryClient();
    const affected = [
      githubQueryKeys.issueDetail({ ...target, timelinePage: 1 }),
      githubQueryKeys.issueDetail({ ...target, timelinePage: 2 }),
      githubQueryKeys.issues({
        owner: target.owner,
        repository: target.repository,
        state: "open" as const,
        assignment: "all" as const,
        query: "",
        label: "",
        sort: "updated" as const,
        page: 1,
      }),
      githubQueryKeys.issueInbox({
        scope: "authored" as const,
        state: "open" as const,
        query: "",
        sort: "updated" as const,
        page: 1,
      }),
    ];
    const untouched = [
      githubQueryKeys.pullRequestDetail({
        owner: target.owner,
        repository: target.repository,
        pullRequestNumber: 7,
        timelinePage: 1,
      }),
      githubQueryKeys.issueLabels(target),
      githubQueryKeys.projects({ state: "open", query: "", sort: "updated" }),
      githubQueryKeys.notifications({ participating: false, page: 1 }),
      githubQueryKeys.commitComments({
        owner: target.owner,
        repository: target.repository,
        commitSha: "a".repeat(40),
      }),
    ];
    for (const key of [...affected, ...untouched]) queryClient.setQueryData(key, { cached: true });

    await invalidateRepositoryIssue(queryClient, target);

    for (const key of affected) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of untouched) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
  });
});
