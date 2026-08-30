import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubIssueTimelineItem,
  GitHubItemMetadataValue,
  GitHubPendingPullRequestReview,
  GitHubPullRequest,
  GitHubPullRequestAutoMergeStatus,
  GitHubPullRequestBranchUpdate,
  GitHubPullRequestDetailPage,
  GitHubPullRequestFileViewState,
  GitHubPullRequestFileViewStateSnapshot,
  GitHubPullRequestFileViewedState,
  GitHubPullRequestMergeMethod,
  GitHubPullRequestMergeQueueStatus,
  GitHubPullRequestMaintainerEditability,
  GitHubPullRequestPage,
  GitHubPullRequestReview,
  GitHubPullRequestReviewPage,
  GitHubPullRequestReviewAction,
  GitHubPullRequestReviewComment,
  GitHubPullRequestReviewThread,
  GitHubPullRequestReviewThreadComment,
  GitHubPullRequestReviewThreadPage,
  GitHubPullRequestReviewThreadState,
  GitHubPullRequestSummary,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

const PULL_REQUEST_REVIEW_PAGE_SIZE = 100;

export type GitHubPullRequestMutationTarget = {
  owner: string;
  repository: string;
  pullRequestNumber: number;
};

export type GitHubPullRequestCreationTarget = {
  owner: string;
  repository: string;
};

export type GitHubPullRequestCreationValue = {
  base: string;
  head: string;
  title: string;
  body: string;
  draft: boolean;
};

export function createRepositoryPullRequest(
  target: GitHubPullRequestCreationTarget,
  value: GitHubPullRequestCreationValue
) {
  return invoke<GitHubPullRequest>("github_create_repository_pull_request", {
    ...target,
    ...value,
  });
}

export function updateRepositoryPullRequest(
  target: GitHubPullRequestMutationTarget,
  title: string,
  body: string
) {
  return invoke<GitHubPullRequest>("github_update_repository_pull_request", {
    owner: target.owner,
    repository: target.repository,
    pullRequestNumber: target.pullRequestNumber,
    title,
    body,
  });
}

export function updateRepositoryPullRequestBase(
  target: GitHubPullRequestMutationTarget,
  value: {
    expectedCurrentBase: string;
    expectedCurrentBaseSha: string;
    expectedHeadSha: string;
    targetBase: string;
    expectedTargetBaseSha: string;
  }
) {
  return invoke<GitHubPullRequest>("github_update_repository_pull_request_base", {
    ...target,
    ...value,
  });
}

export function updateRepositoryPullRequestMaintainerEditability(
  target: GitHubPullRequestMutationTarget,
  status: GitHubPullRequestMaintainerEditability,
  requestedValue: boolean
) {
  if (status.headRepositoryId == null) {
    throw new Error("The pull request head repository is unavailable.");
  }
  return invoke<GitHubPullRequestMaintainerEditability>(
    "github_update_repository_pull_request_maintainer_editability",
    {
      ...target,
      expectedCurrentValue: status.currentValue,
      expectedPullRequestId: status.pullRequestId,
      expectedPullRequestNodeId: status.pullRequestNodeId,
      expectedAuthorId: status.authorId,
      expectedHeadRepositoryId: status.headRepositoryId,
      expectedHeadRef: status.headRef,
      expectedHeadSha: status.headSha,
      expectedWorkflowRisk: status.workflowRisk,
      requestedValue,
    }
  );
}

export function updateRepositoryPullRequestState(
  target: GitHubPullRequestMutationTarget,
  pullRequestState: GitHubPullRequest["state"]
) {
  return invoke<GitHubPullRequest>("github_update_repository_pull_request_state", {
    ...target,
    pullRequestState,
  });
}

export function updateRepositoryPullRequestDraftState(
  target: GitHubPullRequestMutationTarget,
  draft: boolean
) {
  return invoke<GitHubPullRequest>("github_update_repository_pull_request_draft_state", {
    ...target,
    draft,
  });
}

export function updateRepositoryPullRequestMetadata(
  target: GitHubPullRequestMutationTarget,
  value: GitHubItemMetadataValue
) {
  return invoke<GitHubPullRequest>("github_update_repository_pull_request_metadata", {
    ...target,
    labels: value.labels,
    assignees: value.assignees,
    milestoneNumber: value.milestoneNumber,
  });
}

export type GitHubPullRequestReviewerValue = {
  reviewers: string[];
  teamReviewers: string[];
};

export function requestRepositoryPullRequestReviewers(
  target: GitHubPullRequestMutationTarget,
  value: GitHubPullRequestReviewerValue
) {
  return invoke<GitHubPullRequest>("github_request_repository_pull_request_reviewers", {
    ...target,
    ...value,
  });
}

