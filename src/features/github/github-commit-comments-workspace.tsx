import { useMemo, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CircleAlert, MessageSquareText, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { GitHubCommitCommentCard } from "./github-commit-comment-card";
import { GitHubCommitCommentComposer } from "./github-commit-comment-composer";
import { placedCommitCommentIdsForFile } from "./github-commit-comment-position";
import type {
  GitHubChangedFile,
  GitHubCommitComment,
  GitHubRepositoryContentContext,
} from "./github-data";
import type { GitHubCommitDetailTarget } from "./github-queries";
import { repositoryCommitCommentsQueryOptions } from "./github-queries";
import { GitHubReactionsProvider } from "./github-reactions-provider";
import { parseGitHubFilePatch } from "./github-file-diff";

export type GitHubCommitCommentsContext = {
  comments: GitHubCommitComment[];
  canCreateComment: boolean;
};

export function GitHubCommitCommentsWorkspace({
  target,
  repository,
  files,
  filesStillLoading,
  children,
}: {
  target: GitHubCommitDetailTarget;
  repository: GitHubRepositoryContentContext;
  files: GitHubChangedFile[];
  filesStillLoading: boolean;
  children: (context: GitHubCommitCommentsContext) => ReactNode;
}) {
  const { t } = useTranslation();
  const result = useInfiniteQuery(repositoryCommitCommentsQueryOptions(target));
  const comments = useMemo(
    () => result.data?.pages.flatMap((page) => page.comments) ?? [],
    [result.data]
  );
  const initialError = !result.data && result.error ? parseIpcError(result.error) : null;
  const laterError =
    result.data && result.isFetchNextPageError ? parseIpcError(result.error) : null;
  const placedCommentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const file of files) {
      const changes = parseGitHubFilePatch(file)?.hunks.flatMap((hunk) => hunk.changes) ?? [];
      for (const id of placedCommitCommentIdsForFile(file, comments, changes)) ids.add(id);
    }
    return ids;
  }, [comments, files]);
  const generalComments = comments.filter(
    (comment) => comment.path === null || comment.position === null
  );
  const unplacedComments = comments.filter(
    (comment) =>
      comment.path !== null && comment.position !== null && !placedCommentIds.has(comment.id)
  );
  const subjects = useMemo(
    () => comments.map((comment) => ({ id: comment.id, kind: "commitComment" as const })),
    [comments]
  );
  const canCreateComment = Boolean(result.data) && !initialError;

  return (
    <GitHubReactionsProvider repository={repository} subjects={subjects}>
      <section className="flex min-w-0 flex-col gap-3">
        <div>
          <h4 className="text-sm font-semibold">{t("workspace.repositories.commitComments")}</h4>
          <p className="text-muted-foreground text-[10px]">
            {t("workspace.repositories.commitCommentsDescription")}
          </p>
        </div>

        {result.isPending ? (
          <div
            className="flex flex-col gap-2"
            role="status"
            aria-label={t("workspace.repositories.loadingCommitComments")}
          >
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : initialError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.commitCommentsLoadFailed")}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{initialError.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void result.refetch()}
              >
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : comments.length === 0 ? (
          <Empty className="min-h-36 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareText />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.noCommitComments")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.repositories.noCommitCommentsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : generalComments.length ? (
          <div className="flex min-w-0 flex-col gap-2">
            {generalComments.map((comment) => (
              <GitHubCommitCommentCard
                key={comment.id}
                target={target}
                repository={repository}
                comment={comment}
              />
            ))}
          </div>
        ) : null}

        <GitHubCommitCommentComposer
          target={target}
          repository={repository}
          disabled={!canCreateComment}
          className="m-0"
        />

        {laterError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.commitCommentsNextPageFailed")}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{laterError.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void result.fetchNextPage()}
              >
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {result.hasNextPage && !laterError ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={result.isFetchingNextPage}
              onClick={() => void result.fetchNextPage()}
            >
              {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
              {t(
                result.isFetchingNextPage
                  ? "workspace.repositories.loadingMoreCommitComments"
                  : "workspace.repositories.loadMoreCommitComments"
              )}
            </Button>
          </div>
        ) : null}
      </section>

      {children({ comments, canCreateComment })}

      {unplacedComments.length ? (
        <section className="flex min-w-0 flex-col gap-3">
          <div>
            <h4 className="text-sm font-semibold">
              {t("workspace.repositories.unplacedCommitComments")}
            </h4>
            <p className="text-muted-foreground text-[10px]">
              {t(
                filesStillLoading
                  ? "workspace.repositories.unplacedCommitCommentsLoadingFiles"
                  : "workspace.repositories.unplacedCommitCommentsDescription"
              )}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            {unplacedComments.map((comment) => (
              <GitHubCommitCommentCard
                key={comment.id}
                target={target}
                repository={repository}
                comment={comment}
              />
            ))}
          </div>
        </section>
      ) : null}
    </GitHubReactionsProvider>
  );
}
