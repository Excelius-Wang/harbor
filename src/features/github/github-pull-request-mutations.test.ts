import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubIssueTimelineItem,
  GitHubPendingPullRequestReview,
  GitHubPullRequest,
  GitHubPullRequestDetailPage,
  GitHubPullRequestPage,
  GitHubPullRequestReview,
  GitHubPullRequestReviewThread,
  GitHubPullRequestReviewThreadComment,
  GitHubPullRequestSummary,
} from "./github-data";
import {
  createRepositoryPullRequest,
  createRepositoryPullRequestComment,
  createRepositoryPullRequestReview,
  deletePendingRepositoryPullRequestReview,
  deletePendingRepositoryPullRequestReviewComment,
  dequeueRepositoryPullRequest,
  disableRepositoryPullRequestAutoMerge,
  enableRepositoryPullRequestAutoMerge,
  enqueueRepositoryPullRequest,
  mergeRepositoryPullRequest,
  invalidatePullRequestAfterBranchUpdate,
  removeRepositoryPullRequestReviewers,
  replyToPullRequestReviewThread,
  requestRepositoryPullRequestReviewers,
  resolvePullRequestReviewThread,
  savePendingRepositoryPullRequestReview,
  savePendingRepositoryPullRequestReviewComment,
  syncCreatedPullRequest,
  syncCreatedPullRequestComment,
  syncCreatedPullRequestReview,
  syncPendingPullRequestReview,
  syncPullRequestLockedState,
  syncPullRequestReviewThreadReply,
  syncPullRequestReviewThreadState,
  syncUpdatedPullRequest,
  submitPendingRepositoryPullRequestReview,
  unresolvePullRequestReviewThread,
  updateRepositoryPullRequest,
  updateRepositoryPullRequestBranch,
  updateRepositoryPullRequestDraftState,
  updateRepositoryPullRequestMetadata,
  updateRepositoryPullRequestState,
} from "./github-pull-request-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = {
  owner: "octocat",
  repository: "hello-world",
  pullRequestNumber: 12,
};

const pullRequest: GitHubPullRequest = {
  id: 3,
  number: 12,
  title: "Ship the PR workspace",
  body: "Pull request body",
  url: "https://github.com/octocat/hello-world/pull/12",
  state: "open",
  draft: false,
  merged: false,
  mergeable: true,
  mergeableState: "clean",
  author: "octocat",
  assignees: [],
  requestedReviewers: [],
  requestedTeams: [],
  labels: [],
  locked: false,
  headRef: "feature/pr-workspace",
  headSha: "abc1234",
  baseRef: "main",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  commits: 1,
  comments: 0,
  reviewComments: 0,
};

const summary: GitHubPullRequestSummary = {
  id: pullRequest.id,
  number: pullRequest.number,
  title: pullRequest.title,
  body: pullRequest.body,
  url: pullRequest.url,
  state: pullRequest.state,
  draft: pullRequest.draft,
  merged: pullRequest.merged,
  repository: {
    owner: target.owner,
    name: target.repository,
    fullName: "octocat/hello-world",
    url: "https://github.com/octocat/hello-world",
  },
  author: pullRequest.author,
  labels: pullRequest.labels,
  comments: pullRequest.comments,
};

const comment: GitHubIssueTimelineItem = {
  id: "IC_85",
  kind: "comment",
  event: "commented",
  actor: "octocat",
  body: "Ready for another look.",
  viewerCanUpdate: true,
  viewerCanDelete: true,
  isMinimized: false,
};

const review: GitHubPullRequestReview = {
  id: 86,
  author: "hubot",
  authorAvatarUrl: "https://github.com/hubot.png",
  authorAssociation: "collaborator",
  state: "changesRequested",
  body: "Please add a regression test.",
  url: "https://github.com/octocat/hello-world/pull/12#pullrequestreview-86",
  commitId: pullRequest.headSha,
  submittedAt: "2026-08-26T12:00:00Z",
};

