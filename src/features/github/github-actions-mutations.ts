import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubWorkflowDispatchConfig,
  GitHubWorkflowDispatchOptions,
  GitHubFileDownloadResult,
  GitHubWorkflow,
  GitHubWorkflowDispatchValue,
  GitHubWorkflowJob,
  GitHubWorkflowJobPage,
  GitHubWorkflowRun,
  GitHubWorkflowRunAction,
  GitHubWorkflowRunDeletion,
  GitHubWorkflowRunPage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubWorkflowRunMutationTarget = {
  owner: string;
  repository: string;
  runId: number;
};

export type GitHubWorkflowStateMutationTarget = {
  owner: string;
  repository: string;
  workflowId: number;
  expectedState: string;
  enabled: boolean;
};

export type GitHubWorkflowRunDeletionTarget = GitHubWorkflowRunMutationTarget & {
  expectedWorkflowId: number;
  expectedUpdatedAt: string;
};

export type GitHubWorkflowJobMutationTarget = GitHubWorkflowRunMutationTarget & {
  jobId: number;
};

export type GitHubWorkflowArtifactDownloadTarget = GitHubWorkflowRunMutationTarget & {
  artifactId: number;
  artifactName: string;
};

export type GitHubWorkflowDispatchTarget = {
  owner: string;
  repository: string;
  workflowId: number;
  reference: string;
  inputs: Record<string, GitHubWorkflowDispatchValue>;
};

export type GitHubWorkflowDispatchDraft = Record<string, string | boolean>;
export type GitHubWorkflowDispatchFieldError = "required" | "number" | "option";

export function requestWorkflowRunAction(
  target: GitHubWorkflowRunMutationTarget,
  action: GitHubWorkflowRunAction
) {
  return invoke<void>("github_request_workflow_run_action", {
    ...target,
    action,
  });
}

export function setWorkflowEnabled(target: GitHubWorkflowStateMutationTarget) {
  return invoke<GitHubWorkflow>("github_set_repository_workflow_enabled", target);
}

export function deleteWorkflowRun(target: GitHubWorkflowRunDeletionTarget) {
  return invoke<GitHubWorkflowRunDeletion>("github_delete_repository_workflow_run", target);
}

export function requestWorkflowJobRerun(target: GitHubWorkflowJobMutationTarget) {
  return invoke<void>("github_request_workflow_job_rerun", target);
}

export function downloadWorkflowArtifact(target: GitHubWorkflowArtifactDownloadTarget) {
  return invoke<GitHubFileDownloadResult>("github_download_workflow_artifact", target);
}

export function dispatchWorkflow(target: GitHubWorkflowDispatchTarget) {
  return invoke<void>("github_dispatch_workflow", target);
}

export async function invalidateWorkflowDispatch(
  queryClient: QueryClient,
  target: Pick<GitHubWorkflowDispatchTarget, "owner" | "repository">
) {
  await queryClient.invalidateQueries({ queryKey: githubQueryKeys.workflowRunsRoot(target) });
}

export function createWorkflowDispatchDraft(
  config: GitHubWorkflowDispatchConfig
): GitHubWorkflowDispatchDraft {
  return Object.fromEntries(
    config.inputs.map((input) => {
      if (input.inputType === "boolean") {
        return [input.name, typeof input.defaultValue === "boolean" ? input.defaultValue : false];
      }
      if (input.defaultValue !== null) {
        return [input.name, String(input.defaultValue)];
      }
      if (input.inputType === "choice") {
        return [input.name, input.options[0] ?? ""];
      }
      return [input.name, ""];
    })
  );
}

export function prepareWorkflowDispatchInputs(
  config: GitHubWorkflowDispatchConfig,
  draft: GitHubWorkflowDispatchDraft
) {
  const inputs: Record<string, GitHubWorkflowDispatchValue> = {};
  const errors: Record<string, GitHubWorkflowDispatchFieldError> = {};

  for (const definition of config.inputs) {
    const draftValue = draft[definition.name];
    if (definition.inputType === "boolean") {
      inputs[definition.name] = draftValue === true;
      continue;
    }

    const value = typeof draftValue === "string" ? draftValue : "";
    if (!value.trim()) {
      if (definition.required) errors[definition.name] = "required";
      continue;
    }
    if (definition.inputType === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        errors[definition.name] = "number";
      } else {
        inputs[definition.name] = number;
      }
      continue;
    }
    if (
      (definition.inputType === "choice" || definition.inputType === "environment") &&
      !definition.options.includes(value)
    ) {
      errors[definition.name] = "option";
      continue;
    }
    inputs[definition.name] = value;
  }

  return { inputs, errors };
}

