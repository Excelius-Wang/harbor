import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueCreationPolicy } from "./github-data";

export type GitHubIssueCreationPolicyTarget = {
  owner: string;
  repository: string;
};

export const githubIssueCreationPolicyQueryKeys = {
  root: (target: GitHubIssueCreationPolicyTarget) =>
    ["github", "repository", target.owner, target.repository, "issue", "creation-policy"] as const,
};

export function issueCreationPolicyQueryOptions(target: GitHubIssueCreationPolicyTarget) {
  return queryOptions({
    queryKey: githubIssueCreationPolicyQueryKeys.root(target),
    queryFn: () =>
      invoke<GitHubIssueCreationPolicy>("github_get_repository_issue_creation_policy", target),
    staleTime: 30_000,
  });
}