export function removeRepositoryPullRequestReviewers(
  target: GitHubPullRequestMutationTarget,
  value: GitHubPullRequestReviewerValue
) {
  return invoke<GitHubPullRequest>("github_remove_repository_pull_request_reviewers", {
    ...target,
    ...value,
  });
}

export function mergeRepositoryPullRequest(
  target: GitHubPullRequestMutationTarget,
  options: {
    headSha: string;
    method: GitHubPullRequestMergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  }
) {
  return invoke<GitHubPullRequest>("github_merge_repository_pull_request", {
    ...target,
    headSha: options.headSha,
    method: options.method,
    ...(options.commitTitle ? { commitTitle: options.commitTitle } : {}),
    ...(options.commitMessage ? { commitMessage: options.commitMessage } : {}),
  });
}

export function enableRepositoryPullRequestAutoMerge(
  target: GitHubPullRequestMutationTarget,
  expectedHeadSha: string,
  mergeMethod: GitHubPullRequestMergeMethod
) {
  return invoke<GitHubPullRequestAutoMergeStatus>(
    "github_enable_repository_pull_request_auto_merge",
    {
      ...target,
      expectedHeadSha,
      mergeMethod,
    }
  );
}

export function disableRepositoryPullRequestAutoMerge(target: GitHubPullRequestMutationTarget) {
  return invoke<GitHubPullRequestAutoMergeStatus>(
    "github_disable_repository_pull_request_auto_merge",
    target
  );
}

export function enqueueRepositoryPullRequest(
  target: GitHubPullRequestMutationTarget,
  expectedHeadSha: string
) {
  return invoke<GitHubPullRequestMergeQueueStatus>("github_enqueue_repository_pull_request", {
    ...target,
    expectedHeadSha,
  });
}

export function dequeueRepositoryPullRequest(target: GitHubPullRequestMutationTarget) {
  return invoke<GitHubPullRequestMergeQueueStatus>(
    "github_dequeue_repository_pull_request",
    target
  );
}

export function updateRepositoryPullRequestBranch(
  target: GitHubPullRequestMutationTarget,
  expectedHeadSha: string
) {
  return invoke<GitHubPullRequestBranchUpdate>("github_update_repository_pull_request_branch", {
    ...target,
    expectedHeadSha,
  });
}

export function createRepositoryPullRequestComment(
  target: GitHubPullRequestMutationTarget,
  body: string
) {
  return invoke<GitHubIssueTimelineItem>("github_create_repository_pull_request_comment", {
    owner: target.owner,
    repository: target.repository,
    pullRequestNumber: target.pullRequestNumber,
    body,
  });
}

export function createRepositoryPullRequestReview(
  target: GitHubPullRequestMutationTarget,
  commitId: string,
  body: string,
  action: GitHubPullRequestReviewAction,
  comments: GitHubPullRequestReviewComment[] = []
) {
  return invoke<GitHubPullRequestReview>("github_create_repository_pull_request_review", {
    owner: target.owner,
    repository: target.repository,
    pullRequestNumber: target.pullRequestNumber,
    commitId,
    body,
    action,
    comments,
  });
}

export function dismissRepositoryPullRequestReview(
  target: GitHubPullRequestMutationTarget,
  reviewId: number,
  message: string
) {
  return invoke<GitHubPullRequestReview>("github_dismiss_repository_pull_request_review", {
    ...target,
    reviewId,
    message,
  });
}

export function savePendingRepositoryPullRequestReview(
  target: GitHubPullRequestMutationTarget,
  options: { reviewId?: number; commitId: string; body: string }
) {
  return invoke<GitHubPendingPullRequestReview>(
    "github_save_pending_repository_pull_request_review",
    {
      ...target,
      ...(options.reviewId ? { reviewId: options.reviewId } : {}),
      commitId: options.commitId,
      body: options.body,
    }
  );
}

export function savePendingRepositoryPullRequestReviewComment(
  target: GitHubPullRequestMutationTarget,
  options: {
    reviewId?: number;
    commitId: string;
    commentId?: number;
    comment: GitHubPullRequestReviewComment;
  }
) {
  return invoke<GitHubPendingPullRequestReview>(
    "github_save_pending_repository_pull_request_review_comment",
    {
      ...target,
      ...(options.reviewId ? { reviewId: options.reviewId } : {}),
      commitId: options.commitId,
      ...(options.commentId ? { commentId: options.commentId } : {}),
      comment: options.comment,
    }
  );
}

