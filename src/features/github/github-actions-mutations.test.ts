import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkflowDispatchDraft,
  downloadWorkflowArtifact,
  dispatchWorkflow,
  invalidateWorkflowDispatch,
  invalidateWorkflowRunAction,
  prepareWorkflowDispatchInputs,
  requestWorkflowJobRerun,
  requestWorkflowRunAction,
  workflowJobCanRerun,
  workflowRunCanCancel,
  workflowRunCanRerun,
  workflowRunHasFailedJobs,
} from "./github-actions-mutations";
import type {
  GitHubWorkflowDispatchConfig,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = {
  owner: "octocat",
  repository: "hello-world",
  runId: 42,
};

const run: GitHubWorkflowRun = {
  id: target.runId,
  workflowId: 7,
  workflowName: "CI",
  title: "Keep Actions inside Harbor",
  runNumber: 19,
  runAttempt: 1,
  event: "push",
  status: "completed",
  conclusion: "failure",
  headBranch: "main",
  headSha: "abcdef123456",
  headCommitMessage: "Keep Actions inside Harbor",
  actor: "octocat",
  actorAvatarUrl: "https://github.com/octocat.png",
  createdAt: "2026-08-26T08:00:00Z",
  updatedAt: "2026-08-26T08:05:00Z",
  startedAt: "2026-08-26T08:00:05Z",
  url: "https://github.com/octocat/hello-world/actions/runs/42",
};

const job: GitHubWorkflowJob = {
  id: 84,
  name: "frontend / test",
  status: "completed",
  conclusion: "failure",
  startedAt: "2026-08-26T08:00:00Z",
  completedAt: "2026-08-26T08:01:00Z",
  runnerName: "GitHub Actions 2",
  labels: ["ubuntu-latest"],
  steps: [],
  url: "https://github.com/octocat/hello-world/actions/runs/42/job/84",
};

const dispatchConfig: GitHubWorkflowDispatchConfig = {
  workflow: {
    id: 7,
    name: "Release",
    path: ".github/workflows/release.yml",
    state: "active",
    url: "https://github.com/octocat/hello-world/actions/workflows/release.yml",
  },
  reference: "main",
  dispatchable: true,
  inputs: [
    {
      name: "release_name",
      description: "Release name",
      required: true,
      inputType: "string",
      defaultValue: null,
      options: [],
    },
    {
      name: "dry_run",
      description: null,
      required: false,
      inputType: "boolean",
      defaultValue: false,
      options: [],
    },
    {
      name: "channel",
      description: null,
      required: true,
      inputType: "choice",
      defaultValue: "nightly",
      options: ["nightly", "stable"],
    },
    {
      name: "retries",
      description: null,
      required: false,
      inputType: "number",
      defaultValue: 2,
      options: [],
    },
  ],
};

describe("GitHub Actions mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("invokes the focused Tauri command with each official run action", async () => {
    await requestWorkflowRunAction(target, "cancel");
    await requestWorkflowRunAction(target, "rerunAll");
    await requestWorkflowRunAction(target, "rerunFailed");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_request_workflow_run_action", {
      ...target,
      action: "cancel",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_request_workflow_run_action", {
      ...target,
      action: "rerunAll",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_request_workflow_run_action", {
      ...target,
      action: "rerunFailed",
    });
  });

  it("reruns a specific workflow Job through its focused Tauri command", async () => {
    await requestWorkflowJobRerun({ ...target, jobId: job.id });

    expect(invoke).toHaveBeenCalledWith("github_request_workflow_job_rerun", {
      ...target,
      jobId: job.id,
    });
  });

  it("downloads a workflow artifact through the native Save As command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ saved: true, path: "/tmp/frontend-dist.zip" });

    await downloadWorkflowArtifact({
      ...target,
      artifactId: 96,
      artifactName: "frontend-dist",
    });

    expect(invoke).toHaveBeenCalledWith("github_download_workflow_artifact", {
      ...target,
      artifactId: 96,
      artifactName: "frontend-dist",
    });
  });

  it("dispatches a workflow through the official Tauri write boundary", async () => {
    await dispatchWorkflow({
      owner: target.owner,
      repository: target.repository,
      workflowId: 7,
      reference: "main",
      inputs: { release_name: "v1.0.0", dry_run: false },
    });

    expect(invoke).toHaveBeenCalledWith("github_dispatch_workflow", {
      owner: "octocat",
      repository: "hello-world",
      workflowId: 7,
      reference: "main",
      inputs: { release_name: "v1.0.0", dry_run: false },
    });
  });

  it("initializes and validates typed workflow dispatch inputs", () => {
    const draft = createWorkflowDispatchDraft(dispatchConfig);

    expect(draft).toEqual({
      release_name: "",
      dry_run: false,
      channel: "nightly",
      retries: "2",
    });
    expect(
      prepareWorkflowDispatchInputs(dispatchConfig, {
        ...draft,
        release_name: "v1.0.0",
        dry_run: true,
        retries: "3",
      })
    ).toEqual({
      inputs: {
        release_name: "v1.0.0",
        dry_run: true,
        channel: "nightly",
        retries: 3,
      },
      errors: {},
    });
    expect(
      prepareWorkflowDispatchInputs(dispatchConfig, {
        ...draft,
        release_name: " ",
        retries: "three",
      }).errors
    ).toEqual({ release_name: "required", retries: "number" });
  });

  it("invalidates every workflow run filter after a dispatch", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateWorkflowDispatch(queryClient, target);

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.workflowRunsRoot(target),
    });
  });

  it("invalidates every cached run list, direct run detail, and selected run Jobs", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateWorkflowRunAction(queryClient, target);

    expect(invalidate).toHaveBeenNthCalledWith(1, {
      queryKey: githubQueryKeys.workflowRunsRoot(target),
    });
    expect(invalidate).toHaveBeenNthCalledWith(2, {
      queryKey: githubQueryKeys.workflowRun(target),
    });
    expect(invalidate).toHaveBeenNthCalledWith(3, {
      queryKey: githubQueryKeys.workflowJobsRoot(target),
    });
  });

  it("gates cancel and rerun controls from the authoritative run state", () => {
    expect(workflowRunCanCancel({ ...run, status: "queued" })).toBe(true);
    expect(workflowRunCanCancel(run)).toBe(false);
    expect(workflowRunCanRerun(run)).toBe(true);
    expect(workflowRunCanRerun({ ...run, status: "in_progress" })).toBe(false);
    expect(workflowRunHasFailedJobs(run)).toBe(true);
    expect(workflowRunHasFailedJobs({ ...run, conclusion: "timed_out" })).toBe(true);
    expect(workflowRunHasFailedJobs({ ...run, conclusion: "success" })).toBe(false);
  });

  it("only exposes a Job rerun after GitHub marks the Job completed", () => {
    expect(workflowJobCanRerun(run, job)).toBe(true);
    expect(workflowJobCanRerun(run, { status: "completed" })).toBe(true);
    expect(workflowJobCanRerun(run, { status: "in_progress" })).toBe(false);
    expect(workflowJobCanRerun({ ...run, status: "in_progress" }, job)).toBe(false);
  });
});
