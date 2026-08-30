import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueDependenciesPage } from "./github-data";

export type GitHubIssueDependenciesTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
  page: number;
};

export const githubIssueDependencyQueryKeys = {
  root: (target: Omit<GitHubIssueDependenciesTarget, "page">) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue",
      target.issueNumber,
      "dependencies",
    ] as const,
  page: (target: GitHubIssueDependenciesTarget) =>
    [...githubIssueDependencyQueryKeys.root(target), target.page] as const,
};

export function issueDependenciesQueryOptions(target: GitHubIssueDependenciesTarget) {
  return queryOptions({
    queryKey: githubIssueDependencyQueryKeys.page(target),
    queryFn: () =>
      invoke<GitHubIssueDependenciesPage>("github_get_repository_issue_dependencies", target),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === target.owner &&
      previousQuery.queryKey[3] === target.repository &&
      previousQuery.queryKey[4] === "issue" &&
      previousQuery.queryKey[5] === target.issueNumber &&
      previousQuery.queryKey[6] === "dependencies"
        ? previous
        : undefined,
    staleTime: 30_000,
  });
}
