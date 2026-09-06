import type * as Data from "@/features/github/github-data";
import { repositoryFixture } from "./repository-fixtures";
import { workspaceFixture } from "./workspace-fixtures";

export function createWorkflowFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean,
  includeNotificationTargets: boolean
) {
  const overrides = new Map<number, Partial<Data.GitHubWorkflowRun>>();
  const deleted = new Set<number>();
  const enabled = scenario !== null || includeNotificationTargets;
  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (!enabled) return undefined;
    const runId = Number(args.runId ?? 1);
    const baseRun = repositoryFixture(
      "github_get_repository_workflow_run",
      args,
      repositories,
      false
    ) as Data.GitHubWorkflowRun;
    const run: Data.GitHubWorkflowRun = {
      ...baseRun,
      ...(scenario === "running" ? { status: "in_progress", conclusion: null } : {}),
      ...(scenario === "queued" ? { status: "queued", conclusion: null } : {}),
      ...(scenario === "failed" ? { status: "completed", conclusion: "failure" } : {}),
      ...overrides.get(runId),
    };
    if (acceptWrites) {
      if (command === "github_request_workflow_run_action") {
        const action = args.action;
        if (action !== "cancel" && action !== "rerunAll" && action !== "rerunFailed")
          return undefined;
        overrides.set(runId, {
          status: action === "cancel" ? "completed" : "queued",
          conclusion: action === "cancel" ? "cancelled" : null,
          updatedAt: "2026-09-01T10:06:00Z",
        });
        return null;
      }
      if (command === "github_request_workflow_job_rerun") {
        overrides.set(runId, { status: "queued", conclusion: null });
        return null;
      }
      if (command === "github_delete_repository_workflow_run") {
        deleted.add(runId);
        return { runId } satisfies Data.GitHubWorkflowRunDeletion;
      }
      if (command === "github_download_workflow_artifact")
        return {
          saved: scenario !== "download-cancelled",
          path:
            scenario === "download-cancelled" ? null : "/controlled-preview/harbor-artifact.zip",
        } satisfies Data.GitHubFileDownloadResult;
    }
    switch (command) {
      case "github_list_repository_workflow_runs": {
        const result = repositoryFixture(
          command,
          args,
          repositories,
          empty
        ) as Data.GitHubWorkflowRunPage;
        const runs = result.runs
          .filter((item) => !deleted.has(item.id))
          .map((item) => ({
            ...item,
            ...(item.id === runId ? run : {}),
            ...overrides.get(item.id),
          }));
        return { ...result, runs, totalCount: runs.length } satisfies Data.GitHubWorkflowRunPage;
      }
      case "github_get_repository_workflow_run":
        if (deleted.has(runId))
          throw { code: "githubNotFound", message: "Preview workflow run was deleted" };
        return run;
      case "github_list_workflow_run_jobs": {
        const result = repositoryFixture(
          command,
          args,
          repositories,
          empty
        ) as Data.GitHubWorkflowJobPage;
        return {
          ...result,
          jobs: result.jobs.map((job, index) => ({
            ...job,
            name:
              index === 0
                ? "Frontend checks and keyboard navigation across compact desktop workspaces"
                : job.name,
            status: run.status === "completed" ? "completed" : run.status,
            conclusion:
              run.status !== "completed" ? null : index === 0 ? run.conclusion : job.conclusion,
            steps: job.steps.map((step, stepIndex) => ({
              ...step,
              conclusion:
                index === 0 && stepIndex === 2 && run.conclusion === "failure"
                  ? "failure"
                  : step.conclusion,
            })),
          })),
        } satisfies Data.GitHubWorkflowJobPage;
      }
      case "github_get_workflow_job_log": {
        const result = repositoryFixture(
          command,
          args,
          repositories,
          empty
        ) as Data.GitHubWorkflowJobLog;
        return {
          ...result,
          content: empty
            ? ""
            : run.conclusion === "failure"
              ? result.content.replace("All checks passed", "Workspace verification failed")
              : result.content,
          truncated: scenario === "truncated",
        } satisfies Data.GitHubWorkflowJobLog;
      }
      case "github_list_workflow_run_artifacts": {
        const result = repositoryFixture(
          command,
          args,
          repositories,
          empty
        ) as Data.GitHubWorkflowArtifactPage;
        return {
          ...result,
          totalCount: empty ? 0 : 2,
          artifacts: empty
            ? []
            : [
                {
                  ...result.artifacts[0],
                  name: "harbor-desktop-workspace-accessibility-and-native-build-results-macos-arm64",
                },
                { ...result.artifacts[0], id: 2, name: "Previous build results", expired: true },
              ],
        } satisfies Data.GitHubWorkflowArtifactPage;
      }
      case "github_get_repository_check_suite":
        return {
          id: Number(args.checkSuiteId ?? 1),
          headSha: run.headSha,
          headBranch: run.headBranch ?? undefined,
          status: run.status,
          conclusion: run.conclusion ?? undefined,
          appName: "Harbor workspace checks",
        } satisfies Data.GitHubCheckSuite;
      case "github_list_repository_check_suite_runs": {
        const result = workspaceFixture(
          "github_list_repository_checks",
          args,
          repositories,
          empty
        ) as Data.GitHubCheckPage;
        return {
          ...result,
          totalCount: empty ? 0 : result.checks.length,
          checks: empty
            ? []
            : result.checks.map((check, index) => ({
                ...check,
                status: run.status,
                conclusion:
                  run.status === "completed"
                    ? index === 0
                      ? (run.conclusion ?? "success")
                      : "success"
                    : undefined,
                description:
                  run.status !== "completed"
                    ? "Running workspace checks"
                    : index === 0 && run.conclusion === "failure"
                      ? "Workspace verification failed"
                      : "Workspace verification passed",
              })),
        } satisfies Data.GitHubCheckPage;
      }
      default:
        return undefined;
    }
  };
}