export function deletePendingRepositoryPullRequestReviewComment(
  target: GitHubPullRequestMutationTarget,
  reviewId: number,
  commentId: number
) {
  return invoke<GitHubPendingPullRequestReview>(
    "github_delete_pending_repository_pull_request_review_comment",
    { ...target, reviewId, commentId }
  );
}

export function submitPendingRepositoryPullRequestReview(
  target: GitHubPullRequestMutationTarget,
  reviewId: number,
  body: string,
  action: GitHubPullRequestReviewAction
) {
  return invoke<GitHubPullRequestReview>("github_submit_pending_repository_pull_request_review", {
    ...target,
    reviewId,
    body,
    action,
  });
}

export function deletePendingRepositoryPullRequestReview(
  target: GitHubPullRequestMutationTarget,
  reviewId: number
) {
  return invoke<void>("github_delete_pending_repository_pull_request_review", {
    ...target,
    reviewId,
  });
}

export function replyToPullRequestReviewThread(threadId: string, body: string) {
  return invoke<GitHubPullRequestReviewThreadComment>(
    "github_reply_to_pull_request_review_thread",
    { threadId, body }
  );
}

export function resolvePullRequestReviewThread(threadId: string) {
  return invoke<GitHubPullRequestReviewThreadState>("github_resolve_pull_request_review_thread", {
    threadId,
  });
}

export function unresolvePullRequestReviewThread(threadId: string) {
  return invoke<GitHubPullRequestReviewThreadState>("github_unresolve_pull_request_review_thread", {
    threadId,
  });
}

export function markRepositoryPullRequestFileViewed(pullRequestId: string, path: string) {
  return invoke<GitHubPullRequestFileViewState>("github_mark_repository_pull_request_file_viewed", {
    pullRequestId,
    path,
  });
}

export function unmarkRepositoryPullRequestFileViewed(pullRequestId: string, path: string) {
  return invoke<GitHubPullRequestFileViewState>(
    "github_unmark_repository_pull_request_file_viewed",
    { pullRequestId, path }
  );
}

export async function updatePullRequestFileViewedState(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  pullRequestId: string,
  path: string,
  viewed: boolean
) {
  const updated = await (viewed
    ? markRepositoryPullRequestFileViewed(pullRequestId, path)
    : unmarkRepositoryPullRequestFileViewed(pullRequestId, path));
  syncPullRequestFileViewedState(queryClient, target, updated.path, updated.state);
  return updated;
}

function matchesPullRequest(
  pullRequest: GitHubPullRequestSummary,
  target: GitHubPullRequestMutationTarget
) {
  return (
    pullRequest.number === target.pullRequestNumber &&
    pullRequest.repository.owner === target.owner &&
    pullRequest.repository.name === target.repository
  );
}

function updatePullRequestPages(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  update: (pullRequest: GitHubPullRequestSummary) => GitHubPullRequestSummary,
  nextState?: GitHubPullRequest["state"]
) {
  const entries = [
    ...queryClient.getQueriesData<GitHubPullRequestPage>({
      queryKey: githubQueryKeys.pullRequestsRoot(target),
    }),
    ...queryClient.getQueriesData<GitHubPullRequestPage>({
      queryKey: githubQueryKeys.pullRequestInboxRoot,
    }),
  ];

  for (const [queryKey, page] of entries) {
    if (!page) continue;
    const matches = page.pullRequests.filter((pullRequest) =>
      matchesPullRequest(pullRequest, target)
    );
    if (!matches.length) continue;
    const cachedState = pullRequestStateFromQueryKey(queryKey);
    if (nextState && cachedState && cachedState !== nextState) {
      queryClient.setQueryData<GitHubPullRequestPage>(queryKey, {
        ...page,
        pullRequests: page.pullRequests.filter(
          (pullRequest) => !matchesPullRequest(pullRequest, target)
        ),
        totalCount: Math.max(0, page.totalCount - matches.length),
      });
      continue;
    }

    queryClient.setQueryData<GitHubPullRequestPage>(queryKey, {
      ...page,
      pullRequests: page.pullRequests.map((pullRequest) =>
        matchesPullRequest(pullRequest, target) ? update(pullRequest) : pullRequest
      ),
    });
  }
}

function pullRequestStateFromQueryKey(queryKey: QueryKey): GitHubPullRequest["state"] | null {
  if (queryKey[0] === "github" && queryKey[1] === "repository" && queryKey[4] === "pull-requests") {
    return queryKey[5] === "open" || queryKey[5] === "closed" ? queryKey[5] : null;
  }
  if (queryKey[0] === "github" && queryKey[1] === "pull-request-inbox") {
    return queryKey[3] === "open" || queryKey[3] === "closed" ? queryKey[3] : null;
  }
  return null;
}

