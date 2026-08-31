import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueRelationshipsPage } from "./github-data";

export type GitHubIssueRelationshipTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
};

export type GitHubIssueRelationshipsTarget = GitHubIssueRelationshipTarget & {
  page: number;
};

export const githubIssueRelationshipQueryKeys = {
  root: (target: GitHubIssueRelationshipTarget) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue",
      target.issueNumber,
      "relationships",
    ] as const,
  page: (target: GitHubIssueRelationshipsTarget) =>
    [...githubIssueRelationshipQueryKeys.root(target), target.page] as const,
};

export function issueRelationshipsQueryOptions(target: GitHubIssueRelationshipsTarget) {
  return queryOptions({
    queryKey: githubIssueRelationshipQueryKeys.page(target),
    queryFn: () =>
      invoke<GitHubIssueRelationshipsPage>("github_get_repository_issue_relationships", target),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === target.owner &&
      previousQuery.queryKey[3] === target.repository &&
      previousQuery.queryKey[4] === "issue" &&
      previousQuery.queryKey[5] === target.issueNumber &&
      previousQuery.queryKey[6] === "relationships"
        ? previous
        : undefined,
    staleTime: 30_000,
  });
}
