import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, MoreHorizontal, Trash2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import {
  deleteWorkflowRun,
  invalidateWorkflowRunAction,
  reconcileWorkflowRunDeletion,
} from "./github-actions-mutations";
import type { GitHubRepository, GitHubWorkflowRun } from "./github-data";

export function useGitHubWorkflowRunDeletion({
  repository,
  run,
  onDeleted,
}: {
  repository: GitHubRepository;
  run: GitHubWorkflowRun;
  onDeleted?: () => void;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    runId: run.id,
  };
  const mutation = useMutation({
    mutationFn: () =>
      deleteWorkflowRun({
        ...target,
        expectedWorkflowId: run.workflowId,
        expectedUpdatedAt: run.updatedAt,
      }),
    onSuccess: async (deleted) => {
      setOpen(false);
      toast.success(
        t("workspace.repositories.workflowRunDeleted", {
          number: run.runNumber,
        })
      );
      onDeleted?.();
      await reconcileWorkflowRunDeletion(
        queryClient,
        {
          ...target,
          expectedWorkflowId: run.workflowId,
          expectedUpdatedAt: run.updatedAt,
        },
        deleted
      );
    },
    onError: (reason) => {
      const error = parseIpcError(reason);
      if (error.code === "validation") {
        void invalidateWorkflowRunAction(queryClient, target);
      }
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const errorMessage = error
    ? error.code === "githubPermission"
      ? t("workspace.repositories.workflowRunWritePermissionDenied")
      : error.code === "validation"
        ? t("workspace.repositories.workflowRunDeleteConflict")
        : error.message
    : null;

  function changeOpen(nextOpen: boolean) {
    if (mutation.isPending) return;
    setOpen(nextOpen);
    if (nextOpen) mutation.reset();
  }

  return { open, changeOpen, mutation, errorMessage };
}

export type GitHubWorkflowRunDeletionController = ReturnType<typeof useGitHubWorkflowRunDeletion>;

export function GitHubWorkflowRunDeleteConfirmation({
  run,
  controller,
}: {
  run: GitHubWorkflowRun;
  controller: GitHubWorkflowRunDeletionController;
}) {
  const { t } = useAppTranslation();

  return (
    <AlertDialog open={controller.open} onOpenChange={controller.changeOpen}>
      <AlertDialogContent aria-busy={controller.mutation.isPending}>
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
        {controller.errorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.workflowRunDeleteFailed")}</AlertTitle>
            <AlertDescription>{controller.errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={controller.mutation.isPending}>
            {t("workspace.repositories.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={controller.mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              controller.mutation.mutate();
            }}
          >
            {controller.mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {controller.mutation.isPending
              ? t("workspace.repositories.deletingWorkflowRun")
              : t("workspace.repositories.deleteWorkflowRun")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GitHubWorkflowRunDeleteButton({
  controller,
}: {
  controller: GitHubWorkflowRunDeletionController;
}) {
  const { t } = useAppTranslation();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={controller.mutation.isPending}
      onClick={() => controller.changeOpen(true)}
    >
      <Trash2 data-icon="inline-start" />
      {t("workspace.repositories.deleteWorkflowRun")}
    </Button>
  );
}

export function GitHubWorkflowRunDeleteMenuItem({
  controller,
}: {
  controller: GitHubWorkflowRunDeletionController;
}) {
  const { t } = useAppTranslation();

  return (
    <DropdownMenuItem variant="destructive" onSelect={() => controller.changeOpen(true)}>
      <Trash2 />
      {t("workspace.repositories.deleteWorkflowRun")}
    </DropdownMenuItem>
  );
}

export function GitHubWorkflowRunDeleteMenu({
  repository,
  run,
}: {
  repository: GitHubRepository;
  run: GitHubWorkflowRun;
}) {
  const { t } = useAppTranslation();
  const controller = useGitHubWorkflowRunDeletion({ repository, run });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("workspace.repositories.workflowRunActions")}
            disabled={controller.mutation.isPending}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <GitHubWorkflowRunDeleteMenuItem controller={controller} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <GitHubWorkflowRunDeleteConfirmation run={run} controller={controller} />
    </>
  );
}
