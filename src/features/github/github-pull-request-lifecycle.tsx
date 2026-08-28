import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, GitPullRequestDraft } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubPullRequest, GitHubPullRequestRepository } from "./github-data";
import {
  invalidateRepositoryPullRequest,
  syncUpdatedPullRequest,
  updateRepositoryPullRequestDraftState,
  type GitHubPullRequestMutationTarget,
} from "./github-pull-request-mutations";

export function usePullRequestDraftStateMutation(
  repository: GitHubPullRequestRepository,
  pullRequest: GitHubPullRequest,
  onSuccess?: () => void
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target: GitHubPullRequestMutationTarget = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const mutation = useMutation({
    mutationFn: (draft: boolean) => updateRepositoryPullRequestDraftState(target, draft),
    onSuccess: (updatedPullRequest) => {
      syncUpdatedPullRequest(queryClient, target, updatedPullRequest);
      toast.success(
        t(
          updatedPullRequest.draft
            ? "workspace.repositories.pullRequestConvertedToDraft"
            : "workspace.repositories.pullRequestReadyForReview"
        )
      );
      onSuccess?.();
      void invalidateRepositoryPullRequest(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const errorMessage = error
    ? error.code === "githubPermission"
      ? t("workspace.repositories.pullRequestDraftPermissionDenied")
      : error.message
    : null;

  return { mutation, errorMessage };
}

export function GitHubPullRequestConvertToDraft({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutation, errorMessage } = usePullRequestDraftStateMutation(repository, pullRequest, () =>
    setOpen(false)
  );

  function changeOpen(nextOpen: boolean) {
    if (mutation.isPending) return;
    setOpen(nextOpen);
    if (nextOpen) mutation.reset();
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-foreground mt-2 w-full justify-start px-1.5"
        >
          <GitPullRequestDraft data-icon="inline-start" />
          {t("workspace.repositories.convertPullRequestToDraft")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent aria-busy={mutation.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace.repositories.convertPullRequestToDraftTitle", {
              number: pullRequest.number,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.convertPullRequestToDraftDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.pullRequestDraftStateChangeFailed")}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("workspace.repositories.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate(true);
            }}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {mutation.isPending
              ? t("workspace.repositories.convertingPullRequestToDraft")
              : t("workspace.repositories.convertPullRequestToDraft")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
