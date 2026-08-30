import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueDuplicateReference } from "./github-data";

export type GitHubIssueDuplicateTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
  expectedIssueNodeId: string;
};

export const githubIssueDuplicateQueryKeys = {
  root: (target: Omit<GitHubIssueDuplicateTarget, "expectedIssueNodeId">) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue",
      target.issueNumber,
      "duplicate",
    ] as const,
};

export function issueDuplicateQueryOptions(target: GitHubIssueDuplicateTarget) {
  return queryOptions({
    queryKey: githubIssueDuplicateQueryKeys.root(target),
    queryFn: () =>
      invoke<GitHubIssueDuplicateReference | null>("github_get_repository_issue_duplicate", target),
    staleTime: 30_000,
  });
}
