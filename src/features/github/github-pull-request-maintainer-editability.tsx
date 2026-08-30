import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubPullRequest,
  GitHubPullRequestMaintainerEditability,
  GitHubPullRequestRepository,
} from "./github-data";
import {
  invalidatePullRequestAfterMaintainerEditability,
  syncPullRequestMaintainerEditability,
  updateRepositoryPullRequestMaintainerEditability,
} from "./github-pull-request-mutations";
import { pullRequestMaintainerEditabilityQueryOptions } from "./github-queries";

const HIDDEN_STATES: GitHubPullRequestMaintainerEditability["state"][] = [
  "notAuthor",
  "sameRepository",
  "organizationFork",
  "closed",
];

export function shouldShowPullRequestMaintainerEditability(
  status: GitHubPullRequestMaintainerEditability
) {
  return !HIDDEN_STATES.includes(status.state);
}

export function GitHubPullRequestMaintainerEditability({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const target = useMemo(
    () => ({
      owner: repository.owner,
      repository: repository.name,
      pullRequestNumber: pullRequest.number,
    }),
    [pullRequest.number, repository.name, repository.owner]
  );
  const canCheck = pullRequest.state === "open" && !pullRequest.merged;
  const result = useQuery({
    ...pullRequestMaintainerEditabilityQueryOptions(target),
    enabled: canCheck,
  });
  const mutation = useMutation({
    mutationFn: (requestedValue: boolean) => {
      if (!result.data) {
        throw new Error(t("workspace.repositories.pullRequestMaintainerEditabilityUnavailable"));
      }
      return updateRepositoryPullRequestMaintainerEditability(target, result.data, requestedValue);
    },
    onSuccess: (status) => {
      syncPullRequestMaintainerEditability(queryClient, target, status);
      void invalidatePullRequestAfterMaintainerEditability(queryClient, target);
      toast.success(
        t(
          status.currentValue
            ? "workspace.repositories.pullRequestMaintainerEditsEnabled"
            : "workspace.repositories.pullRequestMaintainerEditsDisabled"
        )
      );
    },
    onError: (error) => {
      const code = parseIpcError(error).code;
      const stateMayHaveChanged =
        code === "githubPullRequestMaintainerEditabilityConflict" ||
        code === "github" ||
        code === "unknown";
      void invalidatePullRequestAfterMaintainerEditability(
        queryClient,
        target,
        stateMayHaveChanged
      );
    },
  });

  if (!canCheck) return null;

  if (result.isPending) {
    return (
      <>
        <Separator />
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2"
          aria-label={t("workspace.repositories.loadingPullRequestMaintainerEditability")}
        >
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </>
    );
  }

  const status = result.data;
  if (!status || result.error) {
    const error = parseIpcError(result.error);
    return (
      <>
        <Separator />
        <Alert variant="destructive" className="py-2.5 text-xs">
          <CircleAlert />
          <AlertTitle>
            {t("workspace.repositories.pullRequestMaintainerEditabilityLoadFailed")}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{error.message}</span>
            <Button type="button" variant="outline" size="xs" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  if (!shouldShowPullRequestMaintainerEditability(status)) return null;

  if (status.state === "headUnavailable") {
    return (
      <>
        <Separator />
        <Alert className="py-2.5 text-xs">
          <CircleAlert />
          <AlertTitle>
            {t("workspace.repositories.pullRequestMaintainerEditabilityUnavailable")}
          </AlertTitle>
          <AlertDescription>
            {t("workspace.repositories.pullRequestMaintainerHeadUnavailable")}
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const risky = status.workflowRisk !== "absent";
  const descriptionId = `pull-request-${pullRequest.number}-maintainer-editability-description`;
  const warningId = risky
    ? `pull-request-${pullRequest.number}-maintainer-editability-warning`
    : undefined;
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;
  const mutationErrorMessage = mutationError
    ? mutationError.code === "githubPermission"
      ? t("workspace.repositories.pullRequestMaintainerEditabilityPermissionDenied")
      : mutationError.code === "githubPullRequestMaintainerEditabilityConflict"
        ? t("workspace.repositories.pullRequestMaintainerEditabilityConflict")
        : mutationError.message
    : null;
  const describedBy = [descriptionId, warningId].filter(Boolean).join(" ");

  return (
    <>
      <Separator />
      <section className="flex flex-col gap-2.5" aria-busy={mutation.isPending}>
        <p className="text-muted-foreground text-[10px] font-medium tracking-[0.08em] uppercase">
          {t("workspace.repositories.pullRequestMaintainerEditability")}
        </p>
        <div className="flex items-start gap-2">
          <Checkbox
            id={`pull-request-${pullRequest.number}-maintainer-editability`}
            checked={status.currentValue}
            disabled={mutation.isPending}
            aria-describedby={describedBy}
            onCheckedChange={(checked) => {
              if (checked === "indeterminate" || checked === status.currentValue) return;
              mutation.reset();
              mutation.mutate(checked);
            }}
          />
          <div className="min-w-0 flex-1">
            <label
              htmlFor={`pull-request-${pullRequest.number}-maintainer-editability`}
              className="text-foreground block cursor-pointer text-xs leading-4 font-medium"
            >
              {t(
                risky
                  ? "workspace.repositories.allowMaintainerEditsWithSecrets"
                  : "workspace.repositories.allowMaintainerEdits"
              )}
            </label>
            <p id={descriptionId} className="text-muted-foreground mt-1 text-[11px] leading-4">
              {t("workspace.repositories.pullRequestMaintainerEditabilityDescription")}
            </p>
          </div>
        </div>
        {risky ? (
          <Alert id={warningId} className="py-2.5 text-[11px]">
            <ShieldAlert />
            <AlertTitle>
              {t("workspace.repositories.pullRequestMaintainerWorkflowWarningTitle")}
            </AlertTitle>
            <AlertDescription>
              {t(
                status.workflowRisk === "present"
                  ? "workspace.repositories.pullRequestMaintainerWorkflowWarning"
                  : "workspace.repositories.pullRequestMaintainerWorkflowUnknownWarning"
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        {mutation.isPending ? (
          <p role="status" className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <Spinner className="size-3" role="presentation" aria-hidden="true" />
            {t("workspace.repositories.updatingPullRequestMaintainerEditability")}
          </p>
        ) : null}
        {mutationErrorMessage ? (
          <Alert variant="destructive" className="py-2.5 text-[11px]">
            <CircleAlert />
            <AlertTitle>
              {t("workspace.repositories.pullRequestMaintainerEditabilityUpdateFailed")}
            </AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{mutationErrorMessage}</span>
              {mutationError?.code === "githubPullRequestMaintainerEditabilityConflict" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    mutation.reset();
                    void result.refetch();
                  }}
                >
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.refreshPullRequestMaintainerEditability")}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </section>
    </>
  );
}
