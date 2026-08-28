import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Clock3, RefreshCw, ShieldAlert } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubPullRequest,
  GitHubPullRequestAutoMergeState,
  GitHubPullRequestAutoMergeStatus,
  GitHubPullRequestMergeMethod,
  GitHubPullRequestRepository,
} from "./github-data";
import {
  disableRepositoryPullRequestAutoMerge,
  enableRepositoryPullRequestAutoMerge,
} from "./github-pull-request-mutations";
import { githubQueryKeys, pullRequestAutoMergeStatusQueryOptions } from "./github-queries";
import { GitHubPullRequestRevisionGuard } from "./github-pull-request-shared";

const HIDDEN_AUTO_MERGE_STATES: GitHubPullRequestAutoMergeState[] = [
  "draft",
  "closed",
  "merged",
  "mergeQueue",
  "notNeeded",
];

export function getDefaultAutoMergeMethod(
  allowedMethods: GitHubPullRequestMergeMethod[]
): GitHubPullRequestMergeMethod | null {
  if (allowedMethods.includes("merge")) return "merge";
  return allowedMethods[0] ?? null;
}

function autoMergeErrorMessage(error: unknown, t: (key: string) => string): string | undefined {
  if (!error) return undefined;
  const parsed = parseIpcError(error);
  if (parsed.code === "githubPermission") {
    return t("workspace.repositories.pullRequestAutoMergePermissionDenied");
  }
  if (parsed.code === "githubPullRequestAutoMergeConflict") {
    return t("workspace.repositories.pullRequestAutoMergeConflict");
  }
  if (parsed.code === "githubRateLimited") {
    return t("workspace.repositories.githubRateLimited");
  }
  return parsed.message;
}

