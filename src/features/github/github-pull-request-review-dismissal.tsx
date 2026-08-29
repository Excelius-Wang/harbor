import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, MoreHorizontal, ShieldX } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubPullRequestReview, GitHubPullRequestReviewState } from "./github-data";
import {
  dismissRepositoryPullRequestReview,
  invalidatePullRequestAfterReviewDismissal,
  syncDismissedPullRequestReview,
  type GitHubPullRequestMutationTarget,
} from "./github-pull-request-mutations";

export function canDismissPullRequestReview(state: GitHubPullRequestReviewState) {
  return state === "approved" || state === "changesRequested";
}

export function GitHubPullRequestReviewDismissalMenu({
  review,
  onSelect,
}: {
  review: GitHubPullRequestReview;
  onSelect: () => void;
}) {
  const { t } = useAppTranslation();
  if (!canDismissPullRequestReview(review.state)) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("workspace.repositories.reviewMenu")}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("workspace.repositories.reviewMenu")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={onSelect}>
            <ShieldX />
            {t("workspace.repositories.dismissReview")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function GitHubPullRequestReviewDismissalAction({
  target,
  review,
}: {
  target: GitHubPullRequestMutationTarget;
  review: GitHubPullRequestReview;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const clearDismissal = () => {
    setOpen(false);
    setMessage("");
  };
  const mutation = useMutation({
    mutationFn: (reason: string) => dismissRepositoryPullRequestReview(target, review.id, reason),
    onSuccess: (updated) => {
      syncDismissedPullRequestReview(queryClient, target, updated);
      clearDismissal();
      toast.success(t("workspace.repositories.reviewDismissed"));
      void invalidatePullRequestAfterReviewDismissal(queryClient, target);
    },
    onError: () => {
      void invalidatePullRequestAfterReviewDismissal(queryClient, target);
    },
  });
  const parsedError = mutation.error ? parseIpcError(mutation.error) : null;
  const error = parsedError
    ? parsedError.code === "githubPermission"
      ? t("workspace.repositories.pullRequestWritePermissionDenied")
      : parsedError.code === "githubPullRequestReviewDismissalConflict"
        ? t("workspace.repositories.dismissReviewConflict")
        : parsedError.message
    : null;

  return (
    <>
      <GitHubPullRequestReviewDismissalMenu
        review={review}
        onSelect={() => {
          mutation.reset();
          setOpen(true);
          setMessage("");
        }}
      />
      <GitHubPullRequestReviewDismissalDialog
        open={open}
        review={review}
        message={message}
        pending={mutation.isPending}
        error={error}
        onMessageChange={(next) => {
          mutation.reset();
          setMessage(next);
        }}
        onConfirm={() => {
          const reason = message.trim();
          if (reason) mutation.mutate(reason);
        }}
        onOpenChange={(next) => {
          if (next) return;
          mutation.reset();
          clearDismissal();
        }}
      />
    </>
  );
}

export function GitHubPullRequestReviewDismissalDialog({
  open,
  review,
  message,
  pending,
  error,
  onMessageChange,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  review: GitHubPullRequestReview | null;
  message: string;
  pending: boolean;
  error: string | null;
  onMessageChange: (message: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useAppTranslation();
  if (!review) return null;
  const valid = message.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.dismissReviewTitle")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.dismissReviewDescription", { reviewer: review.author })}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          required
          autoFocus
          value={message}
          disabled={pending}
          aria-label={t("workspace.repositories.dismissReviewReason")}
          placeholder={t("workspace.repositories.dismissReviewReasonPlaceholder")}
          onChange={(event) => onMessageChange(event.target.value)}
        />
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.dismissReviewFailed")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !valid}
            onClick={onConfirm}
          >
            {pending ? <Spinner data-icon="inline-start" /> : <ShieldX data-icon="inline-start" />}
            {t(
              pending
                ? "workspace.repositories.dismissingReview"
                : "workspace.repositories.dismissReview"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
