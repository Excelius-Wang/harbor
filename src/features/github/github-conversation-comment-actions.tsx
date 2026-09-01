import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import {
  mutateRepositoryIssueComment,
  mutateRepositoryPullRequestComment,
  syncUpdatedIssueComment,
  syncUpdatedPullRequestComment,
} from "./github-comment-mutations";
import { GitHubCommentActions } from "./github-comment-actions";
import type {
  GitHubCommentMutation,
  GitHubIssueTimelineItem,
  GitHubRepositoryContentContext,
} from "./github-data";
import {
  invalidateRepositoryIssue,
  type GitHubIssueMutationTarget,
} from "./github-issue-mutations";
import {
  invalidateRepositoryPullRequest,
  type GitHubPullRequestMutationTarget,
} from "./github-pull-request-mutations";

export type GitHubConversationCommentTarget =
  | ({ kind: "issue" } & GitHubIssueMutationTarget)
  | ({ kind: "pullRequest" } & GitHubPullRequestMutationTarget);

export function GitHubConversationCommentActions({
  comment,
  target,
  repository,
}: {
  comment: GitHubIssueTimelineItem;
  target: GitHubConversationCommentTarget;
  repository: GitHubRepositoryContentContext;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  if (!comment.body || !comment.updatedAt) return null;

  const mutateComment = (mutation: GitHubCommentMutation) =>
    target.kind === "issue"
      ? mutateRepositoryIssueComment(target, mutation)
      : mutateRepositoryPullRequestComment(target, mutation);
  const invalidate = () =>
    target.kind === "issue"
      ? invalidateRepositoryIssue(queryClient, target)
      : invalidateRepositoryPullRequest(queryClient, target);

  return (
    <GitHubCommentActions<GitHubIssueTimelineItem>
      comment={{
        id: comment.id,
        body: comment.body,
        updatedAt: comment.updatedAt,
        viewerCanUpdate: comment.viewerCanUpdate,
        viewerCanDelete: comment.viewerCanDelete,
        ...(target.kind === "issue"
          ? {
              isPinned: comment.isPinned,
              viewerCanPin: comment.viewerCanPin,
              viewerCanUnpin: comment.viewerCanUnpin,
            }
          : {}),
      }}
      repository={repository}
      reference={repository.defaultBranch}
      permissionMessage={t(
        target.kind === "issue"
          ? "workspace.repositories.issueWritePermissionDenied"
          : "workspace.repositories.pullRequestWritePermissionDenied"
      )}
      mutateComment={mutateComment}
      onConflict={() => void invalidate()}
      onSuccess={(result, mutation) => {
        if (
          (mutation.action === "update" ||
            mutation.action === "pin" ||
            mutation.action === "unpin") &&
          result
        ) {
          if (target.kind === "issue") {
            syncUpdatedIssueComment(queryClient, target, result);
          } else {
            syncUpdatedPullRequestComment(queryClient, target, result);
          }
          toast.success(
            t(
              mutation.action === "update"
                ? "workspace.repositories.commentUpdated"
                : mutation.action === "pin"
                  ? "workspace.repositories.commentPinned"
                  : "workspace.repositories.commentUnpinned"
            )
          );
        } else if (mutation.action === "delete") {
          toast.success(t("workspace.repositories.commentDeleted"));
        }
        void invalidate();
      }}
    />
  );
}
