import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, PauseCircle, PlayCircle } from "lucide-react";
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
import {
  reconcileWorkflowState,
  setWorkflowEnabled,
  workflowStateAction,
} from "./github-actions-mutations";
import type { GitHubRepository, GitHubWorkflow } from "./github-data";
import { githubQueryKeys } from "./github-queries";

export function GitHubActionsWorkflowControls({
  repository,
  workflow,
  onUpdated,
}: {
  repository: GitHubRepository;
  workflow: GitHubWorkflow;
  onUpdated: (workflow: GitHubWorkflow) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [disableOpen, setDisableOpen] = useState(false);
  const action = workflowStateAction(workflow.state);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    workflowId: workflow.id,
    expectedState: workflow.state,
  };
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => setWorkflowEnabled({ ...target, enabled }),
    onSuccess: async (updated) => {
      setDisableOpen(false);
      onUpdated(updated);
      toast.success(
        t(
          updated.state === "active"
            ? "workspace.repositories.workflowEnabled"
            : "workspace.repositories.workflowDisabledConfirmation",
          { name: updated.name }
        )
      );
      await reconcileWorkflowState(
        queryClient,
        { ...target, enabled: updated.state === "active" },
        updated
      );
    },
    onError: (reason, enabled) => {
      const error = parseIpcError(reason);
      if (error.code === "validation") {
        void queryClient.invalidateQueries({
          queryKey: githubQueryKeys.workflows(target),
        });
      }
      if (enabled) {
        toast.error(t("workspace.repositories.workflowStateChangeFailed"), {
          description:
            error.code === "githubPermission"
              ? t("workspace.repositories.workflowRunWritePermissionDenied")
              : error.message,
        });
      }
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const disableError = mutation.variables === false ? error : null;
  const disableErrorMessage = disableError
    ? disableError.code === "githubPermission"
      ? t("workspace.repositories.workflowRunWritePermissionDenied")
      : disableError.message
    : null;

  if (action === "enable") {
    return (
      <Button
        type="button"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(true)}
      >
        {mutation.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <PlayCircle data-icon="inline-start" />
        )}
        {mutation.isPending
          ? t("workspace.repositories.enablingWorkflow")
          : t("workspace.repositories.enableWorkflow")}
      </Button>
    );
  }

  if (action !== "disable") return null;

  return (
    <AlertDialog
      open={disableOpen}
      onOpenChange={(open) => {
        if (mutation.isPending) return;
        setDisableOpen(open);
        if (open) mutation.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={mutation.isPending}>
          <PauseCircle data-icon="inline-start" />
          {t("workspace.repositories.disableWorkflow")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent aria-busy={mutation.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace.repositories.disableWorkflowTitle", { name: workflow.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.disableWorkflowDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {disableErrorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.workflowStateChangeFailed")}</AlertTitle>
            <AlertDescription>{disableErrorMessage}</AlertDescription>
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
              mutation.mutate(false);
            }}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {mutation.isPending
              ? t("workspace.repositories.disablingWorkflow")
              : t("workspace.repositories.disableWorkflow")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
