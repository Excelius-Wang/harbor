import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubForkInput,
  GitHubForkResult,
  GitHubRepository,
  GitHubRepositoryPage,
  GitHubRepositoryRelationship,
  GitHubRepositoryWatchLevel,
  GitHubStarredRepositoryPage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubRepositoryRelationshipTarget = {
  owner: string;
  repository: string;
};

export function updateRepositoryStar(target: GitHubRepositoryRelationshipTarget, starred: boolean) {
  return invoke<GitHubRepositoryRelationship>("github_update_repository_star", {
    ...target,
    starred,
  });
}

export function updateRepositoryWatch(
  target: GitHubRepositoryRelationshipTarget,
  watchLevel: GitHubRepositoryWatchLevel
) {
  return invoke<GitHubRepositoryRelationship>("github_update_repository_watch", {
    ...target,
    watchLevel,
  });
}

export function forkRepository(target: GitHubRepositoryRelationshipTarget, input: GitHubForkInput) {
  return invoke<GitHubForkResult>("github_fork_repository", {
    ...target,
    name: input.name,
    defaultBranchOnly: input.defaultBranchOnly,
  });
}

export function syncRepositoryRelationship(
  queryClient: QueryClient,
  target: GitHubRepositoryRelationshipTarget,
  relationship: GitHubRepositoryRelationship
) {
  queryClient.setQueryData(githubQueryKeys.repositoryRelationship(target), relationship);
}

export function syncRepositoryStar(
  queryClient: QueryClient,
  repository: GitHubRepository,
  relationship: GitHubRepositoryRelationship,
  wasStarred: boolean
) {
  const delta = relationship.starred === wasStarred ? 0 : relationship.starred ? 1 : -1;
  const updateRepository = (current: GitHubRepository) =>
    current.id === repository.id
      ? { ...current, stars: Math.max(0, current.stars + delta) }
      : current;

  syncRepositoryRelationship(
    queryClient,
    { owner: repository.owner, repository: repository.name },
    relationship
  );
  queryClient.setQueryData<InfiniteData<GitHubRepositoryPage>>(
    githubQueryKeys.repositories,
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              repositories: page.repositories.map(updateRepository),
            })),
          }
        : data
  );
  queryClient.setQueriesData<InfiniteData<GitHubStarredRepositoryPage>>(
    { queryKey: githubQueryKeys.starredRepositoriesRoot },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              repositories: page.repositories
                .filter(
                  (starred) => relationship.starred || starred.repository.id !== repository.id
                )
                .map((starred) => ({
                  ...starred,
                  repository: updateRepository(starred.repository),
                })),
            })),
          }
        : data
  );
}

export async function refreshStarredRepositories(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: githubQueryKeys.starredRepositoriesRoot });
}

export function syncPersonalFork(queryClient: QueryClient, fork: GitHubRepository) {
  queryClient.setQueryData<InfiniteData<GitHubRepositoryPage>>(
    githubQueryKeys.repositories,
    (data) => {
      if (!data || data.pages.some((page) => page.repositories.some(({ id }) => id === fork.id))) {
        return data;
      }
      const [firstPage, ...remainingPages] = data.pages;
      if (!firstPage) return data;
      return {
        ...data,
        pages: [
          { ...firstPage, repositories: [fork, ...firstPage.repositories] },
          ...remainingPages,
        ],
      };
    }
  );
}

export async function refreshPersonalRepositories(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositories });
}
