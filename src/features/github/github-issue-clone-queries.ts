import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueCloneStatus } from "./github-data";

export type GitHubIssueCloneTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
};

export const githubIssueCloneQueryKeys = {
  root: (target: GitHubIssueCloneTarget) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue",
      target.issueNumber,
      "clone-status",
    ] as const,
};

export function issueCloneStatusQueryOptions(target: GitHubIssueCloneTarget) {
  return queryOptions({
    queryKey: githubIssueCloneQueryKeys.root(target),
    queryFn: () =>
      invoke<GitHubIssueCloneStatus>("github_get_repository_issue_clone_status", target),
    staleTime: 30_000,
  });
}
