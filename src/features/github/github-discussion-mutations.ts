import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubDiscussionCloseReason,
  GitHubDiscussionComment,
  GitHubDiscussionCommentDeletion,
  GitHubDiscussionDeletion,
  GitHubDiscussionDetailPage,
  GitHubDiscussionPage,
  GitHubDiscussionPoll,
  GitHubDiscussionState,
  GitHubDiscussionSummary,
  GitHubDiscussionVote,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubDiscussionRepositoryTarget = {
  owner: string;
  repository: string;
};

export type GitHubDiscussionMutationTarget = GitHubDiscussionRepositoryTarget & {
  discussionNumber: number;
};

export type GitHubDiscussionContent = {
  categoryId: string;
  title: string;
  body: string;
};

export function createRepositoryDiscussion(
  target: GitHubDiscussionRepositoryTarget,
  content: GitHubDiscussionContent
) {
  return invoke<GitHubDiscussionSummary>("github_create_repository_discussion", {
    owner: target.owner,
    repository: target.repository,
    ...content,
  });
}

export function updateRepositoryDiscussion(
  target: GitHubDiscussionMutationTarget,
  content: GitHubDiscussionContent
) {
  return invoke<GitHubDiscussionSummary>("github_update_repository_discussion", {
    ...target,
    ...content,
  });
}

export function createRepositoryDiscussionComment(
  target: GitHubDiscussionMutationTarget,
  body: string,
  replyToId?: string
) {
  return invoke<GitHubDiscussionComment>("github_create_repository_discussion_comment", {
    ...target,
    replyToId,
    body,
  });
}

export function updateRepositoryDiscussionComment(commentId: string, body: string) {
  return invoke<GitHubDiscussionComment>("github_update_repository_discussion_comment", {
    commentId,
    body,
  });
}

export function updateRepositoryDiscussionState(
  target: GitHubDiscussionMutationTarget,
  discussionState: GitHubDiscussionState,
  closeReason?: GitHubDiscussionCloseReason
) {
  return invoke<GitHubDiscussionSummary>("github_update_repository_discussion_state", {
    ...target,
    discussionState,
    closeReason,
  });
}

export function updateRepositoryDiscussionUpvote(subjectId: string, upvoted: boolean) {
  return invoke<GitHubDiscussionVote>("github_update_repository_discussion_upvote", {
    subjectId,
    upvoted,
  });
}

export function updateRepositoryDiscussionAnswer(commentId: string, answered: boolean) {
  return invoke<GitHubDiscussionSummary>("github_update_repository_discussion_answer", {
    commentId,
    answered,
  });
}

export function addRepositoryDiscussionPollVote(
  target: GitHubDiscussionMutationTarget,
  pollOptionId: string
) {
  return invoke<GitHubDiscussionPoll>("github_add_repository_discussion_poll_vote", {
    ...target,
    pollOptionId,
  });
}

export function deleteRepositoryDiscussion(target: GitHubDiscussionMutationTarget) {
  return invoke<GitHubDiscussionDeletion>("github_delete_repository_discussion", target);
}

export function deleteRepositoryDiscussionComment(
  target: GitHubDiscussionMutationTarget,
  commentId: string
) {
  return invoke<GitHubDiscussionCommentDeletion>("github_delete_repository_discussion_comment", {
    ...target,
    commentId,
  });
}

function discussionStateFromQueryKey(queryKey: QueryKey): GitHubDiscussionState | "all" | null {
  if (queryKey[0] === "github" && queryKey[1] === "repository" && queryKey[4] === "discussions") {
    const value = queryKey[6];
    return value === "all" || value === "open" || value === "closed" ? value : null;
  }
  return null;
}

function updateDiscussionLists(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  update: (discussion: GitHubDiscussionSummary) => GitHubDiscussionSummary,
  nextState?: GitHubDiscussionState
) {
  for (const [queryKey, data] of queryClient.getQueriesData<
    InfiniteData<GitHubDiscussionPage, string | null>
  >({ queryKey: githubQueryKeys.discussionsRoot(target) })) {
    if (!data) continue;
    const cachedState = discussionStateFromQueryKey(queryKey);
    queryClient.setQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(queryKey, {
      ...data,
      pages: data.pages.map((page) => {
        const matches = page.discussions.filter(
          (discussion) => discussion.number === target.discussionNumber
        );
        if (!matches.length) return page;
        if (nextState && cachedState && cachedState !== "all" && cachedState !== nextState) {
          return {
            ...page,
            discussions: page.discussions.filter(
              (discussion) => discussion.number !== target.discussionNumber
            ),
            totalCount: Math.max(0, page.totalCount - matches.length),
          };
        }
        return {
          ...page,
          discussions: page.discussions.map((discussion) =>
            discussion.number === target.discussionNumber ? update(discussion) : discussion
          ),
        };
      }),
    });
  }
}

