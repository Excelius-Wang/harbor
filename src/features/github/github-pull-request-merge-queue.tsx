import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock3, ListChecks, RefreshCw, ShieldAlert } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubPullRequest,
  GitHubPullRequestMergeQueueEntryState,
  GitHubPullRequestMergeQueueStatus,
  GitHubPullRequestRepository,
} from "./github-data";
import { GitHubPullRequestAutoMerge } from "./github-pull-request-auto-merge";
import {
  dequeueRepositoryPullRequest,
  enqueueRepositoryPullRequest,
  invalidateRepositoryPullRequest,
} from "./github-pull-request-mutations";
import { githubQueryKeys, pullRequestMergeQueueStatusQueryOptions } from "./github-queries";
import { GitHubPullRequestRevisionGuard } from "./github-pull-request-shared";

type MergeQueueWaitEstimate = { unit: "minute"; value: number } | { unit: "hour"; value: number };

export function getMergeQueueWaitEstimate(
  seconds: number | undefined
): MergeQueueWaitEstimate | null {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 3_600) {
    return { unit: "minute", value: Math.max(1, Math.ceil(seconds / 60)) };
  }
  return { unit: "hour", value: Math.ceil(seconds / 3_600) };
}

function mergeQueueErrorMessage(error: unknown, t: (key: string) => string) {
  if (!error) return undefined;
  const parsed = parseIpcError(error);
  if (parsed.code === "githubPermission") {
    return t("workspace.repositories.pullRequestMergeQueuePermissionDenied");
  }
  if (parsed.code === "githubPullRequestMergeQueueConflict") {
    return t("workspace.repositories.pullRequestMergeQueueConflict");
  }
  if (parsed.code === "githubRateLimited") {
    return t("workspace.repositories.githubRateLimited");
  }
  return parsed.message;
}

function queueEntryTitleKey(state: GitHubPullRequestMergeQueueEntryState | undefined) {
  return `workspace.repositories.pullRequestMergeQueueEntryStates.${state ?? "queued"}.title`;
}

