import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssue, GitHubIssueStateCapabilities } from "./github-data";
import type { GitHubIssueMutationTarget } from "./github-issue-mutations";

export const githubIssueStateQueryKeys = {
  capabilitiesRoot: (target: GitHubIssueMutationTarget) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue-state-capabilities",
      target.issueNumber,
    ] as const,
  capabilities: (target: GitHubIssueMutationTarget, updatedAt: string) =>
    [...githubIssueStateQueryKeys.capabilitiesRoot(target), updatedAt] as const,
};

export function issueStateCapabilitiesQueryOptions(
  target: GitHubIssueMutationTarget,
  updatedAt: string
) {
  return queryOptions({
    queryKey: githubIssueStateQueryKeys.capabilities(target, updatedAt),
    queryFn: () =>
      invoke<GitHubIssueStateCapabilities>("github_get_repository_issue_state_capabilities", {
        ...target,
      }),
    staleTime: 60_000,
  });
}

function normalizeReason(reason?: string) {
  return reason === "not_planned" ? "notPlanned" : (reason ?? null);
}

export function issueStateCapabilitiesMatchIssue(
  capabilities: GitHubIssueStateCapabilities,
  issue: GitHubIssue,
  target: GitHubIssueMutationTarget
) {
  return (
    capabilities.repositoryFullName.toLowerCase() ===
      `${target.owner}/${target.repository}`.toLowerCase() &&
    capabilities.issueNodeId === issue.reactionSubject.id &&
    capabilities.number === issue.number &&
    capabilities.state === issue.state &&
    normalizeReason(capabilities.stateReason) === normalizeReason(issue.stateReason) &&
    Date.parse(capabilities.updatedAt) === Date.parse(issue.updatedAt)
  );
}

export function invalidateIssueStateCapabilities(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget
) {
  return queryClient.invalidateQueries({
    queryKey: githubIssueStateQueryKeys.capabilitiesRoot(target),
  });
}