function updateDiscussionDetail(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  update: (
    page: GitHubDiscussionDetailPage,
    index: number,
    pages: GitHubDiscussionDetailPage[]
  ) => GitHubDiscussionDetailPage
) {
  queryClient.setQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(
    githubQueryKeys.discussionDetail(target),
    (data) => (data ? { ...data, pages: data.pages.map(update) } : data)
  );
}

export function syncCreatedDiscussion(
  queryClient: QueryClient,
  target: GitHubDiscussionRepositoryTarget,
  discussion: GitHubDiscussionSummary
) {
  queryClient.setQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(
    githubQueryKeys.discussionDetail({ ...target, discussionNumber: discussion.number }),
    {
      pages: [
        {
          discussion,
          comments: [],
          commentCount: 0,
          hasMore: false,
        },
      ],
      pageParams: [null],
    }
  );
}

export function syncUpdatedDiscussion(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  discussion: GitHubDiscussionSummary
) {
  updateDiscussionDetail(queryClient, target, (page) => ({ ...page, discussion }));
  updateDiscussionLists(queryClient, target, () => discussion, discussion.state);
}

function updateCommentTree(
  comments: GitHubDiscussionComment[],
  commentId: string,
  update: (comment: GitHubDiscussionComment) => GitHubDiscussionComment
): GitHubDiscussionComment[] {
  return comments.map((comment) =>
    comment.id === commentId
      ? update(comment)
      : { ...comment, replies: updateCommentTree(comment.replies, commentId, update) }
  );
}

export function syncCreatedDiscussionComment(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  comment: GitHubDiscussionComment,
  replyToId?: string
) {
  updateDiscussionDetail(queryClient, target, (page, index, pages) => {
    const alreadyIncluded = page.comments.some(
      (item) => item.id === comment.id || item.replies.some((reply) => reply.id === comment.id)
    );
    if (alreadyIncluded) return page;
    if (replyToId) {
      return {
        ...page,
        comments: updateCommentTree(page.comments, replyToId, (parent) => ({
          ...parent,
          replies: [...parent.replies, comment],
        })),
      };
    }
    const isFinalPage = index === pages.length - 1 && !page.hasMore;
    return {
      ...page,
      discussion: {
        ...page.discussion,
        commentCount: page.discussion.commentCount + 1,
      },
      commentCount: page.commentCount + 1,
      comments: isFinalPage ? [...page.comments, comment] : page.comments,
    };
  });
  if (!replyToId) {
    updateDiscussionLists(queryClient, target, (discussion) => ({
      ...discussion,
      commentCount: discussion.commentCount + 1,
    }));
  }
}

export function syncUpdatedDiscussionComment(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  comment: GitHubDiscussionComment
) {
  updateDiscussionDetail(queryClient, target, (page) => ({
    ...page,
    comments: updateCommentTree(page.comments, comment.id, (current) => ({
      ...comment,
      replies: current.replies,
      repliesHaveMore: current.repliesHaveMore,
    })),
  }));
}

export function syncDiscussionVote(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  vote: GitHubDiscussionVote
) {
  updateDiscussionDetail(queryClient, target, (page) => ({
    ...page,
    discussion:
      page.discussion.id === vote.subjectId
        ? {
            ...page.discussion,
            upvoteCount: vote.upvoteCount,
            viewerCanUpvote: vote.viewerCanUpvote,
            viewerHasUpvoted: vote.viewerHasUpvoted,
          }
        : page.discussion,
    comments: updateCommentTree(page.comments, vote.subjectId, (comment) => ({
      ...comment,
      upvoteCount: vote.upvoteCount,
      viewerCanUpvote: vote.viewerCanUpvote,
      viewerHasUpvoted: vote.viewerHasUpvoted,
    })),
  }));
  updateDiscussionLists(queryClient, target, (discussion) =>
    discussion.id === vote.subjectId
      ? {
          ...discussion,
          upvoteCount: vote.upvoteCount,
          viewerCanUpvote: vote.viewerCanUpvote,
          viewerHasUpvoted: vote.viewerHasUpvoted,
        }
      : discussion
  );
}

export function syncDiscussionAnswer(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  discussion: GitHubDiscussionSummary
) {
  updateDiscussionDetail(queryClient, target, (page) => ({
    ...page,
    discussion,
    comments: page.comments.map((comment) => markOnlyAnswer(comment, discussion.answerId)),
  }));
  updateDiscussionLists(queryClient, target, () => discussion);
}

