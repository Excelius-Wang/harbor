import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubWikiMutationResult,
  GitHubWikiPageMutationInput,
  GitHubWikiRevertInput,
  GitHubWikiPageSummary,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubWikiTarget = {
  owner: string;
  repository: string;
};

export function resolveWikiPagePath(
  destination: string,
  currentPath: string,
  pages: GitHubWikiPageSummary[]
) {
  const source = destination.split(/[?#]/, 1)[0];
  if (!source) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(source);
  } catch {
    return null;
  }
  const base = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";
  const resolved = [base, decoded]
    .filter(Boolean)
    .join("/")
    .split("/")
    .reduce<string[]>((segments, segment) => {
      if (segment === "..") segments.pop();
      else if (segment && segment !== ".") segments.push(segment);
      return segments;
    }, [])
    .join("/");
  if (!resolved) return null;
  const matches = pages.filter((page) => {
    const withoutExtension = page.path.replace(/\.[^./]+$/, "");
    return page.path === resolved || withoutExtension === resolved;
  });
  if (matches.length === 1) return matches[0].path;
  const folded = resolved.toLocaleLowerCase();
  const foldedMatches = pages.filter((page) => {
    const withoutExtension = page.path.replace(/\.[^./]+$/, "");
    return (
      page.path.toLocaleLowerCase() === folded || withoutExtension.toLocaleLowerCase() === folded
    );
  });
  return foldedMatches.length === 1 ? foldedMatches[0].path : null;
}

export function mutateRepositoryWikiPage(
  target: GitHubWikiTarget,
  input: GitHubWikiPageMutationInput
) {
  return invoke<GitHubWikiMutationResult>("github_mutate_repository_wiki_page", {
    ...target,
    input,
  });
}

export function deleteRepositoryWikiPage(
  target: GitHubWikiTarget,
  path: string,
  expectedHead: string,
  expectedBlobSha: string
) {
  return invoke<GitHubWikiMutationResult>("github_delete_repository_wiki_page", {
    ...target,
    path,
    expectedHead,
    expectedBlobSha,
  });
}

export function revertRepositoryWikiPage(target: GitHubWikiTarget, input: GitHubWikiRevertInput) {
  return invoke<GitHubWikiMutationResult>("github_revert_repository_wiki_page", {
    ...target,
    input,
  });
}

export function syncRepositoryWikiMutation(
  queryClient: QueryClient,
  target: GitHubWikiTarget,
  result: GitHubWikiMutationResult,
  previousPath?: string
) {
  queryClient.setQueryData(githubQueryKeys.repositoryWiki(target), result.overview);
  if (previousPath) {
    queryClient.removeQueries({
      queryKey: ["github", "repository", target.owner, target.repository, "wiki"],
      predicate: ({ queryKey }) => queryKey[queryKey.length - 1] === previousPath,
    });
  }
  if (result.page) {
    queryClient.setQueryData(
      githubQueryKeys.repositoryWikiPage({
        ...target,
        repositoryId: result.overview.repositoryId,
        headSha: result.page.headSha,
        path: result.page.path,
      }),
      result.page
    );
  }
  void queryClient.invalidateQueries({
    queryKey: githubQueryKeys.repositoryWiki(target),
  });
}
