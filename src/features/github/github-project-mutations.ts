import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubProjectDetail,
  GitHubProjectItem,
  GitHubProjectItemAction,
  GitHubProjectItemAddition,
  GitHubProjectItemUpdate,
  GitHubProjectPage,
  GitHubProjectSummary,
  GitHubProjectUpdate,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export function createPersonalProject(title: string) {
  return invoke<GitHubProjectSummary>("github_create_personal_project", { title });
}

export function updatePersonalProject(number: number, update: GitHubProjectUpdate) {
  return invoke<GitHubProjectSummary>("github_update_personal_project", { number, update });
}

export function deletePersonalProject(number: number) {
  return invoke<void>("github_delete_personal_project", { number });
}

export function addPersonalProjectItem(number: number, addition: GitHubProjectItemAddition) {
  return invoke<GitHubProjectItem>("github_add_personal_project_item", { number, addition });
}

export function updatePersonalProjectItem(
  number: number,
  itemId: string,
  update: GitHubProjectItemUpdate
) {
  return invoke<GitHubProjectItem>("github_update_personal_project_item", {
    number,
    itemId,
    update,
  });
}

export function changePersonalProjectItem(
  number: number,
  itemId: string,
  action: GitHubProjectItemAction
) {
  return invoke<GitHubProjectItem | null>("github_change_personal_project_item", {
    number,
    itemId,
    action,
  });
}

export function syncPersonalProject(queryClient: QueryClient, project: GitHubProjectSummary) {
  queryClient.setQueriesData<InfiniteData<GitHubProjectPage>>(
    { queryKey: githubQueryKeys.projectsRoot },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              projects: page.projects.map((current) =>
                current.id === project.id ? project : current
              ),
            })),
          }
        : data
  );
  queryClient.setQueriesData<InfiniteData<GitHubProjectDetail>>(
    { queryKey: githubQueryKeys.projectRoot(project.number) },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({ ...page, project })),
          }
        : data
  );
}

export function syncPersonalProjectItem(
  queryClient: QueryClient,
  number: number,
  item: GitHubProjectItem | null,
  deletedItemId?: string
) {
  queryClient.setQueriesData<InfiniteData<GitHubProjectDetail>>(
    { queryKey: githubQueryKeys.projectRoot(number) },
    (data) => {
      if (!data) return data;
      const targetId = item?.id ?? deletedItemId;
      if (!targetId) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: {
            ...page.items,
            items: page.items.items
              .filter((current) => current.id !== targetId)
              .concat(
                item && page.items.items.some((current) => current.id === targetId) ? [item] : []
              ),
          },
        })),
      };
    }
  );
}

export function syncDeletedPersonalProject(queryClient: QueryClient, number: number) {
  queryClient.removeQueries({ queryKey: githubQueryKeys.projectRoot(number) });
  queryClient.setQueriesData<InfiniteData<GitHubProjectPage>>(
    { queryKey: githubQueryKeys.projectsRoot },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              projects: page.projects.filter((project) => project.number !== number),
            })),
          }
        : data
  );
}

export function invalidatePersonalProjects(queryClient: QueryClient, number?: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.projectsRoot }),
    number === undefined
      ? Promise.resolve()
      : queryClient.invalidateQueries({ queryKey: githubQueryKeys.projectRoot(number) }),
  ]);
}
