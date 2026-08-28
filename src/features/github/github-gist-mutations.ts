import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubGist,
  GitHubGistComment,
  GitHubGistCommentMutation,
  GitHubGistCommentPage,
  GitHubGistCreateInput,
  GitHubGistPage,
  GitHubGistSource,
  GitHubGistUpdateInput,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

const gistSources: GitHubGistSource[] = ["mine", "starred", "public"];

export function createGist(input: GitHubGistCreateInput) {
  return invoke<GitHubGist>("github_create_gist", { input });
}

export function updateGist(gistId: string, input: GitHubGistUpdateInput) {
  return invoke<GitHubGist>("github_update_gist", { gistId, input });
}

export function deleteGist(gistId: string, confirmation: string) {
  return invoke<void>("github_delete_gist", { gistId, confirmation });
}

export function updateGistStar(gistId: string, starred: boolean) {
  return invoke<GitHubGist>("github_update_gist_star", { gistId, starred });
}

export function forkGist(gistId: string) {
  return invoke<GitHubGist>("github_fork_gist", { gistId });
}

export function mutateGistComment(gistId: string, mutation: GitHubGistCommentMutation) {
  return invoke<GitHubGistComment | null>("github_mutate_gist_comment", { gistId, mutation });
}

function sourceContainsGist(source: GitHubGistSource, gist: GitHubGist) {
  if (source === "mine") return gist.viewerOwns;
  if (source === "starred") return gist.starred;
  return gist.public;
}

function updateGistPage(
  data: InfiniteData<GitHubGistPage> | undefined,
  gist: GitHubGist,
  source: GitHubGistSource,
  addIfMissing: boolean
) {
  if (!data) return data;
  let found = false;
  const shouldContain = sourceContainsGist(source, gist);
  const pages = data.pages.map((page) => ({
    ...page,
    gists: page.gists.flatMap((current) => {
      if (current.id !== gist.id) return [current];
      found = true;
      return shouldContain ? [gist] : [];
    }),
  }));
  if (shouldContain && addIfMissing && !found && pages[0]) {
    pages[0] = { ...pages[0], gists: [gist, ...pages[0].gists] };
  }
  return { ...data, pages };
}

export function syncGist(queryClient: QueryClient, gist: GitHubGist, addIfMissing = false) {
  queryClient.setQueryData(githubQueryKeys.gist({ gistId: gist.id }), gist);
  for (const source of gistSources) {
    queryClient.setQueryData<InfiniteData<GitHubGistPage>>(
      githubQueryKeys.gists({ source }),
      (data) => updateGistPage(data, gist, source, addIfMissing)
    );
  }
}

export function syncDeletedGist(queryClient: QueryClient, gistId: string) {
  for (const source of gistSources) {
    queryClient.setQueryData<InfiniteData<GitHubGistPage>>(
      githubQueryKeys.gists({ source }),
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                gists: page.gists.filter((gist) => gist.id !== gistId),
              })),
            }
          : data
    );
  }
  queryClient.removeQueries({ queryKey: githubQueryKeys.gistRoot(gistId) });
}

function updateGistCommentCount(queryClient: QueryClient, gistId: string, change: number) {
  const update = (gist: GitHubGist) => ({
    ...gist,
    comments: Math.max(0, gist.comments + change),
  });
  queryClient.setQueryData<GitHubGist>(githubQueryKeys.gist({ gistId }), (gist) =>
    gist ? update(gist) : gist
  );
  for (const source of gistSources) {
    queryClient.setQueryData<InfiniteData<GitHubGistPage>>(
      githubQueryKeys.gists({ source }),
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                gists: page.gists.map((gist) => (gist.id === gistId ? update(gist) : gist)),
              })),
            }
          : data
    );
  }
}

export function syncGistComment(
  queryClient: QueryClient,
  gistId: string,
  comment: GitHubGistComment,
  addIfMissing = false
) {
  let found = false;
  queryClient.setQueryData<InfiniteData<GitHubGistCommentPage>>(
    githubQueryKeys.gistComments({ gistId }),
    (data) => {
      if (!data) return data;
      const pages = data.pages.map((page) => ({
        ...page,
        comments: page.comments.map((current) => {
          if (current.id !== comment.id) return current;
          found = true;
          return comment;
        }),
      }));
      const lastPage = pages[pages.length - 1];
      if (addIfMissing && !found && lastPage && !lastPage.hasMore) {
        lastPage.comments = [...lastPage.comments, comment];
      }
      return { ...data, pages };
    }
  );
  if (addIfMissing && !found) updateGistCommentCount(queryClient, gistId, 1);
}

export function syncDeletedGistComment(
  queryClient: QueryClient,
  gistId: string,
  commentId: number
) {
  let removed = false;
  queryClient.setQueryData<InfiniteData<GitHubGistCommentPage>>(
    githubQueryKeys.gistComments({ gistId }),
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              comments: page.comments.filter((comment) => {
                if (comment.id === commentId) removed = true;
                return comment.id !== commentId;
              }),
            })),
          }
        : data
  );
  if (removed) updateGistCommentCount(queryClient, gistId, -1);
}

export function invalidateGists(queryClient: QueryClient, gistId?: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.gistsRoot }),
    gistId
      ? queryClient.invalidateQueries({ queryKey: githubQueryKeys.gistRoot(gistId) })
      : Promise.resolve(),
  ]);
}
