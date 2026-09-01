import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueTypeStatus } from "./github-data";
import { githubQueryKeys, type GitHubIssueTypeTarget } from "./github-queries";

export function updateRepositoryIssueType(
  target: GitHubIssueTypeTarget,
  expectedIssueNodeId: string,
  expectedIssueTypeNodeId: string | null,
  issueTypeNodeId: string | null
) {
  return invoke<GitHubIssueTypeStatus>("github_update_repository_issue_type", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    expectedIssueNodeId,
    expectedIssueTypeNodeId,
    issueTypeNodeId,
  });
}

export function syncRepositoryIssueType(
  queryClient: QueryClient,
  target: GitHubIssueTypeTarget,
  status: GitHubIssueTypeStatus
) {
  queryClient.setQueryData(githubQueryKeys.issueTypeStatus(target), status);
}

export async function invalidateRepositoryIssueType(
  queryClient: QueryClient,
  target: GitHubIssueTypeTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueTypeStatus(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueRoot(target) }),
  ]);
}
