import { lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { openExternalUrl } from "@/lib/window";
import { GitHubCommentActions } from "./github-comment-actions";
import {
  invalidateRepositoryCommitComments,
  mutateRepositoryCommitComment,
  syncRepositoryCommitComment,
} from "./github-commit-comments";
import type {
  GitHubCommentMutation,
  GitHubCommitComment,
  GitHubRepositoryContentContext,
} from "./github-data";
import { formatIssueDate } from "./github-issue-shared";
import type { GitHubCommitDetailTarget } from "./github-queries";
import { GitHubReactionBar } from "./github-reaction-bar";

const GitHubReadme = lazy(() => import("./github-readme"));

export function GitHubCommitCommentCard({
  target,
  repository,
  comment,
  compact = false,
}: {
  target: GitHubCommitDetailTarget;
  repository: GitHubRepositoryContentContext;
  comment: GitHubCommitComment;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { t: appT } = useAppTranslation();
  const queryClient = useQueryClient();
  const author = comment.author?.login ?? t("workspace.repositories.unknownActor");
  const mutateComment = (mutation: GitHubCommentMutation) =>
    mutateRepositoryCommitComment(
      target,
      mutation.action === "update"
        ? {
            action: "update",
            commentId: comment.databaseId,
            commentNodeId: comment.id,
            expectedUpdatedAt: mutation.expectedUpdatedAt,
            body: mutation.body,
          }
        : {
            action: "delete",
            commentId: comment.databaseId,
            commentNodeId: comment.id,
            expectedUpdatedAt: mutation.expectedUpdatedAt,
          }
    );

  return (
    <article className="bg-card/30 min-w-0 overflow-hidden rounded-lg border">
      <header className="bg-card/40 flex min-h-11 min-w-0 items-center gap-2 border-b px-3 py-2">
        <Avatar size="sm" className="shrink-0">
          {comment.author?.avatarUrl ? <AvatarImage src={comment.author.avatarUrl} alt="" /> : null}
          <AvatarFallback>
            <UserRound />
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-xs font-medium">
          {comment.author ? `@${author}` : author}
        </span>
        <span className="text-muted-foreground shrink-0 text-[10px]">
          {t("workspace.repositories.commentedAt", {
            date: formatIssueDate(comment.createdAt, i18n.language),
          })}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {comment.authorAssociation ? (
            <Badge variant="outline" className="h-5 rounded-md text-[9px] font-normal">
              {comment.authorAssociation.toLowerCase()}
            </Badge>
          ) : null}
          <GitHubCommentActions<GitHubCommitComment>
            comment={{
              id: comment.id,
              body: comment.body,
              updatedAt: comment.updatedAt,
              viewerCanUpdate: comment.viewerCanUpdate,
              viewerCanDelete: comment.viewerCanDelete,
            }}
            repository={repository}
            reference={target.commitSha}
            permissionMessage={appT("workspace.repositories.commitCommentPermissionDenied")}
            uncertainWriteMessage={appT("workspace.repositories.commitCommentWriteUncertain")}
            requireNonEmpty
            mutateComment={mutateComment}
            onConflict={() => invalidateRepositoryCommitComments(queryClient, target)}
            onUncertainError={() => invalidateRepositoryCommitComments(queryClient, target)}
            onSuccess={(result, mutation) => {
              if (mutation.action === "update" && result) {
                syncRepositoryCommitComment(queryClient, target, result, "update");
                toast.success(appT("workspace.repositories.commentUpdated"));
              } else if (mutation.action === "delete") {
                syncRepositoryCommitComment(queryClient, target, comment, "delete");
                toast.success(appT("workspace.repositories.commentDeleted"));
              }
              void invalidateRepositoryCommitComments(queryClient, target);
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("workspace.openOnGitHub")}
                onClick={() => void openExternalUrl(comment.url)}
              >
                <ExternalLink />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("workspace.openOnGitHub")}</TooltipContent>
          </Tooltip>
        </span>
      </header>
      {comment.path ? (
        <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 text-[9px]">
          <span className="truncate font-mono">{comment.path}</span>
          <Badge variant="outline" className="rounded-md text-[9px] font-normal">
            {comment.line !== null
              ? t("workspace.repositories.commitCommentLine", { line: comment.line })
              : t("workspace.repositories.commitCommentPosition", {
                  position: comment.position,
                })}
          </Badge>
        </div>
      ) : null}
      <div className={compact ? "px-3 py-3" : "px-4 py-4"}>
        <div className="harbor-markdown text-[12px]">
          <Suspense fallback={<Skeleton className="h-14 w-full" />}>
            <GitHubReadme
              content={comment.body}
              path=""
              reference={target.commitSha}
              repository={repository}
              onOpenExternal={(url) => void openExternalUrl(url)}
            />
          </Suspense>
        </div>
      </div>
      <footer className="flex min-h-10 items-center border-t px-3 py-1.5">
        <GitHubReactionBar subject={{ id: comment.id, kind: "commitComment" }} />
      </footer>
    </article>
  );
}
