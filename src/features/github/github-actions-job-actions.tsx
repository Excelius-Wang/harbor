import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import {
  invalidateWorkflowRunAction,
  requestWorkflowJobRerun,
  workflowJobCanRerun,
} from "./github-actions-mutations";
import type { GitHubRepository, GitHubWorkflowJob, GitHubWorkflowRun } from "./github-data";

export function useGitHubWorkflowJobRerun({
  repository,
  runId,
  onAccepted,
}: {
  repository: GitHubRepository;
  runId: number;
  onAccepted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = {
    owner: repository.owner,
    repository: repository.name,
    runId,
  };
  const mutation = useMutation({
    mutationFn: (job: GitHubWorkflowJob) => requestWorkflowJobRerun({ ...target, jobId: job.id }),
    onSuccess: async (_, job) => {
      toast.success(
        t("workspace.repositories.workflowJobRerunRequested", {
          name: job.name,
        })
      );
      onAccepted();
      await invalidateWorkflowRunAction(queryClient, target);
    },
    onError: (reason, job) => {
      const error = parseIpcError(reason);
      if (error.code === "validation") {
        void invalidateWorkflowRunAction(queryClient, target);
      }
      toast.error(
        t("workspace.repositories.workflowJobRerunFailed", {
          name: job.name,
        }),
        {
          description:
            error.code === "githubPermission"
              ? t("workspace.repositories.workflowRunWritePermissionDenied")
              : error.message,
        }
      );
    },
  });

  return {
    isPending: mutation.isPending,
    pendingJobId: mutation.isPending ? (mutation.variables?.id ?? null) : null,
    rerun: mutation.mutate,
  };
}

export function GitHubWorkflowJobRerunButton({
  run,
  job,
  disabled,
  pending,
  onRerun,
}: {
  run: GitHubWorkflowRun;
  job: GitHubWorkflowJob;
  disabled: boolean;
  pending: boolean;
  onRerun: () => void;
}) {
  const { t } = useTranslation();
  if (!workflowJobCanRerun(run, job)) return null;

  const label = pending
    ? t("workspace.repositories.rerunningWorkflowJob", { name: job.name })
    : t("workspace.repositories.rerunWorkflowJob", { name: job.name });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onRerun}
        >
          {pending ? <Spinner /> : <RotateCcw />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