export function GitHubPullRequestMergeAutomation({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [dequeueOpen, setDequeueOpen] = useState(false);
  const target = useMemo(
    () => ({
      owner: repository.owner,
      repository: repository.name,
      pullRequestNumber: pullRequest.number,
    }),
    [pullRequest.number, repository.name, repository.owner]
  );
  const canCheck = pullRequest.state === "open" && !pullRequest.merged && !pullRequest.draft;
  const statusResult = useQuery({
    ...pullRequestMergeQueueStatusQueryOptions(target),
    enabled: canCheck,
  });
  const status = statusResult.data;

  function syncStatus(updated: GitHubPullRequestMergeQueueStatus) {
    queryClient.setQueryData(githubQueryKeys.pullRequestMergeQueueStatus(target), updated);
    void Promise.all([
      invalidateRepositoryPullRequest(queryClient, target),
      queryClient.invalidateQueries({
        queryKey: githubQueryKeys.pullRequestAutoMergeStatus(target),
        exact: true,
      }),
      queryClient.invalidateQueries({ queryKey: githubQueryKeys.checksRoot(target) }),
    ]);
  }

  const enqueueMutation = useMutation({
    mutationFn: () => enqueueRepositoryPullRequest(target, pullRequest.headSha),
    onSuccess: (updated) => {
      syncStatus(updated);
      setEnqueueOpen(false);
      toast.success(t("workspace.repositories.pullRequestAddedToMergeQueue"));
    },
  });
  const dequeueMutation = useMutation({
    mutationFn: () => dequeueRepositoryPullRequest(target),
    onSuccess: (updated) => {
      syncStatus(updated);
      setDequeueOpen(false);
      toast.success(t("workspace.repositories.pullRequestRemovedFromMergeQueue"));
    },
  });

  useEffect(() => {
    if (!status) return;
    if (status.state === "merged" || status.headSha !== pullRequest.headSha) {
      void invalidateRepositoryPullRequest(queryClient, target);
    }
  }, [pullRequest.headSha, queryClient, status, target]);

  if (!canCheck) return null;

  if (status?.state === "notConfigured") {
    return <GitHubPullRequestAutoMerge repository={repository} pullRequest={pullRequest} />;
  }
  if (status && ["draft", "closed", "merged"].includes(status.state)) return null;

  if (statusResult.error && !status) {
    return (
      <div className="border-t px-4 py-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {t("workspace.repositories.pullRequestMergeQueueStatusLoadFailed")}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{mergeQueueErrorMessage(statusResult.error, t)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => statusResult.refetch()}
            >
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  let icon: React.ReactNode = <Spinner className="text-primary size-4 shrink-0" />;
  let title = t("workspace.repositories.checkingPullRequestMergeQueue");
  let description: string | undefined;
  let action: React.ReactNode;

  if (status?.state === "available") {
    icon = <ListChecks className="text-success size-4 shrink-0" />;
    title = t("workspace.repositories.pullRequestMergeQueueStatuses.available.title");
    description = t("workspace.repositories.pullRequestMergeQueueStatuses.available.description", {
      base: status.baseRef,
    });
    if (status.viewerCanEnqueue && status.headSha === pullRequest.headSha) {
      action = (
        <Button type="button" size="sm" onClick={() => setEnqueueOpen(true)}>
          <ListChecks data-icon="inline-start" />
          {t("workspace.repositories.addPullRequestToMergeQueue")}
        </Button>
      );
    }
  } else if (status?.state === "waiting") {
    icon = <Clock3 className="text-primary size-4 shrink-0" />;
    title = t("workspace.repositories.pullRequestMergeQueueStatuses.waiting.title");
    description = t("workspace.repositories.pullRequestMergeQueueStatuses.waiting.description", {
      base: status.baseRef,
    });
    action = (
      <Button type="button" variant="outline" size="sm" onClick={() => statusResult.refetch()}>
        <RefreshCw data-icon="inline-start" />
        {t("workspace.repositories.refreshStatus")}
      </Button>
    );
  } else if (status?.state === "queued") {
    const entry = status.entry;
    const estimate = getMergeQueueWaitEstimate(entry?.estimatedTimeToMergeSeconds);
    const wait = estimate
      ? t(`workspace.repositories.pullRequestMergeQueueWait.${estimate.unit}`, {
          count: estimate.value,
        })
      : t("workspace.repositories.pullRequestMergeQueueWait.unknown");
    icon = <ListChecks className="text-success size-4 shrink-0" />;
    title = t(queueEntryTitleKey(entry?.state));
    description = entry
      ? t("workspace.repositories.pullRequestMergeQueueStatuses.queued.description", {
          position: entry.position,
          actor: entry.enqueuedBy,
          wait,
        })
      : t("workspace.repositories.pullRequestMergeQueueStatuses.queued.pendingDetails");
    if (status.viewerCanDequeue) {
      action = (
        <Button type="button" variant="outline" size="sm" onClick={() => setDequeueOpen(true)}>
          {t("workspace.repositories.removePullRequestFromMergeQueue")}
        </Button>
      );
    }
  } else if (status?.state === "unavailable") {
    icon = <ShieldAlert className="text-muted-foreground size-4 shrink-0" />;
    title = t("workspace.repositories.pullRequestMergeQueueStatuses.unavailable.title");
    description = t("workspace.repositories.pullRequestMergeQueueStatuses.unavailable.description");
  }

  const enqueueError = mergeQueueErrorMessage(enqueueMutation.error, t);
  const dequeueError = mergeQueueErrorMessage(dequeueMutation.error, t);

  return (
    <>
      <div className="border-t px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 @max-[520px]/pull-detail:flex-col @max-[520px]/pull-detail:items-stretch">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon}
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-xs font-medium">{title}</p>
              {description ? (
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-4">{description}</p>
              ) : null}
            </div>
          </div>
          {action}
        </div>
      </div>

      <Dialog
        open={enqueueOpen}
        onOpenChange={(open) => {
          if (enqueueMutation.isPending) return;
          setEnqueueOpen(open);
          if (open) enqueueMutation.reset();
        }}
      >
        <DialogContent aria-busy={enqueueMutation.isPending}>
          <DialogHeader>
            <DialogTitle>
              {t("workspace.repositories.addPullRequestToMergeQueueTitle", {
                number: pullRequest.number,
              })}
            </DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.addPullRequestToMergeQueueDescription", {
                base: pullRequest.baseRef,
              })}
            </DialogDescription>
          </DialogHeader>

          <GitHubPullRequestRevisionGuard
            from={pullRequest.headLabel ?? pullRequest.headRef}
            to={pullRequest.baseRef}
            expectedHeadSha={pullRequest.headSha}
            description={t("workspace.repositories.pullRequestMergeQueueHeadGuard")}
          />

          {enqueueError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>
                {t("workspace.repositories.pullRequestMergeQueueChangeFailed")}
              </AlertTitle>
              <AlertDescription>{enqueueError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={enqueueMutation.isPending}
              onClick={() => setEnqueueOpen(false)}
            >
              {t("workspace.repositories.cancel")}
            </Button>
            <Button
              type="button"
              disabled={enqueueMutation.isPending}
              onClick={() => enqueueMutation.mutate()}
            >
              {enqueueMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ListChecks data-icon="inline-start" />
              )}
              {enqueueMutation.isPending
                ? t("workspace.repositories.addingPullRequestToMergeQueue")
                : t("workspace.repositories.addPullRequestToMergeQueue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={dequeueOpen}
        onOpenChange={(open) => {
          if (dequeueMutation.isPending) return;
          setDequeueOpen(open);
          if (open) dequeueMutation.reset();
        }}
      >
        <AlertDialogContent aria-busy={dequeueMutation.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.removePullRequestFromMergeQueueTitle", {
                number: pullRequest.number,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.removePullRequestFromMergeQueueDescription", {
                base: pullRequest.baseRef,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dequeueError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>
                {t("workspace.repositories.pullRequestMergeQueueChangeFailed")}
              </AlertTitle>
              <AlertDescription>{dequeueError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={dequeueMutation.isPending}>
              {t("workspace.repositories.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={dequeueMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                dequeueMutation.mutate();
              }}
            >
              {dequeueMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {dequeueMutation.isPending
                ? t("workspace.repositories.removingPullRequestFromMergeQueue")
                : t("workspace.repositories.removePullRequestFromMergeQueue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
