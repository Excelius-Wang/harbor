import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubRepository,
  GitHubRepositoryCreateInput,
  GitHubRepositoryPage,
  GitHubRepositorySettings,
  GitHubRepositorySettingsUpdate,
  GitHubStarredRepositoryPage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubRepositorySettingsTarget = {
  owner: string;
  repository: string;
};

export function createPersonalRepository(input: GitHubRepositoryCreateInput) {
  return invoke<GitHubRepositorySettings>("github_create_personal_repository", { input });
}

export function updatePersonalRepositorySettings(
  target: GitHubRepositorySettingsTarget,
  update: GitHubRepositorySettingsUpdate
) {
  return invoke<GitHubRepositorySettings>("github_update_personal_repository_settings", {
    ...target,
    update,
  });
}

export function deletePersonalRepository(
  target: GitHubRepositorySettingsTarget,
  confirmation: string
) {
  return invoke<void>("github_delete_personal_repository", { ...target, confirmation });
}

function updateRepositoryPages(
  queryClient: QueryClient,
  update: (repository: GitHubRepository) => GitHubRepository | null
) {
  queryClient.setQueryData<InfiniteData<GitHubRepositoryPage>>(
    githubQueryKeys.repositories,
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              repositories: page.repositories.flatMap((repository) => {
                const next = update(repository);
                return next ? [next] : [];
              }),
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
              repositories: page.repositories.flatMap((starred) => {
                const next = update(starred.repository);
                return next ? [{ ...starred, repository: next }] : [];
              }),
            })),
          }
        : data
  );
}

export function syncCreatedPersonalRepository(
  queryClient: QueryClient,
  settings: GitHubRepositorySettings
) {
  const repository = settings.repository;
  queryClient.setQueryData<InfiniteData<GitHubRepositoryPage>>(
    githubQueryKeys.repositories,
    (data) => {
      if (
        !data ||
        data.pages.some((page) => page.repositories.some(({ id }) => id === repository.id))
      ) {
        return data;
      }
      const [firstPage, ...remainingPages] = data.pages;
      if (!firstPage) return data;
      return {
        ...data,
        pages: [
          { ...firstPage, repositories: [repository, ...firstPage.repositories] },
          ...remainingPages,
        ],
      };
    }
  );
  queryClient.setQueryData(
    githubQueryKeys.repositorySettings({
      owner: repository.owner,
      repository: repository.name,
    }),
    settings
  );
}

export function syncUpdatedPersonalRepository(
  queryClient: QueryClient,
  target: GitHubRepositorySettingsTarget,
  settings: GitHubRepositorySettings
) {
  updateRepositoryPages(queryClient, (repository) =>
    repository.id === settings.repository.id ? settings.repository : repository
  );
  if (target.repository !== settings.repository.name) {
    queryClient.removeQueries({
      queryKey: ["github", "repository", target.owner, target.repository],
    });
  }
  queryClient.setQueryData(
    githubQueryKeys.repositorySettings({
      owner: settings.repository.owner,
      repository: settings.repository.name,
    }),
    settings
  );
}

export function syncDeletedPersonalRepository(
  queryClient: QueryClient,
  target: GitHubRepositorySettingsTarget,
  repositoryId: number
) {
  updateRepositoryPages(queryClient, (repository) =>
    repository.id === repositoryId ? null : repository
  );
  queryClient.removeQueries({
    queryKey: ["github", "repository", target.owner, target.repository],
  });
}

export async function refreshPersonalRepositoryLists(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositories }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.starredRepositoriesRoot }),
  ]);
}
