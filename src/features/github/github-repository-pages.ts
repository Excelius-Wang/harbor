import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubPagesMutation, GitHubPagesWorkspace } from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubRepositoryPagesTarget = {
  owner: string;
  repository: string;
};

export function mutateRepositoryPages(
  target: GitHubRepositoryPagesTarget,
  mutation: GitHubPagesMutation
) {
  return invoke<GitHubPagesWorkspace>("github_mutate_repository_pages", {
    ...target,
    mutation,
  });
}

export function syncRepositoryPages(
  queryClient: QueryClient,
  target: GitHubRepositoryPagesTarget,
  workspace: GitHubPagesWorkspace
) {
  queryClient.setQueriesData<GitHubPagesWorkspace>(
    { queryKey: githubQueryKeys.repositoryPagesRoot(target) },
    (current) => {
      if (!current) return current;
      if (!workspace.site) return { ...workspace, page: current.page };
      return {
        ...current,
        site: workspace.site,
        isArchived: workspace.isArchived,
        ...(current.page === workspace.page
          ? {
              builds: workspace.builds,
              hasPrevious: workspace.hasPrevious,
              hasMore: workspace.hasMore,
            }
          : {}),
      };
    }
  );
  queryClient.setQueryData(
    githubQueryKeys.repositoryPages({ ...target, page: workspace.page }),
    workspace
  );
  if (!workspace.site || !workspace.site.customDomain) {
    queryClient.removeQueries({ queryKey: githubQueryKeys.repositoryPagesHealth(target) });
  }
}

export async function refreshRepositoryPages(
  queryClient: QueryClient,
  target: GitHubRepositoryPagesTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositoryPagesRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositoryPagesHealth(target) }),
  ]);
}