export function syncDiscussionPoll(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  poll: GitHubDiscussionPoll
) {
  updateDiscussionDetail(queryClient, target, (page) => ({ ...page, poll }));
}

export function syncDeletedDiscussion(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  deletion: GitHubDiscussionDeletion
) {
  if (deletion.discussionNumber !== target.discussionNumber) return;
  for (const [queryKey, data] of queryClient.getQueriesData<
    InfiniteData<GitHubDiscussionPage, string | null>
  >({ queryKey: githubQueryKeys.discussionsRoot(target) })) {
    if (!data) continue;
    const included = data.pages.some((page) =>
      page.discussions.some(
        (discussion) =>
          discussion.number === deletion.discussionNumber && discussion.id === deletion.discussionId
      )
    );
    if (!included) continue;
    queryClient.setQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(queryKey, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        discussions: page.discussions.filter(
          (discussion) =>
            discussion.number !== deletion.discussionNumber ||
            discussion.id !== deletion.discussionId
        ),
        totalCount: Math.max(0, page.totalCount - 1),
      })),
    });
  }
  queryClient.removeQueries({ queryKey: githubQueryKeys.discussionDetail(target), exact: true });
}

function containsDiscussionComment(
  comments: GitHubDiscussionComment[],
  commentId: string
): boolean {
  return comments.some(
    (comment) => comment.id === commentId || containsDiscussionComment(comment.replies, commentId)
  );
}

function removeDiscussionComment(
  comments: GitHubDiscussionComment[],
  commentId: string
): GitHubDiscussionComment[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: removeDiscussionComment(comment.replies, commentId),
    }));
}

function preserveDeletedDiscussionComment(
  comments: GitHubDiscussionComment[],
  deletion: GitHubDiscussionCommentDeletion
): GitHubDiscussionComment[] {
  return updateCommentTree(comments, deletion.commentId, (comment) => ({
    ...comment,
    body: "",
    author: undefined,
    authorAvatarUrl: undefined,
    authorAssociation: "NONE",
    deletedAt: deletion.deletedAt ?? "deleted",
    isAnswer: false,
    isMinimized: false,
    minimizedReason: undefined,
    viewerCanDelete: false,
    viewerCanMarkAsAnswer: false,
    viewerCanUnmarkAsAnswer: false,
    viewerCanUpdate: false,
    viewerCanUpvote: false,
    viewerDidAuthor: false,
    viewerHasUpvoted: false,
  }));
}

function clearDeletedAnswer(
  discussion: GitHubDiscussionSummary,
  commentId: string
): GitHubDiscussionSummary {
  return discussion.answerId === commentId
    ? {
        ...discussion,
        answerId: undefined,
        answerChosenAt: undefined,
        answerChosenBy: undefined,
      }
    : discussion;
}

export function syncDeletedDiscussionComment(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget,
  deletion: GitHubDiscussionCommentDeletion
) {
  const removesRootComment = !deletion.replyToId && !deletion.preserved;
  updateDiscussionDetail(queryClient, target, (page) => {
    const included = containsDiscussionComment(page.comments, deletion.commentId);
    const discussion = clearDeletedAnswer(page.discussion, deletion.commentId);
    return {
      ...page,
      discussion: removesRootComment
        ? { ...discussion, commentCount: Math.max(0, discussion.commentCount - 1) }
        : discussion,
      commentCount: removesRootComment ? Math.max(0, page.commentCount - 1) : page.commentCount,
      comments: !included
        ? page.comments
        : deletion.preserved
          ? preserveDeletedDiscussionComment(page.comments, deletion)
          : removeDiscussionComment(page.comments, deletion.commentId),
    };
  });
  updateDiscussionLists(queryClient, target, (discussion) => {
    const updated = clearDeletedAnswer(discussion, deletion.commentId);
    return removesRootComment
      ? { ...updated, commentCount: Math.max(0, updated.commentCount - 1) }
      : updated;
  });
}

function markOnlyAnswer(
  comment: GitHubDiscussionComment,
  answerId: string | undefined
): GitHubDiscussionComment {
  return {
    ...comment,
    isAnswer: comment.id === answerId,
    replies: comment.replies.map((reply) => markOnlyAnswer(reply, answerId)),
  };
}

export async function invalidateRepositoryDiscussion(
  queryClient: QueryClient,
  target: GitHubDiscussionMutationTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.discussionDetail(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.discussionsRoot(target) }),
  ]);
}

export function invalidateRepositoryDiscussions(
  queryClient: QueryClient,
  target: GitHubDiscussionRepositoryTarget
) {
  return queryClient.invalidateQueries({ queryKey: githubQueryKeys.discussionsRoot(target) });
}
