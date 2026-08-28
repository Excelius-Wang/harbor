import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, GitMerge, RefreshCw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubPullRequest, GitHubPullRequestRepository } from "./github-data";
import {
  invalidatePullRequestAfterBranchUpdate,
  updateRepositoryPullRequestBranch,
} from "./github-pull-request-mutations";
import { pullRequestBranchUpdateStatusQueryOptions } from "./github-queries";
import { GitHubPullRequestRevisionGuard } from "./github-pull-request-shared";

const BRANCH_UPDATE_POLL_INTERVAL = 2_500;
const BRANCH_UPDATE_RECONCILIATION_TIMEOUT = 60_000;

type BranchUpdateReconciliation = {
  expectedHeadSha: string;
  timedOut: boolean;
};

export function hasPullRequestBranchUpdateCompleted(
  expectedHeadSha: string,
  observedHeadShas: Array<string | undefined>
) {
  return observedHeadShas.some((headSha) => Boolean(headSha) && headSha !== expectedHeadSha);
}

export function GitHubPullRequestBranchUpdate({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reconciliation, setReconciliation] = useState<BranchUpdateReconciliation | null>(null);
  const target = useMemo(
    () => ({
      owner: repository.owner,
      repository: repository.name,
      pullRequestNumber: pullRequest.number,
    }),
    [pullRequest.number, repository.name, repository.owner]
  );
  const canCheck =
    pullRequest.state === "open" && !pullRequest.merged && pullRequest.mergeable !== false;
  const statusResult = useQuery({
    ...pullRequestBranchUpdateStatusQueryOptions(target),
    enabled: canCheck,
    refetchInterval:
      reconciliation && !reconciliation.timedOut ? BRANCH_UPDATE_POLL_INTERVAL : false,
    refetchIntervalInBackground: false,
  });
  const mutation = useMutation({
    mutationFn: () => updateRepositoryPullRequestBranch(target, pullRequest.headSha),
    onSuccess: (receipt) => {
      setOpen(false);
      setReconciliation({ expectedHeadSha: pullRequest.headSha, timedOut: false });
      toast.info(t("workspace.repositories.pullRequestBranchUpdateAccepted"), {
        description: receipt.message,
      });
      void statusResult.refetch();
    },
  });
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;
  const statusError = statusResult.error ? parseIpcError(statusResult.error) : null;
  const updateCompleted = reconciliation
    ? hasPullRequestBranchUpdateCompleted(reconciliation.expectedHeadSha, [
        pullRequest.headSha,
        statusResult.data?.headSha,
      ])
    : false;

  useEffect(() => {
    if (!reconciliation || reconciliation.timedOut) return;
    const timeout = window.setTimeout(() => {
      setReconciliation((current) => (current ? { ...current, timedOut: true } : current));
    }, BRANCH_UPDATE_RECONCILIATION_TIMEOUT);
    return () => window.clearTimeout(timeout);
  }, [reconciliation]);

  useEffect(() => {
    if (!reconciliation || !updateCompleted) return;
    setReconciliation(null);
    toast.success(t("workspace.repositories.pullRequestBranchUpdated"));
    void invalidatePullRequestAfterBranchUpdate(queryClient, target);
  }, [queryClient, reconciliation, t, target, updateCompleted]);

  useEffect(() => {
    if (!reconciliation || updateCompleted || statusResult.data?.state !== "conflicts") {
      return;
    }
    setReconciliation(null);
    toast.error(t("workspace.repositories.pullRequestBranchUpdateConflictTitle"), {
      description: t("workspace.repositories.pullRequestBranchUpdateConflict"),
    });
  }, [reconciliation, statusResult.data?.state, t, updateCompleted]);

  function changeOpen(nextOpen: boolean) {
    if (mutation.isPending) return;
    setOpen(nextOpen);
    if (nextOpen) mutation.reset();
  }

  function retryStatus() {
    void statusResult.refetch();
  }

  if (!canCheck) return null;

  let content: React.ReactNode = null;
  if (reconciliation) {
    content = (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {reconciliation.timedOut ? (
          <CircleAlert className="text-warning size-4 shrink-0" />
        ) : (
          <Spinner className="text-primary size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-xs font-medium">
            {t(
              reconciliation.timedOut
                ? "workspace.repositories.pullRequestBranchUpdateStillProcessing"
                : "workspace.repositories.updatingPullRequestBranch"
            )}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-4">
            {t(
              reconciliation.timedOut
                ? "workspace.repositories.pullRequestBranchUpdateStillProcessingDescription"
                : "workspace.repositories.updatingPullRequestBranchDescription"
            )}
          </p>
        </div>
        {reconciliation.timedOut ? (
          <Button type="button" variant="outline" size="sm" onClick={retryStatus}>
            {statusResult.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {t("workspace.repositories.refresh")}
          </Button>
        ) : null}
      </div>
    );
  } else if (statusResult.isPending) {
    content = (
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
        <Spinner className="size-4 shrink-0" />
        {t("workspace.repositories.checkingPullRequestBranchUpdate")}
      </div>
    );
  } else if (statusError && !statusResult.data) {
    const description =
      statusError.code === "githubRateLimited"
        ? t("workspace.repositories.githubRateLimited")
        : statusError.message;
    content = (
      <Alert variant="destructive" className="w-full">
        <CircleAlert />
        <AlertTitle>{t("workspace.repositories.pullRequestBranchStatusLoadFailed")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{description}</span>
          <Button type="button" variant="outline" size="sm" onClick={retryStatus}>
            <RefreshCw data-icon="inline-start" />
            {t("workspace.repositories.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (statusResult.data?.state === "conflicts") {
    content = (
      <Alert variant="destructive" className="w-full">
        <CircleAlert />
        <AlertTitle>{t("workspace.repositories.pullRequestBranchUpdateConflictTitle")}</AlertTitle>
        <AlertDescription>
          {t("workspace.repositories.pullRequestBranchUpdateConflict")}
        </AlertDescription>
      </Alert>
    );
  } else if (statusResult.data?.state === "available") {
    content = (
      <div className="flex min-w-0 flex-1 items-center gap-3 @max-[520px]/pull-detail:items-start">
        <GitMerge className="text-primary size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-xs font-medium">
            {t("workspace.repositories.pullRequestBranchBehind", {
              count: statusResult.data.behindBy,
            })}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-4">
            {t("workspace.repositories.pullRequestBranchBehindDescription", {
              base: pullRequest.baseRef,
            })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => changeOpen(true)}
        >
          <GitMerge data-icon="inline-start" />
          {t("workspace.repositories.updatePullRequestBranch")}
        </Button>
      </div>
    );
  }

  if (!content) return null;

  const mutationErrorMessage =
    mutationError?.code === "githubPermission"
      ? t("workspace.repositories.pullRequestBranchUpdatePermissionDenied")
      : mutationError?.code === "githubPullRequestBranchUpdateConflict"
        ? t("workspace.repositories.pullRequestBranchUpdateConflict")
        : mutationError?.code === "githubRateLimited"
          ? t("workspace.repositories.githubRateLimited")
          : mutationError?.message;

  return (
    <>
      <div className="border-t px-4 py-3">{content}</div>

      <AlertDialog open={open} onOpenChange={changeOpen}>
        <AlertDialogContent aria-busy={mutation.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.updatePullRequestBranchTitle", {
                number: pullRequest.number,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.updatePullRequestBranchDescription", {
                base: pullRequest.baseRef,
                head: pullRequest.headLabel ?? pullRequest.headRef,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <GitHubPullRequestRevisionGuard
            from={pullRequest.baseRef}
            to={pullRequest.headLabel ?? pullRequest.headRef}
            expectedHeadSha={pullRequest.headSha}
            description={t("workspace.repositories.pullRequestBranchUpdateHeadGuard")}
          />

          {mutationErrorMessage ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.pullRequestBranchUpdateFailed")}</AlertTitle>
              <AlertDescription>{mutationErrorMessage}</AlertDescription>
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
                mutation.mutate();
              }}
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <GitMerge data-icon="inline-start" />
              )}
              {mutation.isPending
                ? t("workspace.repositories.startingPullRequestBranchUpdate")
                : t("workspace.repositories.updatePullRequestBranch")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
