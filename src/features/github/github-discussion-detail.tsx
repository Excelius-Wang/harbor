import { lazy, Suspense, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  RotateCcw,
  ThumbsUp,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubDiscussionCategory,
  GitHubDiscussionCloseReason,
  GitHubDiscussionComment,
  GitHubDiscussionSummary,
  GitHubReactionSubjectRef,
  GitHubRepositoryContentContext,
} from "./github-data";
import { DiscussionCommentEditor, GitHubDiscussionCommentCard } from "./github-discussion-comment";
import { GitHubReactionBar } from "./github-reaction-bar";
import { GitHubReactionsProvider } from "./github-reactions-provider";
import { GitHubDiscussionFormDialog } from "./github-discussion-form-dialog";
import { GitHubDiscussionPollCard } from "./github-discussion-poll";
import {
  deleteRepositoryDiscussion,
  invalidateRepositoryDiscussion,
  invalidateRepositoryDiscussions,
  syncDeletedDiscussion,
  syncDiscussionVote,
  syncUpdatedDiscussion,
  updateRepositoryDiscussionState,
  updateRepositoryDiscussionUpvote,
  type GitHubDiscussionMutationTarget,
} from "./github-discussion-mutations";
import { formatIssueDate } from "./github-issue-shared";
import { discussionCategoriesQueryOptions, discussionDetailQueryOptions } from "./github-queries";

const GitHubReadme = lazy(() => import("./github-readme"));

function discussionReactionSubjects(
  discussion: GitHubDiscussionSummary | undefined,
  comments: GitHubDiscussionComment[]
) {
  const subjects: GitHubReactionSubjectRef[] = discussion
    ? [{ id: discussion.id, kind: "discussion" }]
    : [];
  const visit = (comment: GitHubDiscussionComment) => {
    if (!comment.deletedAt) subjects.push({ id: comment.id, kind: "discussionComment" });
    for (const reply of comment.replies) visit(reply);
  };
  for (const comment of comments) visit(comment);
  return subjects;
}

