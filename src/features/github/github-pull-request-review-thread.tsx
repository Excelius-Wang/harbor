import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  History,
  MessageSquareReply,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubPullRequestReviewThread,
  GitHubPullRequestReviewThreadComment,
  GitHubRepositoryContentContext,
} from "./github-data";
import { formatIssueDate } from "./github-issue-shared";
import { GitHubMarkdownEditor } from "./github-markdown-editor";
import { GitHubReactionBar } from "./github-reaction-bar";
import {
  markPullRequestReviewThreadsStale,
  replyToPullRequestReviewThread,
  resolvePullRequestReviewThread,
  syncPullRequestReviewThreadReply,
  syncPullRequestReviewThreadState,
  type GitHubPullRequestMutationTarget,
  unresolvePullRequestReviewThread,
} from "./github-pull-request-mutations";

const GitHubReadme = lazy(() => import("./github-readme"));

function authorInitial(author: string) {
  return author.trim().charAt(0).toUpperCase() || "?";
}

function ReviewThreadComment({
  comment,
  repository,
  reference,
  path,
}: {
  comment: GitHubPullRequestReviewThreadComment;
  repository: GitHubRepositoryContentContext;
  reference: string;
  path: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <article className="min-w-0 border-b last:border-b-0">
      <header className="bg-card/50 flex min-h-10 min-w-0 items-center gap-2 px-3 py-2">
        <Avatar size="sm">
          {comment.authorAvatarUrl ? (
            <AvatarImage src={comment.authorAvatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : null}
          <AvatarFallback>{authorInitial(comment.author)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-[11px] font-medium">{comment.author}</span>
        {comment.authorAssociation && comment.authorAssociation !== "NONE" ? (
          <Badge variant="outline" className="h-4 rounded-sm px-1 text-[8px] font-normal">
            {comment.authorAssociation.toLowerCase()}
          </Badge>
        ) : null}
        {comment.pending ? (
          <Badge variant="outline" className="h-4 rounded-sm px-1 text-[8px] font-normal">
            {t("workspace.repositories.pendingReviewComment")}
          </Badge>
        ) : null}
        <time
          dateTime={comment.createdAt}
          className="text-muted-foreground ml-auto shrink-0 text-[9px]"
        >
          {formatIssueDate(comment.createdAt, i18n.language)}
        </time>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("workspace.repositories.openReviewCommentOnGitHub")}
          onClick={() => void openExternalUrl(comment.url)}
        >
          <ExternalLink />
        </Button>
      </header>
      <div className="harbor-markdown min-w-0 px-3 py-3 text-[12px]">
        <Suspense fallback={<Skeleton className="h-10 w-full" />}>
          <GitHubReadme
            content={comment.body}
            path={path}
            reference={reference}
            repository={repository}
            onOpenExternal={(url) => void openExternalUrl(url)}
          />
        </Suspense>
      </div>
      {!comment.pending ? (
        <footer className="flex min-h-9 items-center border-t px-3 py-1">
          <GitHubReactionBar subject={{ id: comment.id, kind: "pullRequestReviewComment" }} />
        </footer>
      ) : null}
    </article>
  );
}

function ReviewThreadReplyForm({
  thread,
  target,
  repository,
  reference,
  onCancel,
}: {
  thread: GitHubPullRequestReviewThread;
  target: GitHubPullRequestMutationTarget;
  repository: GitHubRepositoryContentContext;
  reference: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const invalid = submitted && !body.trim();
  const mutation = useMutation({
    mutationFn: () => replyToPullRequestReviewThread(thread.id, body),
    onSuccess: (comment) => {
      syncPullRequestReviewThreadReply(queryClient, target, thread.id, comment);
      void markPullRequestReviewThreadsStale(queryClient, target);
      setBody("");
      setSubmitted(false);
      onCancel();
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <form
      className="bg-muted/10 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (!body.trim()) return;
        mutation.mutate();
      }}
    >
      <FieldGroup className="gap-3">
        <Field data-invalid={invalid} data-disabled={mutation.isPending}>
          <FieldLabel htmlFor={`review-thread-${thread.id}-reply`} className="sr-only">
            {t("workspace.repositories.reviewThreadReply")}
          </FieldLabel>
          <GitHubMarkdownEditor
            id={`review-thread-${thread.id}-reply`}
            name="body"
            value={body}
            repository={repository}
            reference={reference}
            placeholder={t("workspace.repositories.reviewThreadReplyPlaceholder")}
            disabled={mutation.isPending}
            invalid={invalid}
            minHeightClassName="min-h-20"
            onChange={(value) => {
              setBody(value);
              if (value.trim()) setSubmitted(false);
              if (mutation.isError) mutation.reset();
            }}
          />
          <FieldError>
            {invalid ? t("workspace.repositories.reviewThreadReplyRequired") : null}
          </FieldError>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.reviewThreadReplyFailed")}</AlertTitle>
            <AlertDescription>
              {error.code === "githubPermission"
                ? t("workspace.repositories.pullRequestWritePermissionDenied")
                : error.message}
            </AlertDescription>
          </Alert>
        ) : null}
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
                ? "workspace.repositories.sendingReviewThreadReply"
                : "workspace.repositories.sendReviewThreadReply"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function GitHubPullRequestReviewThreadView({
  thread,
  repository,
  reference,
  pullRequestUrl,
  pullRequestNumber,
  compact = false,
}: {
  thread: GitHubPullRequestReviewThread;
  repository: GitHubRepositoryContentContext;
  reference: string;
  pullRequestUrl: string;
  pullRequestNumber: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const defaultOpen = !thread.isResolved && !thread.isOutdated && !thread.isCollapsed;
  const [open, setOpen] = useState(defaultOpen);
  const [replyOpen, setReplyOpen] = useState(false);
  const locationLine = thread.line ?? thread.originalLine;
  const target = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber,
  };
  const resolutionMutation = useMutation({
    mutationFn: (resolved: boolean) =>
      resolved
        ? resolvePullRequestReviewThread(thread.id)
        : unresolvePullRequestReviewThread(thread.id),
    onSuccess: (state) => {
      syncPullRequestReviewThreadState(queryClient, target, state);
      void markPullRequestReviewThreadsStale(queryClient, target);
    },
  });
  const resolutionError = resolutionMutation.error ? parseIpcError(resolutionMutation.error) : null;

  useEffect(() => {
    setOpen(!thread.isResolved && !thread.isOutdated && !thread.isCollapsed);
    if (thread.isResolved) setReplyOpen(false);
  }, [thread.isCollapsed, thread.isOutdated, thread.isResolved]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="bg-background/90 group/review-thread min-w-0 overflow-hidden rounded-md border shadow-sm"
    >
      <div className="bg-card/70 flex min-h-10 min-w-0 items-center gap-2 border-b px-2 py-1.5">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="min-w-0 flex-1 justify-start px-1.5"
          >
            <ChevronDown className="shrink-0 transition-transform group-data-[state=closed]/review-thread:-rotate-90" />
            {thread.isResolved ? (
              <CheckCircle2 className="text-success shrink-0" />
            ) : thread.isOutdated ? (
              <History className="text-muted-foreground shrink-0" />
            ) : (
              <MessageSquareText className="text-primary shrink-0" />
            )}
            <span className="truncate text-[10px] font-medium">
              {compact
                ? t("workspace.repositories.reviewConversation")
                : thread.subjectType === "file"
                  ? t("workspace.repositories.fileReviewConversation")
                  : t("workspace.repositories.lineReviewConversation", {
                      line: locationLine,
                    })}
            </span>
            <span className="text-muted-foreground shrink-0 text-[9px]">
              {t("workspace.repositories.reviewReplyCount", {
                count: thread.comments.length,
              })}
            </span>
          </Button>
        </CollapsibleTrigger>
        {thread.isResolved ? (
          <Badge className="bg-success/10 text-success border-success/25 h-5 rounded-sm px-1.5 text-[9px]">
            {t("workspace.repositories.resolvedConversation")}
          </Badge>
        ) : null}
        {thread.isOutdated ? (
          <Badge variant="secondary" className="h-5 rounded-sm px-1.5 text-[9px]">
            {t("workspace.repositories.outdatedConversation")}
          </Badge>
        ) : null}
      </div>
      <CollapsibleContent>
        {thread.resolvedBy ? (
          <p className="text-muted-foreground border-b px-3 py-2 text-[10px]">
            {t("workspace.repositories.resolvedConversationBy", {
              author: thread.resolvedBy,
            })}
          </p>
        ) : null}
        {thread.comments.map((comment) => (
          <ReviewThreadComment
            key={comment.id}
            comment={comment}
            repository={repository}
            reference={reference}
            path={thread.path}
          />
        ))}
        {thread.commentsHaveMore ? (
          <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
            <p className="text-muted-foreground text-[10px]">
              {t("workspace.repositories.moreReviewRepliesOnGitHub")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void openExternalUrl(pullRequestUrl)}
            >
              <ExternalLink data-icon="inline-start" />
              {t("workspace.repositories.openOnGitHub")}
            </Button>
          </div>
        ) : null}
        {resolutionError ? (
          <Alert variant="destructive" className="rounded-none border-x-0 border-b-0">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.reviewThreadStateFailed")}</AlertTitle>
            <AlertDescription>
              {resolutionError.code === "githubPermission"
                ? t("workspace.repositories.pullRequestWritePermissionDenied")
                : resolutionError.message}
            </AlertDescription>
          </Alert>
        ) : null}
        {replyOpen ? (
          <ReviewThreadReplyForm
            thread={thread}
            target={target}
            repository={repository}
            reference={reference}
            onCancel={() => setReplyOpen(false)}
          />
        ) : thread.viewerCanReply || thread.viewerCanResolve || thread.viewerCanUnresolve ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2">
            {thread.viewerCanReply ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={resolutionMutation.isPending}
                onClick={() => {
                  setReplyOpen(true);
                  resolutionMutation.reset();
                }}
              >
                <MessageSquareReply data-icon="inline-start" />
                {t("workspace.repositories.reviewThreadReply")}
              </Button>
            ) : null}
            {!thread.isResolved && thread.viewerCanResolve ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={resolutionMutation.isPending}
                onClick={() => resolutionMutation.mutate(true)}
              >
                {resolutionMutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <CheckCircle2 data-icon="inline-start" />
                )}
                {t(
                  resolutionMutation.isPending
                    ? "workspace.repositories.resolvingReviewThread"
                    : "workspace.repositories.resolveReviewThread"
                )}
              </Button>
            ) : null}
            {thread.isResolved && thread.viewerCanUnresolve ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={resolutionMutation.isPending}
                onClick={() => resolutionMutation.mutate(false)}
              >
                {resolutionMutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RotateCcw data-icon="inline-start" />
                )}
                {t(
                  resolutionMutation.isPending
                    ? "workspace.repositories.unresolvingReviewThread"
                    : "workspace.repositories.unresolveReviewThread"
                )}
              </Button>
            ) : null}
          </footer>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