function mergePullRequestSummary(
  summary: GitHubPullRequestSummary,
  pullRequest: GitHubPullRequest
): GitHubPullRequestSummary {
  return {
    ...summary,
    title: pullRequest.title,
    body: pullRequest.body,
    state: pullRequest.state,
    draft: pullRequest.draft,
    merged: pullRequest.merged,
    author: pullRequest.author,
    authorAvatarUrl: pullRequest.authorAvatarUrl,
    labels: pullRequest.labels,
    comments: pullRequest.comments,
    createdAt: pullRequest.createdAt,
    updatedAt: pullRequest.updatedAt,
    closedAt: pullRequest.closedAt,
  };
}

export function syncUpdatedPullRequest(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  pullRequest: GitHubPullRequest
) {
  queryClient.setQueriesData<GitHubPullRequestDetailPage>(
    { queryKey: githubQueryKeys.pullRequestDetailRoot(target) },
    (detail) => (detail ? { ...detail, pullRequest } : detail)
  );
  updatePullRequestPages(
    queryClient,
    target,
    (summary) => mergePullRequestSummary(summary, pullRequest),
    pullRequest.state
  );
}

export function syncPullRequestMaintainerEditability(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  status: GitHubPullRequestMaintainerEditability
) {
  queryClient.setQueryData(githubQueryKeys.pullRequestMaintainerEditability(target), status);
  syncUpdatedPullRequest(queryClient, target, status.pullRequest);
}

export function syncPullRequestLockedState(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  locked: boolean
) {
  queryClient.setQueriesData<GitHubPullRequestDetailPage>(
    { queryKey: githubQueryKeys.pullRequestDetailRoot(target) },
    (detail) => (detail ? { ...detail, pullRequest: { ...detail.pullRequest, locked } } : detail)
  );
}

export function syncCreatedPullRequest(
  queryClient: QueryClient,
  target: GitHubPullRequestCreationTarget,
  pullRequest: GitHubPullRequest
) {
  queryClient.setQueryData<GitHubPullRequestDetailPage>(
    githubQueryKeys.pullRequestDetail({
      ...target,
      pullRequestNumber: pullRequest.number,
      timelinePage: 1,
    }),
    {
      pullRequest,
      timeline: [],
      reviews: [],
      reviewsHaveMore: false,
      timelinePage: 1,
      timelineHasPrevious: false,
      timelineHasMore: false,
    }
  );
}

export function syncCreatedPullRequestComment(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  comment: GitHubIssueTimelineItem
) {
  queryClient.setQueriesData<GitHubPullRequestDetailPage>(
    { queryKey: githubQueryKeys.pullRequestDetailRoot(target) },
    (detail) => {
      if (!detail) return detail;
      const alreadyIncluded = detail.timeline.some((item) => item.id === comment.id);
      return {
        ...detail,
        pullRequest: {
          ...detail.pullRequest,
          comments: detail.pullRequest.comments + (alreadyIncluded ? 0 : 1),
        },
        timeline:
          detail.timelineHasMore || alreadyIncluded
            ? detail.timeline
            : [...detail.timeline, comment],
      };
    }
  );
  updatePullRequestPages(queryClient, target, (pullRequest) => ({
    ...pullRequest,
    comments: pullRequest.comments + 1,
  }));
}

export function syncCreatedPullRequestReview(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  review: GitHubPullRequestReview
) {
  queryClient.setQueriesData<GitHubPullRequestDetailPage>(
    { queryKey: githubQueryKeys.pullRequestDetailRoot(target) },
    (detail) => {
      if (!detail) return detail;
      const alreadyIncluded = detail.reviews.some((item) => item.id === review.id);
      return {
        ...detail,
        reviews: alreadyIncluded ? detail.reviews : [...detail.reviews, review],
        timeline:
          detail.timelineHasMore || alreadyIncluded
            ? detail.timeline
            : [
                ...detail.timeline,
                {
                  id: `review-${review.id}`,
                  kind: "event",
                  event: "reviewed",
                  actor: review.author,
                  actorAvatarUrl: review.authorAvatarUrl,
                  authorAssociation: review.authorAssociation,
                  body: review.body,
                  url: review.url,
                  createdAt: review.submittedAt,
                  commitId: review.commitId,
                  reviewId: review.id,
                  reviewState: review.state,
                  viewerCanUpdate: false,
                  viewerCanDelete: false,
                  isMinimized: false,
                  outdated: false,
                },
              ],
      };
    }
  );
  queryClient.setQueryData<InfiniteData<GitHubPullRequestReviewPage, number>>(
    githubQueryKeys.pullRequestReviews(target),
    (data) => {
      if (!data || data.pages.some((page) => page.reviews.some((item) => item.id === review.id))) {
        return data;
      }
      const lastIndex = data.pages.length - 1;
      const lastPage = data.pages[lastIndex];
      if (!lastPage || lastPage.hasMore) return data;
      if (lastPage.reviews.length >= PULL_REQUEST_REVIEW_PAGE_SIZE) {
        return {
          pages: [
            ...data.pages,
            {
              reviews: [review],
              page: lastPage.page + 1,
              hasPrevious: true,
              hasMore: false,
            },
          ],
          pageParams: [...data.pageParams, lastPage.page + 1],
        };
      }
      return {
        ...data,
        pages: data.pages.map((page, index) =>
          index === lastIndex ? { ...page, reviews: [...page.reviews, review] } : page
        ),
      };
    }
  );
}

