import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueLinkedPullRequestPage } from "./github-data";

export type GitHubIssueLinkedPullRequestTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
  expectedIssueNodeId: string;
  after: string | null;
};

export const githubIssueLinkedPullRequestQueryKeys = {
  root: (target: Omit<GitHubIssueLinkedPullRequestTarget, "expectedIssueNodeId" | "after">) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue",
      target.issueNumber,
      "linked-pull-requests",
    ] as const,
  page: (target: GitHubIssueLinkedPullRequestTarget) =>
    [...githubIssueLinkedPullRequestQueryKeys.root(target), target.after] as const,
};

export function issueLinkedPullRequestQueryOptions(target: GitHubIssueLinkedPullRequestTarget) {
  return queryOptions({
    queryKey: githubIssueLinkedPullRequestQueryKeys.page(target),
    queryFn: () =>
      invoke<GitHubIssueLinkedPullRequestPage>(
        "github_get_repository_issue_linked_pull_requests",
        target
      ),
    staleTime: 30_000,
  });
}
