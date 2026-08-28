import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubWorkflowDispatchConfig,
  GitHubFileDownloadResult,
  GitHubWorkflowDispatchValue,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
  GitHubWorkflowRunAction,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubWorkflowRunMutationTarget = {
  owner: string;
  repository: string;
  runId: number;
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

export function workflowRunCanCancel(run: Pick<GitHubWorkflowRun, "status">) {
  return run.status !== "completed";
}

export function workflowRunCanRerun(run: Pick<GitHubWorkflowRun, "status">) {
  return run.status === "completed";
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
