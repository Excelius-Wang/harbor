import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubCommentMutation,
  GitHubIssueDetailPage,
  GitHubIssueTimelineItem,
  GitHubPullRequestDetailPage,
  GitHubPullRequestReviewThreadComment,
  GitHubPullRequestReviewThreadPage,
} from "./github-data";
import type { GitHubIssueMutationTarget } from "./github-issue-mutations";
import type { GitHubPullRequestMutationTarget } from "./github-pull-request-mutations";
import { githubQueryKeys } from "./github-queries";

export function mutateRepositoryIssueComment(
  target: GitHubIssueMutationTarget,
  mutation: GitHubCommentMutation
) {
  return invoke<GitHubIssueTimelineItem | null>("github_mutate_repository_issue_comment", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    mutation,
  });
}

export function mutateRepositoryPullRequestComment(
  target: GitHubPullRequestMutationTarget,
  mutation: GitHubCommentMutation
) {
  return invoke<GitHubIssueTimelineItem | null>("github_mutate_repository_pull_request_comment", {
    owner: target.owner,
    repository: target.repository,
    pullRequestNumber: target.pullRequestNumber,
    mutation,
  });
}

export function mutateRepositoryPullRequestReviewComment(
  target: GitHubPullRequestMutationTarget,
  mutation: GitHubCommentMutation
) {
  return invoke<GitHubPullRequestReviewThreadComment | null>(
    "github_mutate_repository_pull_request_review_comment",
    {
      owner: target.owner,
      repository: target.repository,
      pullRequestNumber: target.pullRequestNumber,
      mutation,
    }
  );
}

export function syncUpdatedIssueComment(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget,
  comment: GitHubIssueTimelineItem
) {
  queryClient.setQueriesData<GitHubIssueDetailPage>(
    { queryKey: githubQueryKeys.issueRoot(target) },
    (detail) =>
      detail
        ? {
            ...detail,
            timeline: detail.timeline.map((item) => (item.id === comment.id ? comment : item)),
          }
        : detail
  );
}

export function syncUpdatedPullRequestComment(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  comment: GitHubIssueTimelineItem
) {
  queryClient.setQueriesData<GitHubPullRequestDetailPage>(
    { queryKey: githubQueryKeys.pullRequestDetailRoot(target) },
    (detail) =>
      detail
        ? {
            ...detail,
            timeline: detail.timeline.map((item) => (item.id === comment.id ? comment : item)),
          }
        : detail
  );
}

export function syncUpdatedPullRequestReviewComment(
  queryClient: QueryClient,
  target: GitHubPullRequestMutationTarget,
  comment: GitHubPullRequestReviewThreadComment
) {
  queryClient.setQueryData<InfiniteData<GitHubPullRequestReviewThreadPage, string | null>>(
    githubQueryKeys.pullRequestReviewThreads(target),
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((thread) => ({
                ...thread,
                comments: thread.comments.map((item) => (item.id === comment.id ? comment : item)),
              })),
            })),
          }
        : data
  );
}
