import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubCodeOverview,
  GitHubContentListing,
  GitHubIssuePage,
  GitHubRepositoryPage,
} from "./github-data";

const GITHUB_QUERY_STALE_TIME = 60_000;

type GitHubCodeTarget = {
  owner: string;
  repository: string;
  reference: string;
};

type GitHubContentsTarget = GitHubCodeTarget & {
  path: string;
};

type GitHubRepositoryTarget = Pick<GitHubCodeTarget, "owner" | "repository">;

const githubQueryKeys = {
  all: ["github"] as const,
  repositories: ["github", "repositories"] as const,
  code: ({ owner, repository, reference }: GitHubCodeTarget) =>
    ["github", "repository", owner, repository, "code", reference] as const,
  contents: ({ owner, repository, reference, path }: GitHubContentsTarget) =>
    ["github", "repository", owner, repository, "contents", reference, path] as const,
  issues: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "issues"] as const,
};

export async function resetGitHubQueryCache(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: githubQueryKeys.all });
  const activeRefetch = queryClient.resetQueries({ queryKey: githubQueryKeys.all });
  queryClient.removeQueries({ queryKey: githubQueryKeys.all, type: "inactive" });
  await activeRefetch;
}

export function repositoriesQueryOptions() {
  return queryOptions({
    queryKey: githubQueryKeys.repositories,
    queryFn: () => invoke<GitHubRepositoryPage>("github_list_repositories"),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCodeQueryOptions(target: GitHubCodeTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.code(target),
    queryFn: () =>
      invoke<GitHubCodeOverview>("github_get_repository_code_overview", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryContentsQueryOptions(target: GitHubContentsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.contents(target),
    queryFn: () =>
      invoke<GitHubContentListing>("github_list_repository_contents", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
        path: target.path,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryIssuesQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.issues(target),
    queryFn: () =>
      invoke<GitHubIssuePage>("github_list_repository_issues", {
        owner: target.owner,
        repository: target.repository,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}
