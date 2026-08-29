import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  ChevronDown,
  ExternalLink,
  FileDiff,
  MessageSquarePlus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  Diff,
  Hunk,
  getChangeKey,
  parseDiff,
  type ChangeData,
  type FileData,
  type ViewType,
} from "react-diff-view";
import "react-diff-view/style/index.css";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubPullRequest,
  GitHubPendingPullRequestReview,
  GitHubPendingPullRequestReviewComment,
  GitHubPullRequestFile,
  GitHubPullRequestReviewComment,
  GitHubPullRequestReviewCommentSide,
  GitHubReactionSubjectRef,
  GitHubPullRequestRepository,
  GitHubPullRequestReviewThread,
} from "./github-data";
import { GitHubPagination } from "./github-issue-shared";
import { GitHubPullRequestInlineComment } from "./github-pull-request-inline-comment";
import {
  pullRequestReviewCommentKey,
  pullRequestReviewCommentLocation,
  pullRequestReviewCommentLocationForSide,
  pullRequestReviewCommentRange,
  pullRequestReviewThreadMatchesChange,
  type PullRequestReviewDiffSelection,
} from "./github-pull-request-review-comments";
import { GitHubPullRequestReviewDialog } from "./github-pull-request-review-dialog";
import { GitHubPullRequestReviewThreadView } from "./github-pull-request-review-thread";
import { GitHubReactionsProvider } from "./github-reactions-provider";
import {
  deletePendingRepositoryPullRequestReviewComment,
  markPullRequestReviewThreadsStale,
  savePendingRepositoryPullRequestReviewComment,
  syncPendingPullRequestReview,
} from "./github-pull-request-mutations";
import {
  pendingPullRequestReviewQueryOptions,
  pullRequestFilesQueryOptions,
  pullRequestReviewThreadsQueryOptions,
} from "./github-queries";

