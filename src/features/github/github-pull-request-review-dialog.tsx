import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, MessageSquareText, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubPendingPullRequestReview,
  GitHubPullRequest,
  GitHubPullRequestRepository,
  GitHubPullRequestReviewAction,
} from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";
import {
  createRepositoryPullRequestReview,
  deletePendingRepositoryPullRequestReview,
  invalidateRepositoryPullRequest,
  markPullRequestReviewThreadsStale,
  savePendingRepositoryPullRequestReview,
  submitPendingRepositoryPullRequestReview,
  syncCreatedPullRequestReview,
} from "./github-pull-request-mutations";

const REVIEW_ACTIONS: GitHubPullRequestReviewAction[] = ["comment", "approve", "requestChanges"];

function GitHubPullRequestReviewForm({
  repository,
  pullRequest,
  pendingReview,
  onPendingReviewChange,
  onCancel,
  onComplete,
  onPendingChange,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
  pendingReview: GitHubPendingPullRequestReview | null;
  onPendingReviewChange: (review: GitHubPendingPullRequestReview | null) => void;
  onCancel: () => void;
  onComplete: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<GitHubPullRequestReviewAction>("comment");
  const [body, setBody] = useState(pendingReview?.body ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const bodyRequired = action !== "approve";
  const bodyInvalid = submitted && bodyRequired && !body.trim();
  const target = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const submitMutation = useMutation({
    mutationFn: () =>
      pendingReview
        ? submitPendingRepositoryPullRequestReview(target, pendingReview.id, body, action)
        : createRepositoryPullRequestReview(target, pullRequest.headSha, body, action),
    onSuccess: (review) => {
      syncCreatedPullRequestReview(queryClient, target, review);
      onPendingReviewChange(null);
      toast.success(t("workspace.repositories.reviewSubmitted"));
      onComplete();
      void invalidateRepositoryPullRequest(queryClient, target);
    },
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      savePendingRepositoryPullRequestReview(target, {
        reviewId: pendingReview?.id,
        commitId: pullRequest.headSha,
        body,
      }),
    onSuccess: (review) => {
      onPendingReviewChange(review);
      toast.success(t("workspace.repositories.pendingReviewSaved"));
    },
  });
  const discardMutation = useMutation({
    mutationFn: () =>
      pendingReview
        ? deletePendingRepositoryPullRequestReview(target, pendingReview.id)
        : Promise.resolve(),
    onSuccess: () => {
      onPendingReviewChange(null);
      setBody("");
      setConfirmDiscard(false);
      toast.success(t("workspace.repositories.pendingReviewDiscarded"));
      void markPullRequestReviewThreadsStale(queryClient, target);
      onComplete();
    },
  });
  const pending = submitMutation.isPending || saveMutation.isPending || discardMutation.isPending;
  const mutationError = submitMutation.error ?? saveMutation.error ?? discardMutation.error;
  const error = mutationError ? parseIpcError(mutationError) : null;
  const stalePendingReview = Boolean(
    pendingReview?.commitId && pendingReview.commitId !== pullRequest.headSha
  );
  const commentCount =
    (pendingReview?.comments.length ?? 0) + (pendingReview?.uneditableCommentCount ?? 0);
  const saveDisabled = pending || (pendingReview ? body === pendingReview.body : !body.trim());

  useEffect(() => {
    onPendingChange(pending);
    return () => onPendingChange(false);
  }, [onPendingChange, pending]);

  const resetErrors = () => {
    submitMutation.reset();
    saveMutation.reset();
    discardMutation.reset();
  };

  return (
    <form
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (bodyRequired && !body.trim()) return;
        submitMutation.mutate();
      }}
    >
      <FieldGroup className="gap-5">
        {commentCount ? (
          <div className="bg-muted/35 flex items-center gap-2 rounded-md border px-3 py-2.5">
            <MessageSquareText className="text-primary size-4 shrink-0" />
            <p className="text-foreground/85 text-xs">
              {t("workspace.repositories.pendingReviewCommentCount", {
                count: commentCount,
              })}
            </p>
          </div>
        ) : null}
        {stalePendingReview ? (
          <Alert>
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.pendingReviewOutdated")}</AlertTitle>
            <AlertDescription>
              {t("workspace.repositories.pendingReviewOutdatedDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
        <FieldSet className="gap-3" disabled={pending}>
          <FieldLegend
            id={`github-pull-request-${pullRequest.number}-review-decision`}
            variant="label"
          >
            {t("workspace.repositories.reviewDecision")}
          </FieldLegend>
          <RadioGroup
            value={action}
            aria-labelledby={`github-pull-request-${pullRequest.number}-review-decision`}
            onValueChange={(value) => {
              setAction(value as GitHubPullRequestReviewAction);
              setSubmitted(false);
              resetErrors();
            }}
          >
            {REVIEW_ACTIONS.map((value) => {
              const id = `github-pull-request-${pullRequest.number}-review-${value}`;
              return (
                <Field key={value} orientation="horizontal" data-disabled={pending}>
                  <RadioGroupItem id={id} value={value} disabled={pending} />
                  <FieldContent>
                    <FieldLabel htmlFor={id}>
                      {t(`workspace.repositories.reviewActions.${value}.label`)}
                    </FieldLabel>
                    <FieldDescription>
                      {t(`workspace.repositories.reviewActions.${value}.description`)}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              );
            })}
          </RadioGroup>
        </FieldSet>
        <Field data-invalid={bodyInvalid} data-disabled={pending}>
          <FieldLabel htmlFor={`github-pull-request-${pullRequest.number}-review-body`}>
            {t(
              bodyRequired
                ? "workspace.repositories.reviewSummary"
                : "workspace.repositories.reviewSummaryOptional"
            )}
          </FieldLabel>
          <GitHubMarkdownEditor
            id={`github-pull-request-${pullRequest.number}-review-body`}
            name="body"
            value={body}
            repository={{ ...repository, defaultBranch: pullRequest.baseRef }}
            reference={pullRequest.baseRef}
            placeholder={t("workspace.repositories.reviewSummaryPlaceholder")}
            disabled={pending}
            invalid={bodyInvalid}
            minHeightClassName="min-h-32"
            onChange={(value) => {
              setBody(value);
              if (value.trim()) setSubmitted(false);
              resetErrors();
            }}
          />
          <FieldDescription>{t("workspace.repositories.markdownSupported")}</FieldDescription>
          <FieldError>
            {bodyInvalid ? t("workspace.repositories.reviewSummaryRequired") : null}
          </FieldError>
        </Field>
        {confirmDiscard && pendingReview ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.discardPendingReviewTitle")}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{t("workspace.repositories.discardPendingReviewDescription")}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirmDiscard(false)}
                >
                  {t("workspace.repositories.keepDraft")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => discardMutation.mutate()}
                >
                  {discardMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                  {t("workspace.repositories.discardDraft")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>
              {t(
                discardMutation.isError
                  ? "workspace.repositories.discardPendingReviewFailed"
                  : saveMutation.isError
                    ? "workspace.repositories.savePendingReviewFailed"
                    : "workspace.repositories.submitReviewFailed"
              )}
            </AlertTitle>
            <AlertDescription>
              {error.code === "githubPermission"
                ? t("workspace.repositories.pullRequestWritePermissionDenied")
                : error.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {pendingReview && !confirmDiscard ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  resetErrors();
                  setConfirmDiscard(true);
                }}
              >
                <Trash2 data-icon="inline-start" />
                {t("workspace.repositories.discardDraft")}
              </Button>
            ) : null}
          </div>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
              {t("workspace.repositories.cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saveDisabled}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {t("workspace.repositories.saveReviewDraft")}
            </Button>
            <Button type="submit" disabled={pending}>
              {submitMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t(
                submitMutation.isPending
                  ? "workspace.repositories.submittingReview"
                  : "workspace.repositories.submitReview"
              )}
            </Button>
          </DialogFooter>
        </div>
      </FieldGroup>
    </form>
  );
}

export function GitHubPullRequestReviewDialog({
  repository,
  pullRequest,
  open,
  onOpenChange,
  pendingReview,
  onPendingReviewChange,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingReview: GitHubPendingPullRequestReview | null;
  onPendingReviewChange: (review: GitHubPendingPullRequestReview | null) => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const setOpen = (nextOpen: boolean) => {
    if (!pending) onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.reviewChanges")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.reviewChangesDescription", {
              number: pullRequest.number,
            })}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <GitHubPullRequestReviewForm
            repository={repository}
            pullRequest={pullRequest}
            pendingReview={pendingReview}
            onPendingReviewChange={onPendingReviewChange}
            onCancel={() => setOpen(false)}
            onComplete={() => {
              setPending(false);
              onOpenChange(false);
            }}
            onPendingChange={setPending}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