export function syncDismissedPullRequestReview(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  review: GitHubPullRequestReview
) {
  queryClient.setQueriesData<GitHubPullRequestDetailPage>(
    { queryKey: githubQueryKeys.pullRequestDetailRoot(target) },
    (detail) =>
      detail
        ? {
            ...detail,
            reviews: detail.reviews.map((item) => (item.id === review.id ? review : item)),
            timeline: detail.timeline.map((item) =>
              item.reviewId === review.id || item.id === review.nodeId
                ? { ...item, reviewId: review.id, reviewState: review.state }
                : item
            ),
          }
        : detail
  );
  queryClient.setQueryData<InfiniteData<GitHubPullRequestReviewPage, number>>(
    githubQueryKeys.pullRequestReviews(target),
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              reviews: page.reviews.map((item) => (item.id === review.id ? review : item)),
            })),
          }
        : data
  );
}

export function syncPendingPullRequestReview(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  review: GitHubPendingPullRequestReview | null
) {
  queryClient.setQueryData(githubQueryKeys.pendingPullRequestReview(target), review);
}

export function syncPullRequestFileViewedState(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  path: string,
  state: GitHubPullRequestFileViewedState
) {
  queryClient.setQueryData<GitHubPullRequestFileViewStateSnapshot>(
    githubQueryKeys.pullRequestFileViewStates(target),
    (snapshot) =>
      snapshot
        ? {
            ...snapshot,
            files: snapshot.files.map((file) => (file.path === path ? { ...file, state } : file)),
          }
        : snapshot
  );
}

function updatePullRequestReviewThreads(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  update: (thread: GitHubPullRequestReviewThread) => GitHubPullRequestReviewThread
) {
  queryClient.setQueryData<InfiniteData<GitHubPullRequestReviewThreadPage, string | null>>(
    githubQueryKeys.pullRequestReviewThreads(target),
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map(update),
            })),
          }
        : data
  );
}

export function syncPullRequestReviewThreadReply(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  threadId: string,
  comment: GitHubPullRequestReviewThreadComment
) {
  updatePullRequestReviewThreads(queryClient, target, (thread) => {
    if (thread.id !== threadId || thread.comments.some((item) => item.id === comment.id)) {
      return thread;
    }
    return { ...thread, comments: [...thread.comments, comment] };
  });
}

export function syncPullRequestReviewThreadState(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  state: GitHubPullRequestReviewThreadState
) {
  updatePullRequestReviewThreads(queryClient, target, (thread) =>
    thread.id === state.id ? { ...thread, ...state } : thread
  );
}

export function markPullRequestReviewThreadsStale(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget
) {
  return queryClient.invalidateQueries({
    queryKey: githubQueryKeys.pullRequestReviewThreads(target),
    exact: true,
    refetchType: "none",
  });
}

export async function invalidateRepositoryPullRequest(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestDetailRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestsRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestInboxRoot }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestReviewThreads(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestReviews(target) }),
  ]);
}

export async function invalidatePullRequestAfterBranchUpdate(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.checksRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestsRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestInboxRoot }),
  ]);
}

export async function invalidatePullRequestAfterBaseEdit(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.checksRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestsRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestInboxRoot }),
  ]);
}

export async function invalidatePullRequestAfterMaintainerEditability(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  conflict = false
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: conflict
        ? githubQueryKeys.pullRequestRoot(target)
        : githubQueryKeys.pullRequestDetailRoot(target),
    }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestsRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestInboxRoot }),
  ]);
}

export async function invalidatePullRequestAfterReviewDismissal(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestsRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestInboxRoot }),
  ]);
}
