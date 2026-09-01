import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  MessageSquareReply,
  Pencil,
  ThumbsUp,
  Trash2,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubDiscussionComment, GitHubRepositoryContentContext } from "./github-data";
import {
  createRepositoryDiscussionComment,
  deleteRepositoryDiscussionComment,
  invalidateRepositoryDiscussion,
  syncCreatedDiscussionComment,
  syncDeletedDiscussionComment,
  syncDiscussionAnswer,
  syncDiscussionVote,
  syncUpdatedDiscussionComment,
  updateRepositoryDiscussionAnswer,
  updateRepositoryDiscussionComment,
  updateRepositoryDiscussionUpvote,
  type GitHubDiscussionMutationTarget,
} from "./github-discussion-mutations";
import { formatIssueDate } from "./github-issue-shared";
import { GitHubMarkdownEditor } from "./github-markdown-editor";
import { GitHubReactionBar } from "./github-reaction-bar";
import { GitHubDiscussionCommentMinimizeAction } from "./github-discussion-comment-minimize";

const GitHubReadme = lazy(() => import("./github-readme"));

function DiscussionCommentDeleteDialog({
  comment,
  target,
  open,
  onOpenChange,
}: {
  comment: GitHubDiscussionComment;
  target: GitHubDiscussionMutationTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preservesThread = comment.replies.length > 0 || comment.repliesHaveMore;
  const mutation = useMutation({
    mutationFn: () => deleteRepositoryDiscussionComment(target, comment.id),
    onSuccess: (deletion) => {
      syncDeletedDiscussionComment(queryClient, target, deletion);
      toast.success(t("workspace.repositories.discussionCommentDeleted"));
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
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent size="sm" aria-busy={mutation.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace.repositories.deleteDiscussionCommentTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              preservesThread
                ? "workspace.repositories.deleteDiscussionCommentWithRepliesDescription"
                : "workspace.repositories.deleteDiscussionCommentDescription"
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
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
                ? "workspace.repositories.deletingDiscussionComment"
                : "workspace.repositories.deleteDiscussionComment"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function authorInitial(author: string | undefined) {
  return author?.trim().charAt(0).toUpperCase() || "?";
}

function DiscussionCommentEditor({
  repository,
  target,
  comment,
  replyToId,
  onCancel,
}: {
  repository: GitHubRepositoryContentContext;
  target: GitHubDiscussionMutationTarget;
  comment?: GitHubDiscussionComment;
  replyToId?: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState(comment?.body ?? "");
  const [submitted, setSubmitted] = useState(false);
  const invalid = submitted && !body.trim();
  const mutation = useMutation({
    mutationFn: () =>
      comment
        ? updateRepositoryDiscussionComment(comment.id, body)
        : createRepositoryDiscussionComment(target, body, replyToId),
    onSuccess: (updatedComment) => {
      if (comment) {
        syncUpdatedDiscussionComment(queryClient, target, updatedComment);
      } else {
        syncCreatedDiscussionComment(queryClient, target, updatedComment, replyToId);
      }
      toast.success(
        t(
          comment
            ? "workspace.repositories.discussionCommentUpdated"
            : replyToId
              ? "workspace.repositories.discussionReplyPosted"
              : "workspace.repositories.discussionCommentPosted"
        )
      );
      onCancel();
      void invalidateRepositoryDiscussion(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <form
      className="bg-muted/10 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (body.trim() && !mutation.isPending) mutation.mutate();
      }}
    >
      <FieldGroup className="gap-3">
        <Field data-invalid={invalid || Boolean(error)} data-disabled={mutation.isPending}>
          <FieldLabel
            htmlFor={`discussion-comment-${comment?.id ?? replyToId ?? "new"}`}
            className="sr-only"
          >
            {t("workspace.repositories.discussionComment")}
          </FieldLabel>
          <GitHubMarkdownEditor
            id={`discussion-comment-${comment?.id ?? replyToId ?? "new"}`}
            name="body"
            value={body}
            repository={repository}
            reference={repository.defaultBranch}
            placeholder={t("workspace.repositories.discussionCommentPlaceholder")}
            disabled={mutation.isPending}
            invalid={invalid || Boolean(error)}
            minHeightClassName="min-h-24"
            onChange={(value) => {
              setBody(value);
              if (value.trim()) setSubmitted(false);
              if (mutation.isError) mutation.reset();
            }}
          />
          <FieldError>
            {invalid
              ? t("workspace.repositories.discussionCommentRequired")
              : error?.code === "githubPermission"
                ? t("workspace.repositories.discussionWritePermissionDenied")
                : error?.message}
          </FieldError>
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={mutation.isPending}
            onClick={onCancel}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button type="submit" size="xs" disabled={mutation.isPending || !body.trim()}>
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t(
              mutation.isPending
                ? "workspace.repositories.savingDiscussionComment"
                : comment
                  ? "workspace.repositories.saveChanges"
                  : "workspace.repositories.postDiscussionComment"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function GitHubDiscussionCommentCard({
  repository,
  target,
  comment,
  canReply,
  nested = false,
}: {
  repository: GitHubRepositoryContentContext;
  target: GitHubDiscussionMutationTarget;
  comment: GitHubDiscussionComment;
  canReply: boolean;
  nested?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(!comment.isMinimized);
  const deleted = Boolean(comment.deletedAt);
  const voteMutation = useMutation({
    mutationFn: () => updateRepositoryDiscussionUpvote(comment.id, !comment.viewerHasUpvoted),
    onSuccess: (vote) => syncDiscussionVote(queryClient, target, vote),
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t("workspace.repositories.discussionVoteFailed"), {
        description:
          parsed.code === "githubPermission"
            ? t("workspace.repositories.discussionWritePermissionDenied")
            : parsed.message,
      });
    },
  });
  const answerMutation = useMutation({
    mutationFn: () => updateRepositoryDiscussionAnswer(comment.id, !comment.isAnswer),
    onSuccess: (discussion) => {
      syncDiscussionAnswer(queryClient, target, discussion);
      void invalidateRepositoryDiscussion(queryClient, target);
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t("workspace.repositories.discussionAnswerFailed"), {
        description:
          parsed.code === "githubPermission"
            ? t("workspace.repositories.discussionWritePermissionDenied")
            : parsed.message,
      });
    },
  });
  const minimizedCopy = comment.minimizedReason
    ? t("workspace.repositories.discussionCommentMinimizedReason", {
        reason: comment.minimizedReason,
      })
    : t("workspace.repositories.discussionCommentMinimized");

  useEffect(() => {
    setCommentOpen(!comment.isMinimized);
  }, [comment.isMinimized]);

  return (
    <article
      className={
        nested
          ? "bg-card/20 overflow-hidden rounded-md border"
          : "bg-card/30 overflow-hidden rounded-lg border"
      }
    >
      <header className="bg-card/40 flex min-h-11 min-w-0 items-center gap-2 border-b px-3.5 py-2">
        <Avatar size="sm">
          {comment.authorAvatarUrl ? (
            <AvatarImage src={comment.authorAvatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : null}
          <AvatarFallback>{authorInitial(comment.author)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-xs font-medium">
          {deleted
            ? t("workspace.repositories.deletedDiscussionCommentAuthor")
            : comment.author
              ? `@${comment.author}`
              : t("workspace.repositories.unknownActor")}
        </span>
        {!deleted && comment.authorAssociation !== "NONE" ? (
          <Badge variant="outline" className="h-5 rounded-md text-[9px] font-normal">
            {comment.authorAssociation.toLowerCase()}
          </Badge>
        ) : null}
        {comment.isAnswer ? (
          <Badge variant="secondary" className="h-5 rounded-md text-[9px] font-normal">
            <CheckCircle2 /> {t("workspace.repositories.discussionAnswer")}
          </Badge>
        ) : null}
        <time
          dateTime={comment.createdAt}
          className="text-muted-foreground ml-auto shrink-0 text-[9px]"
        >
          {formatIssueDate(comment.createdAt, i18n.language)}
        </time>
        {!deleted ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("workspace.repositories.openDiscussionCommentOnGitHub")}
            onClick={() => void openExternalUrl(comment.url)}
          >
            <ExternalLink />
          </Button>
        ) : null}
      </header>

      <Collapsible open={commentOpen} onOpenChange={setCommentOpen}>
        {comment.isMinimized ? (
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="m-2">
              <ChevronDown data-icon="inline-start" />
              {minimizedCopy}
            </Button>
          </CollapsibleTrigger>
        ) : null}
        <CollapsibleContent>
          {deleted ? (
            <p className="text-muted-foreground px-4 py-4 text-[12px] italic">
              {t("workspace.repositories.deletedDiscussionComment")}
            </p>
          ) : (
            <div className="harbor-markdown min-w-0 px-4 py-4 text-[12px]">
              <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                <GitHubReadme
                  content={comment.body}
                  path=""
                  reference={repository.defaultBranch}
                  repository={repository}
                  onOpenExternal={(url) => void openExternalUrl(url)}
                />
              </Suspense>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <footer className="flex flex-wrap items-center gap-1 border-t px-3 py-2">
        {!deleted ? (
          <GitHubReactionBar subject={{ id: comment.id, kind: "discussionComment" }} />
        ) : null}
        {!deleted ? (
          <Button
            type="button"
            variant={comment.viewerHasUpvoted ? "secondary" : "ghost"}
            size="xs"
            disabled={!comment.viewerCanUpvote || voteMutation.isPending}
            onClick={() => voteMutation.mutate()}
          >
            {voteMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ThumbsUp data-icon="inline-start" />
            )}
            {comment.upvoteCount}
          </Button>
        ) : null}
        {!nested && canReply ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setReplying((value) => !value)}
          >
            <MessageSquareReply data-icon="inline-start" />
            {t("workspace.repositories.reply")}
          </Button>
        ) : null}
        {!deleted && comment.viewerCanUpdate ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setEditing((value) => !value)}
          >
            <Pencil data-icon="inline-start" />
            {t("workspace.repositories.edit")}
          </Button>
        ) : null}
        {!deleted && (comment.viewerCanMarkAsAnswer || comment.viewerCanUnmarkAsAnswer) ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={answerMutation.isPending}
            onClick={() => answerMutation.mutate()}
          >
            {answerMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CheckCircle2 data-icon="inline-start" />
            )}
            {t(
              comment.isAnswer
                ? "workspace.repositories.unmarkDiscussionAnswer"
                : "workspace.repositories.markDiscussionAnswer"
            )}
          </Button>
        ) : null}
        {!deleted ? (
          <GitHubDiscussionCommentMinimizeAction comment={comment} target={target} />
        ) : null}
        {!deleted && comment.viewerCanDelete ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => setDeleteOpen(true)}>
            <Trash2 data-icon="inline-start" />
            {t("workspace.repositories.delete")}
          </Button>
        ) : null}
      </footer>

      {!deleted && editing ? (
        <DiscussionCommentEditor
          repository={repository}
          target={target}
          comment={comment}
          onCancel={() => setEditing(false)}
        />
      ) : null}
      {replying ? (
        <DiscussionCommentEditor
          repository={repository}
          target={target}
          replyToId={comment.id}
          onCancel={() => setReplying(false)}
        />
      ) : null}
      {comment.replies.length ? (
        <div className="bg-muted/5 flex flex-col gap-2 border-t px-3 py-3 pl-7">
          {comment.replies.map((reply) => (
            <GitHubDiscussionCommentCard
              key={reply.id}
              repository={repository}
              target={target}
              comment={reply}
              canReply={false}
              nested
            />
          ))}
        </div>
      ) : null}
      {comment.repliesHaveMore ? (
        <Alert className="rounded-none border-x-0 border-b-0">
          <UserRound />
          <AlertDescription>
            {t("workspace.repositories.moreDiscussionRepliesOnGitHub")}
          </AlertDescription>
        </Alert>
      ) : null}
      <DiscussionCommentDeleteDialog
        comment={comment}
        target={target}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </article>
  );
}

export { DiscussionCommentEditor };