const pendingReview: GitHubPendingPullRequestReview = {
  id: 87,
  nodeId: "PRR_87",
  body: "Please cover the edge case.",
  commitId: pullRequest.headSha,
  comments: [
    {
      id: "PRRC_701",
      databaseId: 701,
      path: "src/review.ts",
      line: 42,
      side: "right",
      startLine: 40,
      startSide: "right",
      body: "Please cover this branch.",
    },
  ],
  uneditableCommentCount: 0,
};

const threadComment: GitHubPullRequestReviewThreadComment = {
  id: "PRRC_2",
  databaseId: 92,
  author: "octocat",
  authorAssociation: "OWNER",
  body: "Covered by the new regression test.",
  url: "https://github.com/octocat/hello-world/pull/12#discussion_r92",
  createdAt: "2026-08-27T08:00:00Z",
  updatedAt: "2026-08-27T08:00:00Z",
  pending: false,
  viewerCanUpdate: true,
  viewerCanDelete: true,
  isMinimized: false,
  outdated: false,
};

const reviewThread: GitHubPullRequestReviewThread = {
  id: "PRRT_1",
  path: "src/review.ts",
  line: 42,
  side: "right",
  subjectType: "line",
  isResolved: false,
  isOutdated: false,
  isCollapsed: false,
  viewerCanReply: true,
  viewerCanResolve: true,
  viewerCanUnresolve: false,
  comments: [],
  commentsHaveMore: false,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

function detailPage(value: GitHubPullRequest = pullRequest): GitHubPullRequestDetailPage {
  return {
    pullRequest: value,
    timeline: [],
    reviews: [],
    reviewsHaveMore: false,
    timelinePage: 1,
    timelineHasPrevious: false,
    timelineHasMore: false,
  };
}

function listPage(value: GitHubPullRequestSummary = summary): GitHubPullRequestPage {
  return {
    pullRequests: [value],
    totalCount: 1,
    page: 1,
    hasPrevious: false,
    hasMore: false,
  };
}

describe("GitHub pull request mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("syncs the lock state across pull request detail pages", () => {
    const queryClient = createQueryClient();
    const firstKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 1 });
    const secondKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 2 });
    queryClient.setQueryData(firstKey, detailPage());
    queryClient.setQueryData(secondKey, {
      ...detailPage(),
      timelinePage: 2,
      timelineHasPrevious: true,
    });

    syncPullRequestLockedState(queryClient, target, true);

    expect(
      queryClient.getQueryData<GitHubPullRequestDetailPage>(firstKey)?.pullRequest.locked
    ).toBe(true);
    expect(
      queryClient.getQueryData<GitHubPullRequestDetailPage>(secondKey)?.pullRequest.locked
    ).toBe(true);
  });

  it("creates a pull request with exact branch, content, and draft arguments", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...pullRequest, draft: true });

    const created = await createRepositoryPullRequest(
      { owner: target.owner, repository: target.repository },
      {
        base: "main",
        head: "feature/pr-workspace",
        title: "Ship the PR workspace",
        body: "Pull request body",
        draft: true,
      }
    );

    expect(created).toEqual({ ...pullRequest, draft: true });
    expect(invoke).toHaveBeenCalledWith("github_create_repository_pull_request", {
      owner: "octocat",
      repository: "hello-world",
      base: "main",
      head: "feature/pr-workspace",
      title: "Ship the PR workspace",
      body: "Pull request body",
      draft: true,
    });
  });

  it("primes the first conversation page for a newly created pull request", () => {
    const queryClient = createQueryClient();
    const creationTarget = { owner: target.owner, repository: target.repository };

    syncCreatedPullRequest(queryClient, creationTarget, pullRequest);

    expect(
      queryClient.getQueryData<GitHubPullRequestDetailPage>(
        githubQueryKeys.pullRequestDetail({
          ...creationTarget,
          pullRequestNumber: pullRequest.number,
          timelinePage: 1,
        })
      )
    ).toEqual({
      pullRequest,
      timeline: [],
      reviews: [],
      reviewsHaveMore: false,
      timelinePage: 1,
      timelineHasPrevious: false,
      timelineHasMore: false,
    });
  });

  it("invokes the focused Tauri commands with typed pull request targets", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(pullRequest)
      .mockResolvedValueOnce({ ...pullRequest, state: "closed", merged: true })
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce(threadComment)
      .mockResolvedValueOnce({ ...reviewThread, isResolved: true })
      .mockResolvedValueOnce(reviewThread);

    await updateRepositoryPullRequest(target, "Updated title", "Updated body");
    await mergeRepositoryPullRequest(target, {
      headSha: pullRequest.headSha,
      method: "squash",
      commitTitle: "Ship the PR workspace (#12)",
      commitMessage: "Keep the desktop flow focused.",
    });
    await createRepositoryPullRequestComment(target, "Ready for another look.");
    await createRepositoryPullRequestReview(
      target,
      pullRequest.headSha,
      "Please add a regression test.",
      "requestChanges",
      [
        {
          path: "src/review.ts",
          line: 42,
          side: "right",
          startLine: 40,
          startSide: "right",
          body: "Please cover this branch.",
        },
      ]
    );
    await replyToPullRequestReviewThread("PRRT_1", "Covered by the new regression test.");
    await resolvePullRequestReviewThread("PRRT_1");
    await unresolvePullRequestReviewThread("PRRT_1");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_update_repository_pull_request", {
      ...target,
      title: "Updated title",
      body: "Updated body",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_merge_repository_pull_request", {
      ...target,
      headSha: pullRequest.headSha,
      method: "squash",
      commitTitle: "Ship the PR workspace (#12)",
      commitMessage: "Keep the desktop flow focused.",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_create_repository_pull_request_comment", {
      ...target,
      body: "Ready for another look.",
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_create_repository_pull_request_review", {
      ...target,
      commitId: pullRequest.headSha,
      body: "Please add a regression test.",
      action: "requestChanges",
      comments: [
        {
          path: "src/review.ts",
          line: 42,
          side: "right",
          startLine: 40,
          startSide: "right",
          body: "Please cover this branch.",
        },
      ],
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "github_reply_to_pull_request_review_thread", {
      threadId: "PRRT_1",
      body: "Covered by the new regression test.",
    });
    expect(invoke).toHaveBeenNthCalledWith(6, "github_resolve_pull_request_review_thread", {
      threadId: "PRRT_1",
    });
    expect(invoke).toHaveBeenNthCalledWith(7, "github_unresolve_pull_request_review_thread", {
      threadId: "PRRT_1",
    });
  });

  it("updates pull request state through its focused Tauri command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      ...pullRequest,
      state: "closed",
      closedAt: "2026-08-27T09:00:00Z",
    });

    await updateRepositoryPullRequestState(target, "closed");

    expect(invoke).toHaveBeenCalledWith("github_update_repository_pull_request_state", {
      ...target,
      pullRequestState: "closed",
    });
  });

  it("updates pull request draft state through its focused Tauri command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...pullRequest, draft: true });

    await updateRepositoryPullRequestDraftState(target, true);

    expect(invoke).toHaveBeenCalledWith("github_update_repository_pull_request_draft_state", {
      ...target,
      draft: true,
    });
  });

  it("replaces pull request metadata through the shared issue coordinates", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      ...pullRequest,
      assignees: ["hubot"],
      labels: [{ name: "bug", color: "d73a4a" }],
      milestone: "Milestone 3",
      milestoneNumber: 3,
    });

    await updateRepositoryPullRequestMetadata(target, {
      assignees: ["hubot"],
      labels: ["bug"],
      milestoneNumber: 3,
    });

    expect(invoke).toHaveBeenCalledWith("github_update_repository_pull_request_metadata", {
      ...target,
      assignees: ["hubot"],
      labels: ["bug"],
      milestoneNumber: 3,
    });
  });

  it("requests and removes users or teams through GitHub review-request commands", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        ...pullRequest,
        requestedReviewers: ["hubot"],
        requestedTeams: [{ name: "Core maintainers", slug: "core-maintainers" }],
      })
      .mockResolvedValueOnce(pullRequest);

    await requestRepositoryPullRequestReviewers(target, {
      reviewers: ["hubot"],
      teamReviewers: ["core-maintainers"],
    });
    await removeRepositoryPullRequestReviewers(target, {
      reviewers: [],
      teamReviewers: ["core-maintainers"],
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "github_request_repository_pull_request_reviewers", {
      ...target,
      reviewers: ["hubot"],
      teamReviewers: ["core-maintainers"],
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_remove_repository_pull_request_reviewers", {
      ...target,
      reviewers: [],
      teamReviewers: ["core-maintainers"],
    });
  });

  it("uses the server-side pending review lifecycle with exact GitHub coordinates", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(pendingReview)
      .mockResolvedValueOnce(pendingReview)
      .mockResolvedValueOnce({ ...pendingReview, comments: [] })
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce(undefined);

    await savePendingRepositoryPullRequestReview(target, {
      reviewId: pendingReview.id,
      commitId: pullRequest.headSha,
      body: pendingReview.body,
    });
    await savePendingRepositoryPullRequestReviewComment(target, {
      reviewId: pendingReview.id,
      commitId: pullRequest.headSha,
      commentId: 701,
      comment: {
        path: "src/review.ts",
        line: 42,
        side: "right",
        startLine: 40,
        startSide: "right",
        body: "Please cover this branch.",
      },
    });
    await deletePendingRepositoryPullRequestReviewComment(target, pendingReview.id, 701);
    await submitPendingRepositoryPullRequestReview(
      target,
      pendingReview.id,
      pendingReview.body,
      "comment"
    );
    await deletePendingRepositoryPullRequestReview(target, pendingReview.id);

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      "github_save_pending_repository_pull_request_review",
      {
        ...target,
        reviewId: 87,
        commitId: "abc1234",
        body: "Please cover the edge case.",
      }
    );
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "github_save_pending_repository_pull_request_review_comment",
      {
        ...target,
        reviewId: 87,
        commitId: "abc1234",
        commentId: 701,
        comment: {
          path: "src/review.ts",
          line: 42,
          side: "right",
          startLine: 40,
          startSide: "right",
          body: "Please cover this branch.",
        },
      }
    );
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      "github_delete_pending_repository_pull_request_review_comment",
      { ...target, reviewId: 87, commentId: 701 }
    );
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      "github_submit_pending_repository_pull_request_review",
      {
        ...target,
        reviewId: 87,
        body: "Please cover the edge case.",
        action: "comment",
      }
    );
    expect(invoke).toHaveBeenNthCalledWith(
      5,
      "github_delete_pending_repository_pull_request_review",
      { ...target, reviewId: 87 }
    );
  });

  it("synchronizes the authoritative pending review in its focused cache", () => {
    const queryClient = createQueryClient();
    const key = githubQueryKeys.pendingPullRequestReview(target);

    syncPendingPullRequestReview(queryClient, target, pendingReview);
    expect(queryClient.getQueryData(key)).toEqual(pendingReview);

    syncPendingPullRequestReview(queryClient, target, null);
    expect(queryClient.getQueryData(key)).toBeNull();
  });

  it("omits empty optional merge commit fields and keeps the head revision guard", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ...pullRequest, state: "closed", merged: true });

    await mergeRepositoryPullRequest(target, {
      headSha: pullRequest.headSha,
      method: "rebase",
    });

    expect(invoke).toHaveBeenCalledWith("github_merge_repository_pull_request", {
      ...target,
      headSha: pullRequest.headSha,
      method: "rebase",
    });
  });

  it("starts a branch update with the displayed head revision guard", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      message: "Updating pull request branch.",
      url: pullRequest.url,
    });

    await updateRepositoryPullRequestBranch(target, pullRequest.headSha);

    expect(invoke).toHaveBeenCalledWith("github_update_repository_pull_request_branch", {
      ...target,
      expectedHeadSha: pullRequest.headSha,
    });
  });

  it("enables and disables auto-merge through focused Tauri commands", async () => {
    vi.mocked(invoke).mockResolvedValue({
      state: "enabled",
      headSha: pullRequest.headSha,
      allowedMergeMethods: ["squash"],
      mergeMethod: "squash",
      viewerCanEnable: false,
      viewerCanDisable: true,
    });

    await enableRepositoryPullRequestAutoMerge(target, pullRequest.headSha, "squash");
    await disableRepositoryPullRequestAutoMerge(target);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_enable_repository_pull_request_auto_merge", {
      ...target,
      expectedHeadSha: pullRequest.headSha,
      mergeMethod: "squash",
    });
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "github_disable_repository_pull_request_auto_merge",
      target
    );
  });

  it("adds and removes a pull request through focused merge queue commands", async () => {
    vi.mocked(invoke).mockResolvedValue({
      state: "queued",
      headSha: pullRequest.headSha,
      baseRef: pullRequest.baseRef,
      viewerCanEnqueue: false,
      viewerCanDequeue: true,
    });

    await enqueueRepositoryPullRequest(target, pullRequest.headSha);
    await dequeueRepositoryPullRequest(target);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_enqueue_repository_pull_request", {
      ...target,
      expectedHeadSha: pullRequest.headSha,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_dequeue_repository_pull_request", target);
  });

  it("invalidates every head-dependent pull request cache after branch reconciliation", async () => {
    const queryClient = createQueryClient();
    const detailKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 1 });
    const commitsKey = githubQueryKeys.pullRequestCommits({ ...target, page: 1 });
    const filesKey = githubQueryKeys.pullRequestFiles({ ...target, page: 1 });
    const statusKey = githubQueryKeys.pullRequestBranchUpdateStatus(target);
    const checksKey = githubQueryKeys.checks({
      owner: target.owner,
      repository: target.repository,
      reference: pullRequest.headSha,
      page: 1,
    });
    const repositoryKey = githubQueryKeys.pullRequests({
      owner: target.owner,
      repository: target.repository,
      state: "open",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const inboxKey = githubQueryKeys.pullRequestInbox({
      scope: "authored",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    for (const key of [
      detailKey,
      commitsKey,
      filesKey,
      statusKey,
      checksKey,
      repositoryKey,
      inboxKey,
    ]) {
      queryClient.setQueryData(key, { cached: true });
    }

    await invalidatePullRequestAfterBranchUpdate(queryClient, target);

    for (const key of [
      detailKey,
      commitsKey,
      filesKey,
      statusKey,
      checksKey,
      repositoryKey,
      inboxKey,
    ]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it("synchronizes edited content into conversation, repository, and inbox caches", () => {
    const queryClient = createQueryClient();
    const detailKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 1 });
    const repositoryKey = githubQueryKeys.pullRequests({
      owner: target.owner,
      repository: target.repository,
      state: "open",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const inboxKey = githubQueryKeys.pullRequestInbox({
      scope: "authored",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    queryClient.setQueryData(detailKey, detailPage());
    queryClient.setQueryData(repositoryKey, listPage());
    queryClient.setQueryData(inboxKey, listPage());
    const updated = {
      ...pullRequest,
      title: "Updated title",
      body: "Updated body",
      assignees: ["hubot"],
      labels: [{ name: "bug", color: "d73a4a" }],
      milestone: "Milestone 3",
      milestoneNumber: 3,
    };

    syncUpdatedPullRequest(queryClient, target, updated);

    expect(
      queryClient.getQueryData<GitHubPullRequestDetailPage>(detailKey)?.pullRequest.title
    ).toBe("Updated title");
    expect(queryClient.getQueryData<GitHubPullRequestDetailPage>(detailKey)?.pullRequest).toEqual(
      expect.objectContaining({
        assignees: ["hubot"],
        labels: [{ name: "bug", color: "d73a4a" }],
        milestone: "Milestone 3",
        milestoneNumber: 3,
      })
    );
    expect(
      queryClient.getQueryData<GitHubPullRequestPage>(repositoryKey)?.pullRequests[0].body
    ).toBe("Updated body");
    expect(queryClient.getQueryData<GitHubPullRequestPage>(inboxKey)?.pullRequests[0].title).toBe(
      "Updated title"
    );
    expect(
      queryClient.getQueryData<GitHubPullRequestPage>(repositoryKey)?.pullRequests[0].labels
    ).toEqual([{ name: "bug", color: "d73a4a" }]);
  });

  it("removes state changes from stale source lists and updates matching cached lists", () => {
    const queryClient = createQueryClient();
    const detailKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 1 });
    const openRepositoryKey = githubQueryKeys.pullRequests({
      owner: target.owner,
      repository: target.repository,
      state: "open",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const closedRepositoryKey = githubQueryKeys.pullRequests({
      owner: target.owner,
      repository: target.repository,
      state: "closed",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const openInboxKey = githubQueryKeys.pullRequestInbox({
      scope: "authored",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    const closedInboxKey = githubQueryKeys.pullRequestInbox({
      scope: "authored",
      state: "closed",
      query: "",
      sort: "updated",
      page: 1,
    });
    queryClient.setQueryData(detailKey, detailPage());
    queryClient.setQueryData(openRepositoryKey, listPage());
    queryClient.setQueryData(closedRepositoryKey, listPage({ ...summary, state: "closed" }));
    queryClient.setQueryData(openInboxKey, listPage());
    queryClient.setQueryData(closedInboxKey, listPage({ ...summary, state: "closed" }));
    const closedPullRequest: GitHubPullRequest = {
      ...pullRequest,
      state: "closed",
      closedAt: "2026-08-27T09:00:00Z",
      updatedAt: "2026-08-27T09:00:00Z",
    };

    syncUpdatedPullRequest(queryClient, target, closedPullRequest);

    expect(
      queryClient.getQueryData<GitHubPullRequestDetailPage>(detailKey)?.pullRequest.state
    ).toBe("closed");
    expect(queryClient.getQueryData<GitHubPullRequestPage>(openRepositoryKey)).toEqual(
      expect.objectContaining({ pullRequests: [], totalCount: 0 })
    );
    expect(queryClient.getQueryData<GitHubPullRequestPage>(openInboxKey)).toEqual(
      expect.objectContaining({ pullRequests: [], totalCount: 0 })
    );
    expect(
      queryClient.getQueryData<GitHubPullRequestPage>(closedRepositoryKey)?.pullRequests[0]
    ).toEqual(expect.objectContaining({ state: "closed", closedAt: "2026-08-27T09:00:00Z" }));
    expect(
      queryClient.getQueryData<GitHubPullRequestPage>(closedInboxKey)?.pullRequests[0]
    ).toEqual(expect.objectContaining({ state: "closed", closedAt: "2026-08-27T09:00:00Z" }));

    syncUpdatedPullRequest(queryClient, target, {
      ...closedPullRequest,
      state: "open",
      closedAt: undefined,
    });

    expect(queryClient.getQueryData<GitHubPullRequestPage>(closedRepositoryKey)).toEqual(
      expect.objectContaining({ pullRequests: [], totalCount: 0 })
    );
    expect(queryClient.getQueryData<GitHubPullRequestPage>(closedInboxKey)).toEqual(
      expect.objectContaining({ pullRequests: [], totalCount: 0 })
    );
  });

  it("synchronizes draft stage changes into detail, repository, and inbox caches", () => {
    const queryClient = createQueryClient();
    const detailKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 1 });
    const repositoryKey = githubQueryKeys.pullRequests({
      owner: target.owner,
      repository: target.repository,
      state: "open",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    const inboxKey = githubQueryKeys.pullRequestInbox({
      scope: "authored",
      state: "open",
      query: "",
      sort: "updated",
      page: 1,
    });
    queryClient.setQueryData(detailKey, detailPage());
    queryClient.setQueryData(repositoryKey, listPage());
    queryClient.setQueryData(inboxKey, listPage());

    syncUpdatedPullRequest(queryClient, target, { ...pullRequest, draft: true });

    expect(
      queryClient.getQueryData<GitHubPullRequestDetailPage>(detailKey)?.pullRequest.draft
    ).toBe(true);
    expect(
      queryClient.getQueryData<GitHubPullRequestPage>(repositoryKey)?.pullRequests[0].draft
    ).toBe(true);
    expect(queryClient.getQueryData<GitHubPullRequestPage>(inboxKey)?.pullRequests[0].draft).toBe(
      true
    );
  });

  it("appends a new comment only to terminal timelines and updates cached counts", () => {
    const queryClient = createQueryClient();
    const terminalKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 1 });
    const earlierKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 2 });
    const repositoryKey = githubQueryKeys.pullRequests({
      owner: target.owner,
      repository: target.repository,
      state: "open",
      query: "",
      label: "",
      sort: "updated",
      page: 1,
    });
    queryClient.setQueryData(terminalKey, detailPage());
    queryClient.setQueryData(earlierKey, {
      ...detailPage(),
      timelinePage: 2,
      timelineHasPrevious: true,
      timelineHasMore: true,
    });
    queryClient.setQueryData(repositoryKey, listPage());

    syncCreatedPullRequestComment(queryClient, target, comment);

    expect(queryClient.getQueryData<GitHubPullRequestDetailPage>(terminalKey)?.timeline).toEqual([
      comment,
    ]);
    expect(queryClient.getQueryData<GitHubPullRequestDetailPage>(earlierKey)?.timeline).toEqual([]);
    expect(
      queryClient.getQueryData<GitHubPullRequestDetailPage>(terminalKey)?.pullRequest.comments
    ).toBe(1);
    expect(
      queryClient.getQueryData<GitHubPullRequestPage>(repositoryKey)?.pullRequests[0].comments
    ).toBe(1);
  });

  it("synchronizes a submitted review into review summaries and the terminal timeline", () => {
    const queryClient = createQueryClient();
    const terminalKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 1 });
    const earlierKey = githubQueryKeys.pullRequestDetail({ ...target, timelinePage: 2 });
    queryClient.setQueryData(terminalKey, detailPage());
    queryClient.setQueryData(earlierKey, {
      ...detailPage(),
      timelinePage: 2,
      timelineHasPrevious: true,
      timelineHasMore: true,
    });

    syncCreatedPullRequestReview(queryClient, target, review);

    const terminal = queryClient.getQueryData<GitHubPullRequestDetailPage>(terminalKey);
    const earlier = queryClient.getQueryData<GitHubPullRequestDetailPage>(earlierKey);
    expect(terminal?.reviews).toEqual([review]);
    expect(terminal?.timeline).toEqual([
      expect.objectContaining({
        id: "review-86",
        event: "reviewed",
        actor: "hubot",
        body: "Please add a regression test.",
        reviewState: "changesRequested",
      }),
    ]);
    expect(earlier?.reviews).toEqual([review]);
    expect(earlier?.timeline).toEqual([]);
  });

  it("updates the matching review thread after a reply and resolution change", () => {
    const queryClient = createQueryClient();
    const key = githubQueryKeys.pullRequestReviewThreads(target);
    queryClient.setQueryData(key, {
      pages: [
        {
          threads: [reviewThread, { ...reviewThread, id: "PRRT_2" }],
          hasMore: false,
        },
      ],
      pageParams: [null],
    });

    syncPullRequestReviewThreadReply(queryClient, target, "PRRT_1", threadComment);
    syncPullRequestReviewThreadReply(queryClient, target, "PRRT_1", threadComment);
    syncPullRequestReviewThreadState(queryClient, target, {
      id: "PRRT_1",
      isResolved: true,
      isCollapsed: true,
      resolvedBy: "octocat",
      viewerCanReply: true,
      viewerCanResolve: false,
      viewerCanUnresolve: true,
    });
    syncPullRequestReviewThreadState(queryClient, target, {
      id: "PRRT_1",
      isResolved: false,
      isCollapsed: false,
      resolvedBy: null,
      viewerCanReply: true,
      viewerCanResolve: true,
      viewerCanUnresolve: false,
    });

    const data = queryClient.getQueryData<{
      pages: Array<{ threads: GitHubPullRequestReviewThread[] }>;
    }>(key);
    expect(data?.pages[0].threads[0]).toEqual(
      expect.objectContaining({
        isResolved: false,
        isCollapsed: false,
        resolvedBy: null,
        comments: [threadComment],
      })
    );
    expect(data?.pages[0].threads[1]).toEqual({ ...reviewThread, id: "PRRT_2" });
  });
});