export async function invalidateWorkflowRunAction(
  queryClient: QueryClient,
  target: GitHubWorkflowRunMutationTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.workflowRunsRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.workflowRun(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.workflowJobsRoot(target) }),
  ]);
}

export async function reconcileWorkflowState(
  queryClient: QueryClient,
  target: GitHubWorkflowStateMutationTarget,
  workflow: GitHubWorkflow
) {
  const repositoryTarget = { owner: target.owner, repository: target.repository };
  const replaceWorkflow = (current: GitHubWorkflow) =>
    current.id === workflow.id ? workflow : current;

  queryClient.setQueryData<GitHubWorkflow[]>(
    githubQueryKeys.workflows(repositoryTarget),
    (current) => current?.map(replaceWorkflow)
  );
  queryClient.setQueryData<GitHubWorkflowDispatchOptions>(
    githubQueryKeys.workflowDispatchOptions(repositoryTarget),
    (current) =>
      current
        ? {
            ...current,
            workflows: current.workflows.map(replaceWorkflow),
          }
        : current
  );
  queryClient.setQueriesData<GitHubWorkflowDispatchConfig>(
    { queryKey: githubQueryKeys.workflowDispatchRoot(repositoryTarget) },
    (current) => {
      if (!current?.workflow || current.workflow.id !== workflow.id) return current;
      return {
        ...current,
        workflow,
        dispatchable: workflow.state === "active" ? current.dispatchable : false,
      };
    }
  );

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.workflows(repositoryTarget) }),
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.workflowDispatchRoot(repositoryTarget),
    }),
  ]);
}

export async function reconcileWorkflowRunDeletion(
  queryClient: QueryClient,
  target: GitHubWorkflowRunDeletionTarget,
  deletion: GitHubWorkflowRunDeletion
) {
  const runTarget = { owner: target.owner, repository: target.repository, runId: deletion.runId };
  const jobPages = queryClient.getQueriesData<GitHubWorkflowJobPage>({
    queryKey: githubQueryKeys.workflowJobsRoot(runTarget),
  });

  queryClient.setQueriesData<GitHubWorkflowRunPage>(
    { queryKey: githubQueryKeys.workflowRunsRoot(target) },
    (current) => {
      if (!current?.runs.some((run) => run.id === deletion.runId)) return current;
      return {
        ...current,
        runs: current.runs.filter((run) => run.id !== deletion.runId),
        totalCount: Math.max(0, current.totalCount - 1),
      };
    }
  );
  queryClient.removeQueries({ queryKey: githubQueryKeys.workflowRun(runTarget) });
  for (const [, page] of jobPages) {
    for (const job of page?.jobs ?? []) {
      queryClient.removeQueries({
        queryKey: githubQueryKeys.workflowJobLog({
          owner: target.owner,
          repository: target.repository,
          jobId: job.id,
        }),
      });
    }
  }

  await queryClient.invalidateQueries({ queryKey: githubQueryKeys.workflowRunsRoot(target) });
}

export function workflowRunCanCancel(run: Pick<GitHubWorkflowRun, "status">) {
  return run.status !== "completed";
}

export function workflowRunCanRerun(run: Pick<GitHubWorkflowRun, "status">) {
  return run.status === "completed";
}

export function workflowRunCanDelete(
  run: Pick<GitHubWorkflowRun, "status" | "createdAt">,
  now = Date.now()
) {
  if (run.status === "completed") return true;
  const createdAt = Date.parse(run.createdAt);
  return Number.isFinite(createdAt) && createdAt <= now - 14 * 24 * 60 * 60 * 1_000;
}

export function workflowStateAction(state: string): "enable" | "disable" | null {
  if (state === "active") return "disable";
  if (state === "disabled_manually" || state === "disabled_inactivity") return "enable";
  return null;
}

export function workflowRunHasFailedJobs(run: Pick<GitHubWorkflowRun, "status" | "conclusion">) {
  return (
    run.status === "completed" && (run.conclusion === "failure" || run.conclusion === "timed_out")
  );
}

export function workflowJobCanRerun(
  run: Pick<GitHubWorkflowRun, "status">,
  job: Pick<GitHubWorkflowJob, "status">
) {
  return run.status === "completed" && job.status === "completed";
}