function parseFilePatch(file: GitHubPullRequestFile): FileData | null {
  if (!file.patch) return null;
  const oldPath = file.status === "added" ? "/dev/null" : `a/${file.previousPath ?? file.path}`;
  const newPath = file.status === "removed" ? "/dev/null" : `b/${file.path}`;
  const source = [
    `diff --git a/${file.previousPath ?? file.path} b/${file.path}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    file.patch,
  ].join("\n");

  try {
    return parseDiff(source, { nearbySequences: "zip" })[0] ?? null;
  } catch {
    return null;
  }
}

type OpenReviewComment = {
  changeKey: string;
  location: Omit<GitHubPullRequestReviewComment, "body">;
};

type ReviewSelectionDrag = {
  selection: PullRequestReviewDiffSelection;
  openOnRelease: boolean;
};

function PullRequestFileDiff({
  file,
  viewType,
  repository,
  pullRequest,
  comments,
  threads,
  canCreateComment,
  onSaveComment,
  onDeleteComment,
}: {
  file: GitHubPullRequestFile;
  viewType: ViewType;
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
  comments: GitHubPendingPullRequestReviewComment[];
  threads: GitHubPullRequestReviewThread[];
  canCreateComment: boolean;
  onSaveComment: (comment: GitHubPullRequestReviewComment, commentId?: number) => Promise<void>;
  onDeleteComment: (commentId: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [openComment, setOpenComment] = useState<OpenReviewComment | null>(null);
  const [selection, setSelection] = useState<PullRequestReviewDiffSelection | null>(null);
  const drag = useRef<ReviewSelectionDrag | null>(null);
  const diff = useMemo(() => parseFilePatch(file), [file]);
  const changes = useMemo(() => diff?.hunks.flatMap((hunk) => hunk.changes) ?? [], [diff]);
  const selectionRange = useMemo(
    () => (selection ? pullRequestReviewCommentRange(file.path, changes, selection) : null),
    [changes, file.path, selection]
  );

  useEffect(() => {
    const stopDragging = () => {
      drag.current = null;
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const fileThreads = threads.filter((thread) => thread.path === file.path);
  if (!diff?.hunks.length) {
    return (
      <div className="min-w-0">
        <div className="text-muted-foreground bg-muted/20 px-4 py-8 text-center text-[11px]">
          {t("workspace.repositories.diffUnavailable")}
        </div>
        {fileThreads.length ? (
          <ReviewThreadList
            threads={fileThreads}
            repository={{ ...repository, defaultBranch: pullRequest.baseRef }}
            reference={pullRequest.headSha}
            pullRequestUrl={pullRequest.url}
            pullRequestNumber={pullRequest.number}
          />
        ) : null}
      </div>
    );
  }

  const fileComments = comments.filter((comment) => comment.path === file.path);
  const threadsByChange = new Map(
    changes.map((change) => [
      getChangeKey(change),
      fileThreads.filter((thread) => pullRequestReviewThreadMatchesChange(thread, change)),
    ])
  );
  const matchedThreadIds = new Set(
    [...threadsByChange.values()].flatMap((changeThreads) =>
      changeThreads.map((thread) => thread.id)
    )
  );
  const unmatchedThreads = fileThreads.filter((thread) => !matchedThreadIds.has(thread.id));
  const draftForChange = (change: ChangeData) =>
    fileComments.find((comment) => {
      const location = pullRequestReviewCommentLocationForSide(file.path, change, comment.side);
      return (
        location && pullRequestReviewCommentKey(location) === pullRequestReviewCommentKey(comment)
      );
    });
  const widgets = Object.fromEntries(
    changes.flatMap((change) => {
      const changeKey = getChangeKey(change);
      const draft = draftForChange(change);
      const openAtChange = openComment?.changeKey === changeKey;
      const location = draft
        ? {
            path: draft.path,
            line: draft.line,
            side: draft.side,
            startLine: draft.startLine,
            startSide: draft.startSide,
          }
        : openAtChange
          ? openComment.location
          : pullRequestReviewCommentLocation(file.path, change);
      const locationKey = pullRequestReviewCommentKey(location);
      const changeThreads = threadsByChange.get(changeKey) ?? [];
      if (!changeThreads.length && !draft && !openAtChange) return [];

      return [
        [
          changeKey,
          <div key={locationKey} className="flex min-w-0 flex-col gap-2 p-2">
            {changeThreads.map((thread) => (
              <GitHubPullRequestReviewThreadView
                key={thread.id}
                thread={thread}
                repository={{ ...repository, defaultBranch: pullRequest.baseRef }}
                reference={pullRequest.headSha}
                pullRequestUrl={pullRequest.url}
                pullRequestNumber={pullRequest.number}
                compact
              />
            ))}
            {draft || openAtChange ? (
              <GitHubPullRequestInlineComment
                id={`pull-request-${pullRequest.number}-${encodeURIComponent(file.path)}-${changeKey}`}
                repository={{ ...repository, defaultBranch: pullRequest.baseRef }}
                reference={pullRequest.headSha}
                location={location}
                draft={draft}
                editRequested={openAtChange}
                onCancel={() => {
                  setOpenComment(null);
                  setSelection(null);
                }}
                onSave={async (comment) => {
                  await onSaveComment(comment, draft?.databaseId);
                  setOpenComment(null);
                  setSelection(null);
                }}
                onDelete={async () => {
                  if (draft) await onDeleteComment(draft.databaseId);
                  setOpenComment(null);
                  setSelection(null);
                }}
              />
            ) : null}
          </div>,
        ],
      ];
    })
  );
  const selectedChanges = [
    ...new Set([
      ...changes
        .filter(
          (change) =>
            draftForChange(change) || (threadsByChange.get(getChangeKey(change))?.length ?? 0) > 0
        )
        .map(getChangeKey),
      ...(selectionRange?.changeKeys ?? []),
    ]),
  ];

  return (
    <div className="min-w-0">
      <div className="harbor-diff overflow-x-auto">
        <Diff
          viewType={viewType}
          diffType={diff.type}
          hunks={diff.hunks}
          optimizeSelection
          widgets={widgets}
          selectedChanges={selectedChanges}
          renderGutter={({ change, side, inHoverState, renderDefault, wrapInAnchor }) => {
            const changeKey = getChangeKey(change);
            const reviewSide: GitHubPullRequestReviewCommentSide =
              side === "old" ? "left" : "right";
            const location = pullRequestReviewCommentLocationForSide(file.path, change, reviewSide);
            if (!location) {
              return (
                <span className="flex min-w-9 items-center justify-end px-1">
                  {wrapInAnchor(renderDefault())}
                </span>
              );
            }

            const draft = draftForChange(change);
            const draftOnSide =
              draft?.side === reviewSide &&
              pullRequestReviewCommentKey(draft) === pullRequestReviewCommentKey(location);
            const selectedOnSide =
              selection?.side === reviewSide &&
              Boolean(selectionRange?.changeKeys.includes(changeKey));
            const selectionEndsHere = selectedOnSide && selectionRange?.endChangeKey === changeKey;
            const openOnSide =
              openComment?.changeKey === changeKey && openComment.location.side === reviewSide;
            const actionRange = selectionEndsHere ? selectionRange : null;
            const actionLocation = actionRange?.location ?? location;
            const canComment =
              pullRequest.state === "open" &&
              !pullRequest.merged &&
              canCreateComment &&
              (!draft || draftOnSide);
            const actionLabel = t(
              actionLocation.startLine === undefined
                ? "workspace.repositories.commentOnLine"
                : "workspace.repositories.commentOnLines",
              {
                startLine: actionLocation.startLine,
                line: actionLocation.line,
              }
            );
            const beginSelection = (extend: boolean, openOnRelease: boolean) => {
              const nextSelection =
                openOnRelease && selectionEndsHere && selection
                  ? selection
                  : extend && selection?.side === reviewSide
                    ? { ...selection, focusChangeKey: changeKey }
                    : {
                        side: reviewSide,
                        anchorChangeKey: changeKey,
                        focusChangeKey: changeKey,
                      };
              drag.current = { selection: nextSelection, openOnRelease };
              setSelection(nextSelection);
            };
            const extendSelection = () => {
              const active = drag.current;
              if (!active || active.selection.side !== reviewSide) return;
              const nextSelection = { ...active.selection, focusChangeKey: changeKey };
              drag.current = { ...active, selection: nextSelection };
              setSelection(nextSelection);
            };
            const finishSelection = () => {
              const active = drag.current;
              if (!active || active.selection.side !== reviewSide) return;
              const nextSelection = { ...active.selection, focusChangeKey: changeKey };
              drag.current = null;
              setSelection(nextSelection);
              if (!active.openOnRelease) return;
              const range = pullRequestReviewCommentRange(file.path, changes, nextSelection);
              if (range) {
                setOpenComment({ changeKey: range.endChangeKey, location: range.location });
              }
            };
            const openSelectionWithKeyboard = () => {
              const nextSelection =
                selectionEndsHere && selection
                  ? selection
                  : {
                      side: reviewSide,
                      anchorChangeKey: changeKey,
                      focusChangeKey: changeKey,
                    };
              const range = pullRequestReviewCommentRange(file.path, changes, nextSelection);
              setSelection(nextSelection);
              if (range) {
                setOpenComment({ changeKey: range.endChangeKey, location: range.location });
              }
            };

            return (
              <span
                className="flex min-w-9 items-center justify-end gap-1 px-1"
                onPointerEnter={extendSelection}
                onPointerUp={finishSelection}
              >
                {canComment && (inHoverState || draftOnSide || openOnSide || selectionEndsHere) ? (
                  <button
                    type="button"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex size-4 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2"
                    aria-label={actionLabel}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      beginSelection(false, true);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.detail === 0) openSelectionWithKeyboard();
                    }}
                  >
                    <MessageSquarePlus className="size-2.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="hover:text-foreground focus-visible:ring-ring inline-flex min-w-4 items-center justify-end rounded-sm outline-none focus-visible:ring-1"
                  aria-label={t("workspace.repositories.selectReviewCommentLine", {
                    line: location.line,
                    side: t(`workspace.repositories.reviewCommentSides.${reviewSide}`),
                  })}
                  aria-pressed={selectedOnSide}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    beginSelection(event.shiftKey, false);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (event.detail === 0) beginSelection(event.shiftKey, false);
                  }}
                >
                  {renderDefault()}
                </button>
              </span>
            );
          }}
        >
          {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
        </Diff>
      </div>
      {unmatchedThreads.length ? (
        <ReviewThreadList
          threads={unmatchedThreads}
          repository={{ ...repository, defaultBranch: pullRequest.baseRef }}
          reference={pullRequest.headSha}
          pullRequestUrl={pullRequest.url}
          pullRequestNumber={pullRequest.number}
        />
      ) : null}
    </div>
  );
}

function ReviewThreadList({
  threads,
  repository,
  reference,
  pullRequestUrl,
  pullRequestNumber,
}: {
  threads: GitHubPullRequestReviewThread[];
  repository: GitHubPullRequestRepository & { defaultBranch: string };
  reference: string;
  pullRequestUrl: string;
  pullRequestNumber: number;
}) {
  const { t } = useTranslation();
  return (
    <section className="bg-muted/10 flex min-w-0 flex-col gap-2 border-t p-3">
      <h4 className="text-muted-foreground text-[10px] font-medium tracking-[0.12em] uppercase">
        {t("workspace.repositories.earlierReviewConversations")}
      </h4>
      {threads.map((thread) => (
        <GitHubPullRequestReviewThreadView
          key={thread.id}
          thread={thread}
          repository={repository}
          reference={reference}
          pullRequestUrl={pullRequestUrl}
          pullRequestNumber={pullRequestNumber}
        />
      ))}
    </section>
  );
}

export function GitHubPullRequestFiles({
  repository,
  pullRequest,
  page,
  onPageChange,
  enabled,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
  page: number;
  onPageChange: (page: number) => void;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [viewType, setViewType] = useState<ViewType>("unified");
  const [reviewOpen, setReviewOpen] = useState(false);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const result = useQuery({
    ...pullRequestFilesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      pullRequestNumber: pullRequest.number,
      page,
    }),
    enabled,
    placeholderData: (previous) => previous,
  });
  const reviewThreadsResult = useInfiniteQuery({
    ...pullRequestReviewThreadsQueryOptions(target),
    enabled,
  });
  const pendingReviewResult = useQuery({
    ...pendingPullRequestReviewQueryOptions(target),
    enabled,
  });
  const data = result.data;
  const error = !data && result.error ? parseIpcError(result.error) : null;
  const pendingReview = pendingReviewResult.data ?? null;
  const comments = pendingReview?.comments ?? [];
  const pendingCommentIds = new Set(comments.map((comment) => comment.id));
  const reviewThreads = (
    reviewThreadsResult.data?.pages.flatMap((threadPage) => threadPage.threads) ?? []
  ).filter((thread) => !thread.comments.some((comment) => pendingCommentIds.has(comment.id)));
  const reactionSubjects = reviewThreads.flatMap((thread) =>
    thread.comments.flatMap((comment): GitHubReactionSubjectRef[] =>
      comment.pending ? [] : [{ id: comment.id, kind: "pullRequestReviewComment" }]
    )
  );
  const reviewThreadsError = reviewThreadsResult.error
    ? parseIpcError(reviewThreadsResult.error)
    : null;
  const pendingReviewError = pendingReviewResult.error
    ? parseIpcError(pendingReviewResult.error)
    : null;
  const stalePendingReview = Boolean(
    pendingReview?.commitId && pendingReview.commitId !== pullRequest.headSha
  );
  const setPendingReview = (review: GitHubPendingPullRequestReview | null) =>
    syncPendingPullRequestReview(queryClient, target, review);
  const saveComment = async (comment: GitHubPullRequestReviewComment, commentId?: number) => {
    const review = await savePendingRepositoryPullRequestReviewComment(target, {
      reviewId: pendingReview?.id,
      commitId: pullRequest.headSha,
      commentId,
      comment,
    });
    setPendingReview(review);
    void markPullRequestReviewThreadsStale(queryClient, target);
  };
  const deleteComment = async (commentId: number) => {
    if (!pendingReview) return;
    const review = await deletePendingRepositoryPullRequestReviewComment(
      target,
      pendingReview.id,
      commentId
    );
    setPendingReview(review);
    void markPullRequestReviewThreadsStale(queryClient, target);
  };

  return (
    <GitHubReactionsProvider repository={repository} subjects={reactionSubjects}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2">
          <p className="text-muted-foreground text-[11px]">
            {data
              ? t("workspace.repositories.changedFileCount", { count: data.files.length })
              : t("workspace.repositories.filesChanged")}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {reviewThreadsResult.isPending || pendingReviewResult.isPending ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px]">
                <Spinner className="size-3" />
                {t("workspace.repositories.reviewThreadsLoading")}
              </span>
            ) : null}
            <Select value={viewType} onValueChange={(value) => setViewType(value as ViewType)}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="unified">{t("workspace.repositories.unifiedDiff")}</SelectItem>
                  <SelectItem value="split">{t("workspace.repositories.splitDiff")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {pullRequest.state === "open" && !pullRequest.merged ? (
              <Button
                type="button"
                size="sm"
                disabled={pendingReviewResult.isPending || Boolean(pendingReviewError)}
                onClick={() => setReviewOpen(true)}
              >
                <ShieldCheck data-icon="inline-start" />
                {t("workspace.repositories.reviewChanges")}
                {comments.length + (pendingReview?.uneditableCommentCount ?? 0) ? (
                  <Badge className="bg-primary-foreground/15 text-primary-foreground ml-1 rounded-sm px-1 py-0 text-[9px]">
                    {comments.length + (pendingReview?.uneditableCommentCount ?? 0)}
                  </Badge>
                ) : null}
              </Button>
            ) : null}
          </div>
        </div>
        <ScrollArea className="min-h-0 min-w-0 flex-1" constrainContentWidth>
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-5 sm:px-5">
            {reviewThreadsError ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.reviewThreadsLoadFailed")}</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{reviewThreadsError.message}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void reviewThreadsResult.refetch()}
                  >
                    <RefreshCw data-icon="inline-start" />
                    {t("workspace.repositories.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {pendingReviewError ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.pendingReviewLoadFailed")}</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{pendingReviewError.message}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void pendingReviewResult.refetch()}
                  >
                    <RefreshCw data-icon="inline-start" />
                    {t("workspace.repositories.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {pendingReview && !pendingReviewError ? (
              <Alert>
                <ShieldCheck />
                <AlertTitle>
                  {t(
                    stalePendingReview
                      ? "workspace.repositories.pendingReviewOutdated"
                      : "workspace.repositories.pendingReviewRestored"
                  )}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    stalePendingReview
                      ? "workspace.repositories.pendingReviewOutdatedDescription"
                      : "workspace.repositories.pendingReviewRestoredDescription",
                    {
                      count: comments.length + (pendingReview.uneditableCommentCount ?? 0),
                    }
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
            {result.isPending ? (
              Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-32 w-full" />
              ))
            ) : error ? (
              <Empty className="min-h-80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileDiff />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.repositories.pullRequestFilesLoadFailed")}</EmptyTitle>
                  <EmptyDescription>{error.message}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" onClick={() => void result.refetch()}>
                    <RefreshCw data-icon="inline-start" />
                    {t("workspace.repositories.retry")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : data?.files.length ? (
              data.files.map((file, index) => (
                <Collapsible
                  key={`${file.sha ?? file.path}-${file.path}`}
                  defaultOpen={index < 2}
                  className="overflow-hidden rounded-lg border"
                >
                  <div className="bg-card/45 flex min-w-0 items-center gap-2 border-b px-2 py-1.5">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="group min-w-0 flex-1 justify-start"
                      >
                        <ChevronDown className="transition-transform group-data-[state=closed]:-rotate-90" />
                        <span className="truncate font-mono text-[11px]">{file.path}</span>
                      </Button>
                    </CollapsibleTrigger>
                    <Badge variant="outline" className="shrink-0 rounded-md text-[9px]">
                      {t(`workspace.repositories.fileStatuses.${file.status}`, {
                        defaultValue: file.status,
                      })}
                    </Badge>
                    <span className="text-success text-[10px]">+{file.additions}</span>
                    <span className="text-destructive text-[10px]">-{file.deletions}</span>
                    {file.blobUrl ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("workspace.repositories.viewSource")}
                            onClick={() => file.blobUrl && void openExternalUrl(file.blobUrl)}
                          >
                            <ExternalLink />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("workspace.repositories.viewSource")}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <CollapsibleContent>
                    <PullRequestFileDiff
                      file={file}
                      viewType={viewType}
                      repository={repository}
                      pullRequest={pullRequest}
                      comments={comments}
                      threads={reviewThreads}
                      canCreateComment={
                        !pendingReviewResult.isPending && !pendingReviewError && !stalePendingReview
                      }
                      onSaveComment={saveComment}
                      onDeleteComment={deleteComment}
                    />
                  </CollapsibleContent>
                </Collapsible>
              ))
            ) : (
              <Empty className="min-h-80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileDiff />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.repositories.noPullRequestFiles")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
            {data ? (
              <GitHubPagination
                page={data.page}
                hasPrevious={data.hasPrevious}
                hasMore={data.hasMore}
                onPageChange={onPageChange}
                ariaLabel={t("workspace.repositories.pullRequestFilePagination")}
              />
            ) : null}
            {reviewThreadsResult.hasNextPage ? (
              <div className="border-border/50 flex justify-center border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={reviewThreadsResult.isFetchingNextPage}
                  onClick={() => void reviewThreadsResult.fetchNextPage()}
                >
                  {reviewThreadsResult.isFetchingNextPage ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  {t(
                    reviewThreadsResult.isFetchingNextPage
                      ? "workspace.repositories.loadingMoreReviewThreads"
                      : "workspace.repositories.loadMoreReviewThreads"
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </ScrollArea>
        <GitHubPullRequestReviewDialog
          repository={repository}
          pullRequest={pullRequest}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          pendingReview={pendingReview}
          onPendingReviewChange={setPendingReview}
        />
      </div>
    </GitHubReactionsProvider>
  );
}