export function GitHubPullRequestAutoMerge({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [enableOpen, setEnableOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [method, setMethod] = useState<GitHubPullRequestMergeMethod | null>("merge");
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
    ...pullRequestAutoMergeStatusQueryOptions(target),
    enabled: canCheck,
  });

  function syncStatus(status: GitHubPullRequestAutoMergeStatus) {
    queryClient.setQueryData(githubQueryKeys.pullRequestAutoMergeStatus(target), status);
    void queryClient.invalidateQueries({
      queryKey: githubQueryKeys.pullRequestDetailRoot(target),
    });
  }

  const enableMutation = useMutation({
    mutationFn: () => {
      if (!method) {
        throw new Error(t("workspace.repositories.pullRequestAutoMergeMethodUnavailable"));
      }
      return enableRepositoryPullRequestAutoMerge(target, pullRequest.headSha, method);
    },
    onSuccess: (status) => {
      syncStatus(status);
      setEnableOpen(false);
      toast.success(t("workspace.repositories.pullRequestAutoMergeEnabled"));
    },
  });
  const disableMutation = useMutation({
    mutationFn: () => disableRepositoryPullRequestAutoMerge(target),
    onSuccess: (status) => {
      syncStatus(status);
      setDisableOpen(false);
      toast.success(t("workspace.repositories.pullRequestAutoMergeDisabled"));
    },
  });
  const status = statusResult.data;

  useEffect(() => {
    if (!status || status.allowedMergeMethods.includes(method ?? "merge")) return;
    setMethod(getDefaultAutoMergeMethod(status.allowedMergeMethods));
  }, [method, status]);

  if (!canCheck) return null;

  function changeEnableOpen(nextOpen: boolean) {
    if (enableMutation.isPending) return;
    setEnableOpen(nextOpen);
    if (!nextOpen) return;
    setMethod(getDefaultAutoMergeMethod(status?.allowedMergeMethods ?? []));
    enableMutation.reset();
  }

  function changeDisableOpen(nextOpen: boolean) {
    if (disableMutation.isPending) return;
    setDisableOpen(nextOpen);
    if (nextOpen) disableMutation.reset();
  }

  if (status && HIDDEN_AUTO_MERGE_STATES.includes(status.state)) return null;

  let icon: React.ReactNode = <Clock3 className="text-primary size-4 shrink-0" />;
  let title = t("workspace.repositories.checkingPullRequestAutoMerge");
  let description: string | undefined;
  let action: React.ReactNode;

  if (statusResult.isPending) {
    icon = <Spinner className="text-primary size-4 shrink-0" />;
  } else if (statusResult.error && !status) {
    const errorMessage = autoMergeErrorMessage(statusResult.error, t);
    return (
      <div className="border-t px-4 py-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {t("workspace.repositories.pullRequestAutoMergeStatusLoadFailed")}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{errorMessage}</span>
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
  } else if (status?.state === "enabled") {
    icon = <CheckCircle2 className="text-success size-4 shrink-0" />;
    title = t("workspace.repositories.pullRequestAutoMergeStatuses.enabled.title");
    description = t("workspace.repositories.pullRequestAutoMergeStatuses.enabled.description", {
      method: t(
        `workspace.repositories.pullRequestMergeMethods.${status.mergeMethod ?? "merge"}.label`
      ),
      actor: status.enabledBy ?? t("workspace.repositories.github"),
    });
    if (status.viewerCanDisable) {
      action = (
        <Button type="button" variant="outline" size="sm" onClick={() => changeDisableOpen(true)}>
          {t("workspace.repositories.disablePullRequestAutoMerge")}
        </Button>
      );
    }
  } else if (status?.state === "available") {
    title = t("workspace.repositories.pullRequestAutoMergeStatuses.available.title");
    description = t("workspace.repositories.pullRequestAutoMergeStatuses.available.description", {
      base: pullRequest.baseRef,
    });
    action = (
      <Button type="button" variant="outline" size="sm" onClick={() => changeEnableOpen(true)}>
        <Clock3 data-icon="inline-start" />
        {t("workspace.repositories.enablePullRequestAutoMerge")}
      </Button>
    );
  } else if (status?.state === "repositoryDisabled") {
    icon = <ShieldAlert className="text-muted-foreground size-4 shrink-0" />;
    title = t("workspace.repositories.pullRequestAutoMergeStatuses.repositoryDisabled.title");
    description = t(
      "workspace.repositories.pullRequestAutoMergeStatuses.repositoryDisabled.description"
    );
  } else if (status?.state === "unavailable") {
    icon = <ShieldAlert className="text-muted-foreground size-4 shrink-0" />;
    title = t("workspace.repositories.pullRequestAutoMergeStatuses.unavailable.title");
    description = t("workspace.repositories.pullRequestAutoMergeStatuses.unavailable.description");
  }

  const enableErrorMessage = autoMergeErrorMessage(enableMutation.error, t);
  const disableErrorMessage = autoMergeErrorMessage(disableMutation.error, t);
  const methodDescription = method
    ? t(`workspace.repositories.pullRequestMergeMethods.${method}.description`)
    : t("workspace.repositories.pullRequestAutoMergeMethodUnavailable");

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

      <Dialog open={enableOpen} onOpenChange={changeEnableOpen}>
        <DialogContent aria-busy={enableMutation.isPending}>
          <DialogHeader>
            <DialogTitle>
              {t("workspace.repositories.enablePullRequestAutoMergeTitle", {
                number: pullRequest.number,
              })}
            </DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.enablePullRequestAutoMergeDescription", {
                base: pullRequest.baseRef,
              })}
            </DialogDescription>
          </DialogHeader>

          <GitHubPullRequestRevisionGuard
            from={pullRequest.headLabel ?? pullRequest.headRef}
            to={pullRequest.baseRef}
            expectedHeadSha={pullRequest.headSha}
            description={t("workspace.repositories.pullRequestAutoMergeHeadGuard")}
          />

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`pull-request-${pullRequest.number}-auto-merge-method`}>
                {t("workspace.repositories.pullRequestMergeMethod")}
              </FieldLabel>
              <Select
                value={method ?? undefined}
                onValueChange={(value) => {
                  setMethod(value as GitHubPullRequestMergeMethod);
                  enableMutation.reset();
                }}
                disabled={enableMutation.isPending || !method}
              >
                <SelectTrigger
                  id={`pull-request-${pullRequest.number}-auto-merge-method`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {status?.allowedMergeMethods.map((mergeMethod) => (
                      <SelectItem key={mergeMethod} value={mergeMethod}>
                        {t(`workspace.repositories.pullRequestMergeMethods.${mergeMethod}.label`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{methodDescription}</FieldDescription>
            </Field>
          </FieldGroup>

          {enableErrorMessage ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>
                {t("workspace.repositories.pullRequestAutoMergeChangeFailed")}
              </AlertTitle>
              <AlertDescription>{enableErrorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={enableMutation.isPending}
              onClick={() => changeEnableOpen(false)}
            >
              {t("workspace.repositories.cancel")}
            </Button>
            <Button
              type="button"
              disabled={enableMutation.isPending || !method}
              onClick={() => enableMutation.mutate()}
            >
              {enableMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Clock3 data-icon="inline-start" />
              )}
              {enableMutation.isPending
                ? t("workspace.repositories.enablingPullRequestAutoMerge")
                : t("workspace.repositories.enablePullRequestAutoMerge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={disableOpen} onOpenChange={changeDisableOpen}>
        <AlertDialogContent aria-busy={disableMutation.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.disablePullRequestAutoMergeTitle", {
                number: pullRequest.number,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.disablePullRequestAutoMergeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {disableErrorMessage ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>
                {t("workspace.repositories.pullRequestAutoMergeChangeFailed")}
              </AlertTitle>
              <AlertDescription>{disableErrorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={disableMutation.isPending}>
              {t("workspace.repositories.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={disableMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                disableMutation.mutate();
              }}
            >
              {disableMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {disableMutation.isPending
                ? t("workspace.repositories.disablingPullRequestAutoMerge")
                : t("workspace.repositories.disablePullRequestAutoMerge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
