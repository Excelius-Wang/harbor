import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleAlert, CircleStop, RotateCcw, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import {
  deleteWorkflowRun,
  invalidateWorkflowRunAction,
  reconcileWorkflowRunDeletion,
  requestWorkflowRunAction,
  workflowRunCanCancel,
  workflowRunCanDelete,
  workflowRunCanRerun,
  workflowRunHasFailedJobs,
} from "./github-actions-mutations";
import type { GitHubRepository, GitHubWorkflowRun, GitHubWorkflowRunAction } from "./github-data";

function successMessage(action: GitHubWorkflowRunAction) {
  switch (action) {
    case "cancel":
      return "workspace.repositories.workflowCancelRequested";
    case "rerunFailed":
      return "workspace.repositories.workflowFailedJobsRerunRequested";
    case "rerunAll":
      return "workspace.repositories.workflowRerunRequested";
  }
}

export function GitHubWorkflowRunActions({
  repository,
  run,
  onAccepted,
  onDeleted,
}: {
  repository: GitHubRepository;
  run: GitHubWorkflowRun;
  onAccepted: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    runId: run.id,
  };
  const mutation = useMutation({
    mutationFn: (action: GitHubWorkflowRunAction) => requestWorkflowRunAction(target, action),
    onSuccess: async (_, action) => {
      setCancelOpen(false);
      toast.success(t(successMessage(action)));
      onAccepted();
      await invalidateWorkflowRunAction(queryClient, target);
    },
    onError: (reason, action) => {
      const error = parseIpcError(reason);
      if (error.code === "validation") {
        void invalidateWorkflowRunAction(queryClient, target);
      }
      if (action !== "cancel") {
        toast.error(t("workspace.repositories.workflowRunActionFailed"), {
          description:
            error.code === "githubPermission"
              ? t("workspace.repositories.workflowRunWritePermissionDenied")
              : error.message,
        });
      }
    },
  });
  const deletion = useMutation({
    mutationFn: () =>
      deleteWorkflowRun({
        ...target,
        expectedUpdatedAt: run.updatedAt,
      }),
    onSuccess: async (deleted) => {
      setDeleteOpen(false);
      toast.success(
        t("workspace.repositories.workflowRunDeleted", {
          number: run.runNumber,
        })
      );
      await reconcileWorkflowRunDeletion(
        queryClient,
        { ...target, expectedUpdatedAt: run.updatedAt },
        deleted
      );
      onDeleted();
    },
    onError: (reason) => {
      const error = parseIpcError(reason);
      if (error.code === "validation") {
        void invalidateWorkflowRunAction(queryClient, target);
      }
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const cancelError = mutation.variables === "cancel" ? error : null;
  const cancelErrorMessage = cancelError
    ? cancelError.code === "githubPermission"
      ? t("workspace.repositories.workflowRunWritePermissionDenied")
      : cancelError.message
    : null;
  const pendingAction = mutation.isPending ? mutation.variables : null;
  const deletionError = deletion.error ? parseIpcError(deletion.error) : null;
  const deletionErrorMessage = deletionError
    ? deletionError.code === "githubPermission"
      ? t("workspace.repositories.workflowRunWritePermissionDenied")
      : deletionError.message
    : null;

  function changeCancelOpen(nextOpen: boolean) {
    if (mutation.isPending) return;
    setCancelOpen(nextOpen);
    if (nextOpen) mutation.reset();
  }

  function changeDeleteOpen(nextOpen: boolean) {
    if (deletion.isPending) return;
    setDeleteOpen(nextOpen);
    if (nextOpen) deletion.reset();
  }

  const deleteConfirmation = (
    <AlertDialog open={deleteOpen} onOpenChange={changeDeleteOpen}>
      <AlertDialogContent aria-busy={deletion.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace.repositories.deleteWorkflowRunTitle", {
              number: run.runNumber,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.deleteWorkflowRunDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deletionErrorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.workflowRunDeleteFailed")}</AlertTitle>
            <AlertDescription>{deletionErrorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletion.isPending}>
            {t("workspace.repositories.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deletion.isPending}
            onClick={(event) => {
              event.preventDefault();
              deletion.mutate();
            }}
          >
            {deletion.isPending ? <Spinner data-icon="inline-start" /> : null}
            {deletion.isPending
              ? t("workspace.repositories.deletingWorkflowRun")
              : t("workspace.repositories.deleteWorkflowRun")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (workflowRunCanCancel(run)) {
    return (
      <>
        <AlertDialog open={cancelOpen} onOpenChange={changeCancelOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" disabled={mutation.isPending}>
              {pendingAction === "cancel" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CircleStop data-icon="inline-start" />
              )}
              {pendingAction === "cancel"
                ? t("workspace.repositories.cancellingWorkflowRun")
                : t("workspace.repositories.cancelWorkflowRun")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent aria-busy={mutation.isPending}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("workspace.repositories.cancelWorkflowRunTitle", {
                  number: run.runNumber,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("workspace.repositories.cancelWorkflowRunDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {cancelErrorMessage ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.workflowRunActionFailed")}</AlertTitle>
                <AlertDescription>{cancelErrorMessage}</AlertDescription>
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
                  mutation.mutate("cancel");
                }}
              >
                {pendingAction === "cancel" ? <Spinner data-icon="inline-start" /> : null}
                {pendingAction === "cancel"
                  ? t("workspace.repositories.cancellingWorkflowRun")
                  : t("workspace.repositories.cancelWorkflowRun")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {workflowRunCanDelete(run) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={deletion.isPending}
            onClick={() => changeDeleteOpen(true)}
          >
            <Trash2 data-icon="inline-start" />
            {t("workspace.repositories.deleteWorkflowRun")}
          </Button>
        ) : null}
        {deleteConfirmation}
      </>
    );
  }

  if (!workflowRunCanRerun(run)) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={mutation.isPending}>
            {pendingAction ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            {pendingAction
              ? t("workspace.repositories.requestingWorkflowRerun")
              : t("workspace.repositories.rerunWorkflowJobs")}
            {!pendingAction ? <ChevronDown data-icon="inline-end" /> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => mutation.mutate("rerunAll")}>
              <RotateCcw />
              {t("workspace.repositories.rerunAllWorkflowJobs")}
            </DropdownMenuItem>
            {workflowRunHasFailedJobs(run) ? (
              <DropdownMenuItem onSelect={() => mutation.mutate("rerunFailed")}>
                <RotateCcw />
                {t("workspace.repositories.rerunFailedWorkflowJobs")}
              </DropdownMenuItem>
            ) : null}
            {workflowRunCanDelete(run) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => changeDeleteOpen(true)}>
                  <Trash2 />
                  {t("workspace.repositories.deleteWorkflowRun")}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {deleteConfirmation}
    </>
  );
}
