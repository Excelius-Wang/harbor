import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubCommitComment,
  GitHubCommitCommentMutation,
  GitHubCommitCommentPage,
} from "./github-data";
import { githubQueryKeys, type GitHubCommitDetailTarget } from "./github-queries";

const COMMIT_COMMENT_PAGE_SIZE = 100;

export function mutateRepositoryCommitComment(
  target: GitHubCommitDetailTarget,
  mutation: GitHubCommitCommentMutation
) {
  return invoke<GitHubCommitComment | null>("github_mutate_repository_commit_comment", {
    ...target,
    mutation,
  });
}

export function reconcileCommitCommentPages(
  data: InfiniteData<GitHubCommitCommentPage, number>,
  comment: GitHubCommitComment,
  action: GitHubCommitCommentMutation["action"]
): InfiniteData<GitHubCommitCommentPage, number> {
  const matches = (candidate: GitHubCommitComment) =>
    candidate.id === comment.id && candidate.databaseId === comment.databaseId;
  if (action === "create") {
    if (data.pages.some((page) => page.comments.some(matches))) return data;
    const lastIndex = data.pages.length - 1;
    const lastPage = data.pages[lastIndex];
    if (!lastPage || lastPage.hasMore || lastPage.comments.length >= COMMIT_COMMENT_PAGE_SIZE) {
      return data;
    }
    return {
      ...data,
      pages: data.pages.map((page, index) =>
        index === lastIndex
          ? {
              ...page,
              comments: [...page.comments, comment].sort(
                (left, right) => left.databaseId - right.databaseId
              ),
            }
          : page
      ),
    };
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      comments:
        action === "delete"
          ? page.comments.filter((candidate) => !matches(candidate))
          : page.comments.map((candidate) => (matches(candidate) ? comment : candidate)),
    })),
  };
}

export function syncRepositoryCommitComment(
  queryClient: QueryClient,
  target: GitHubCommitDetailTarget,
  comment: GitHubCommitComment,
  action: GitHubCommitCommentMutation["action"]
) {
  queryClient.setQueryData<InfiniteData<GitHubCommitCommentPage, number>>(
    githubQueryKeys.commitComments(target),
    (current) => (current ? reconcileCommitCommentPages(current, comment, action) : current)
  );
}

export function invalidateRepositoryCommitComments(
  queryClient: QueryClient,
  target: GitHubCommitDetailTarget
) {
  return queryClient.invalidateQueries({ queryKey: githubQueryKeys.commitComments(target) });
}
