import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueTrackingDirection, GitHubIssueTrackingPage } from "./github-data";

export type GitHubIssueTrackingTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
  expectedIssueNodeId: string;
  direction: GitHubIssueTrackingDirection;
  after: string | null;
};

export const githubIssueTrackingQueryKeys = {
  root: (target: Omit<GitHubIssueTrackingTarget, "expectedIssueNodeId" | "after">) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue",
      target.issueNumber,
      "tracking",
      target.direction,
    ] as const,
  page: (target: GitHubIssueTrackingTarget) =>
    [...githubIssueTrackingQueryKeys.root(target), target.after] as const,
};

export function issueTrackingQueryOptions(target: GitHubIssueTrackingTarget) {
  return queryOptions({
    queryKey: githubIssueTrackingQueryKeys.page(target),
    queryFn: () => invoke<GitHubIssueTrackingPage>("github_get_repository_issue_tracking", target),
    staleTime: 30_000,
  });
}