function DiscussionDeleteDialog({
  discussion,
  target,
  open,
  onOpenChange,
  onDeleted,
}: {
  discussion: GitHubDiscussionSummary;
  target: GitHubDiscussionMutationTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteRepositoryDiscussion(target),
    onSuccess: (deletion) => {
      syncDeletedDiscussion(queryClient, target, deletion);
      toast.success(t("workspace.repositories.discussionDeleted"));
      onOpenChange(false);
      onDeleted();
      void invalidateRepositoryDiscussions(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const setOpen = (nextOpen: boolean) => {
    if (mutation.isPending) return;
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent aria-busy={mutation.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("workspace.repositories.deleteDiscussionTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.deleteDiscussionDescription", {
              title: discussion.title,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.deleteDiscussionFailed")}</AlertTitle>
            <AlertDescription>
              {error.code === "githubPermission"
                ? t("workspace.repositories.discussionWritePermissionDenied")
                : error.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("workspace.repositories.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
            {t(
              mutation.isPending
                ? "workspace.repositories.deletingDiscussion"
                : "workspace.repositories.deleteDiscussion"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DiscussionStateDialog({
  discussion,
  target,
  open,
  onOpenChange,
}: {
  discussion: GitHubDiscussionSummary;
  target: GitHubDiscussionMutationTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<GitHubDiscussionCloseReason>("resolved");
  const mutation = useMutation({
    mutationFn: () => updateRepositoryDiscussionState(target, "closed", reason),
    onSuccess: (updatedDiscussion) => {
      syncUpdatedDiscussion(queryClient, target, updatedDiscussion);
      toast.success(t("workspace.repositories.discussionClosed"));
      onOpenChange(false);
      void invalidateRepositoryDiscussion(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const setOpen = (nextOpen: boolean) => {
    if (mutation.isPending) return;
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.closeDiscussionTitle")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.closeDiscussionDescription", {
              title: discussion.title,
            })}
          </DialogDescription>
        </DialogHeader>
        <Field data-disabled={mutation.isPending}>
          <FieldLabel htmlFor="discussion-close-reason">
            {t("workspace.repositories.discussionCloseReason")}
          </FieldLabel>
          <Select
            value={reason}
            disabled={mutation.isPending}
            onValueChange={(value) => {
              setReason(value as GitHubDiscussionCloseReason);
              if (mutation.isError) mutation.reset();
            }}
          >
            <SelectTrigger id="discussion-close-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="resolved">
                  {t("workspace.repositories.discussionCloseReasons.resolved")}
                </SelectItem>
                <SelectItem value="outdated">
                  {t("workspace.repositories.discussionCloseReasons.outdated")}
                </SelectItem>
                <SelectItem value="duplicate">
                  {t("workspace.repositories.discussionCloseReasons.duplicate")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.discussionStateChangeFailed")}</AlertTitle>
            <AlertDescription>
              {error.code === "githubPermission"
                ? t("workspace.repositories.discussionWritePermissionDenied")
                : error.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setOpen(false)}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CheckCircle2 data-icon="inline-start" />
            )}
            {t(
              mutation.isPending
                ? "workspace.repositories.closingDiscussion"
                : "workspace.repositories.closeDiscussion"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GitHubDiscussionDetail({
  repository,
  discussionNumber,
  categories,
  onBack,
  backLabel,
}: {
  repository: GitHubRepositoryContentContext;
  discussionNumber: number;
  categories?: GitHubDiscussionCategory[];
  onBack: () => void;
  backLabel?: string;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    discussionNumber,
  };
  const categoriesResult = useQuery({
    ...discussionCategoriesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    }),
    enabled: categories === undefined,
  });
  const availableCategories = categories ?? categoriesResult.data?.categories ?? [];
  const result = useInfiniteQuery(discussionDetailQueryOptions(target));
  const discussion = result.data?.pages[0]?.discussion;
  const poll = result.data?.pages[0]?.poll ?? undefined;
  const comments = useMemo(() => {
    const byId = new Map<string, GitHubDiscussionComment>();
    for (const page of result.data?.pages ?? []) {
      for (const comment of page.comments) {
        if (!byId.has(comment.id)) byId.set(comment.id, comment);
      }
    }
    return [...byId.values()];
  }, [result.data?.pages]);
  const reactionSubjects = useMemo(
    () => discussionReactionSubjects(discussion, comments),
    [comments, discussion]
  );
  const error = !discussion && result.error ? parseIpcError(result.error) : null;
  const supplementalError =
    discussion && result.error
      ? { source: "discussion" as const, error: parseIpcError(result.error) }
      : categoriesResult.error
        ? { source: "categories" as const, error: parseIpcError(categoriesResult.error) }
        : null;
  const voteMutation = useMutation({
    mutationFn: () =>
      updateRepositoryDiscussionUpvote(discussion?.id ?? "", !discussion?.viewerHasUpvoted),
    onSuccess: (vote) => syncDiscussionVote(queryClient, target, vote),
    onError: (reason) => {
      const parsed = parseIpcError(reason);
      toast.error(t("workspace.repositories.discussionVoteFailed"), {
        description:
          parsed.code === "githubPermission"
            ? t("workspace.repositories.discussionWritePermissionDenied")
            : parsed.message,
      });
    },
  });
  const reopenMutation = useMutation({
    mutationFn: () => updateRepositoryDiscussionState(target, "open"),
    onSuccess: (updatedDiscussion) => {
      syncUpdatedDiscussion(queryClient, target, updatedDiscussion);
      toast.success(t("workspace.repositories.discussionReopened"));
      void invalidateRepositoryDiscussion(queryClient, target);
    },
    onError: (reason) => {
      const parsed = parseIpcError(reason);
      toast.error(t("workspace.repositories.discussionStateChangeFailed"), {
        description:
          parsed.code === "githubPermission"
            ? t("workspace.repositories.discussionWritePermissionDenied")
            : parsed.message,
      });
    },
  });
  const canComment = discussion?.state === "open" && !discussion.locked;

  return (
    <div className="@container/discussions flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center gap-3 border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {backLabel ?? t("workspace.repositories.backToDiscussions")}
        </Button>
        {result.isFetching && !result.isFetchingNextPage ? (
          <RefreshCw className="text-muted-foreground size-3 animate-spin" />
        ) : null}
      </div>
      {supplementalError ? (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 px-4 py-2">
          <TriangleAlert />
          <AlertDescription className="flex min-w-0 items-center gap-3 text-[11px]">
            <span className="min-w-0 flex-1 truncate">{supplementalError.error.message}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() =>
                void (supplementalError.source === "discussion"
                  ? result.refetch()
                  : categoriesResult.refetch())
              }
            >
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {result.isPending ? (
          <div className="mx-auto flex w-full max-w-[1050px] flex-col gap-4 p-5">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error || !discussion ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircle />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.discussionDetailLoadFailed")}</EmptyTitle>
              <EmptyDescription>{error?.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void result.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <GitHubReactionsProvider repository={repository} subjects={reactionSubjects}>
            <div className="mx-auto w-full max-w-[1050px] px-4 py-5 sm:px-5">
              <header className="mb-5 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      <span aria-hidden="true">{discussion.category.emoji}</span>
                      {discussion.category.name}
                    </Badge>
                    <Badge variant={discussion.state === "open" ? "outline" : "secondary"}>
                      {discussion.state === "open" ? <MessageCircle /> : <CheckCircle2 />}
                      {t(`workspace.repositories.discussionStates.${discussion.state}`)}
                    </Badge>
                    {discussion.answerId ? (
                      <Badge variant="secondary">
                        <CheckCircle2 /> {t("workspace.repositories.answered")}
                      </Badge>
                    ) : null}
                    {discussion.locked ? (
                      <Badge variant="outline">
                        <LockKeyhole /> {t("workspace.repositories.lockedConversation")}
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em]">
                    {discussion.title}{" "}
                    <span className="text-muted-foreground font-normal">#{discussion.number}</span>
                  </h2>
                  <p className="text-muted-foreground mt-2 text-[11px]">
                    {t("workspace.repositories.discussionStartedBy", {
                      author: discussion.author
                        ? `@${discussion.author}`
                        : t("workspace.repositories.unknownActor"),
                      date: formatIssueDate(discussion.createdAt, i18n.language),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={discussion.viewerHasUpvoted ? "secondary" : "outline"}
                    size="sm"
                    disabled={!discussion.viewerCanUpvote || voteMutation.isPending}
                    onClick={() => voteMutation.mutate()}
                  >
                    {voteMutation.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <ThumbsUp data-icon="inline-start" />
                    )}
                    {discussion.upvoteCount}
                  </Button>
                  {discussion.viewerCanUpdate ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!availableCategories.length}
                      onClick={() => setEditing(true)}
                    >
                      <Pencil data-icon="inline-start" />
                      {t("workspace.repositories.editDiscussion")}
                    </Button>
                  ) : null}
                  {discussion.state === "open" && discussion.viewerCanClose ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCloseOpen(true)}
                    >
                      <CheckCircle2 data-icon="inline-start" />
                      {t("workspace.repositories.closeDiscussion")}
                    </Button>
                  ) : discussion.state === "closed" && discussion.viewerCanReopen ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={reopenMutation.isPending}
                      onClick={() => reopenMutation.mutate()}
                    >
                      {reopenMutation.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <RotateCcw data-icon="inline-start" />
                      )}
                      {t("workspace.repositories.reopenDiscussion")}
                    </Button>
                  ) : null}
                  {discussion.viewerCanDelete ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 data-icon="inline-start" />
                      {t("workspace.repositories.deleteDiscussion")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openExternalUrl(discussion.url)}
                  >
                    <ExternalLink data-icon="inline-end" />
                    {t("workspace.openOnGitHub")}
                  </Button>
                </div>
              </header>

              <article className="bg-card/30 overflow-hidden rounded-lg border">
                <header className="bg-card/40 flex min-h-11 items-center gap-2 border-b px-3.5 py-2 text-xs font-medium">
                  {discussion.author
                    ? `@${discussion.author}`
                    : t("workspace.repositories.unknownActor")}
                  <span className="text-muted-foreground ml-auto text-[10px]">
                    {formatIssueDate(discussion.updatedAt, i18n.language)}
                  </span>
                </header>
                <div className="harbor-markdown min-h-24 px-4 py-4 text-[12px]">
                  <Suspense fallback={<Skeleton className="h-20 w-full" />}>
                    <GitHubReadme
                      content={discussion.body}
                      path=""
                      reference={repository.defaultBranch}
                      repository={repository}
                      onOpenExternal={(url) => void openExternalUrl(url)}
                    />
                  </Suspense>
                </div>
                <footer className="flex min-h-10 items-center border-t px-3 py-1.5">
                  <GitHubReactionBar subject={{ id: discussion.id, kind: "discussion" }} />
                </footer>
              </article>

              {poll ? (
                <GitHubDiscussionPollCard repository={repository} target={target} poll={poll} />
              ) : null}

              <div className="mt-5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {t("workspace.repositories.discussionComments", {
                    count: discussion.commentCount,
                  })}
                </h3>
                {canComment ? (
                  <Button type="button" size="sm" onClick={() => setCommenting((value) => !value)}>
                    <MessageSquarePlus data-icon="inline-start" />
                    {t("workspace.repositories.addDiscussionComment")}
                  </Button>
                ) : null}
              </div>
              {commenting ? (
                <div className="mt-3 overflow-hidden rounded-lg border">
                  <DiscussionCommentEditor
                    repository={repository}
                    target={target}
                    onCancel={() => setCommenting(false)}
                  />
                </div>
              ) : null}
              <div className="mt-3 flex flex-col gap-3">
                {comments.map((comment) => (
                  <GitHubDiscussionCommentCard
                    key={comment.id}
                    repository={repository}
                    target={target}
                    comment={comment}
                    canReply={Boolean(canComment)}
                  />
                ))}
                {!comments.length ? (
                  <Empty className="min-h-48 rounded-lg border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <MessageCircle />
                      </EmptyMedia>
                      <EmptyTitle>{t("workspace.repositories.noDiscussionComments")}</EmptyTitle>
                      <EmptyDescription>
                        {t("workspace.repositories.noDiscussionCommentsDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : null}
                {result.hasNextPage ? (
                  <div className="flex justify-center pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={result.isFetchingNextPage}
                      onClick={() => void result.fetchNextPage()}
                    >
                      {result.isFetchingNextPage ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <MessageCircle data-icon="inline-start" />
                      )}
                      {t("workspace.repositories.loadMoreDiscussionComments")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </GitHubReactionsProvider>
        )}
      </ScrollArea>
      {discussion ? (
        <>
          <GitHubDiscussionFormDialog
            repository={repository}
            categories={availableCategories}
            discussion={discussion}
            open={editing}
            onOpenChange={setEditing}
          />
          <DiscussionStateDialog
            discussion={discussion}
            target={target}
            open={closeOpen}
            onOpenChange={setCloseOpen}
          />
          <DiscussionDeleteDialog
            discussion={discussion}
            target={target}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={onBack}
          />
        </>
      ) : null}
    </div>
  );
}
