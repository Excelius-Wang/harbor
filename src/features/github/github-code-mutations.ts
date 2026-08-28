import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubBranch,
  GitHubCodeOverview,
  GitHubRepositoryFileCommit,
  GitHubRepositoryFileMutation,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubCodeMutationTarget = {
  owner: string;
  repository: string;
};

export function commitRepositoryFile(
  target: GitHubCodeMutationTarget,
  branch: string,
  message: string,
  mutation: GitHubRepositoryFileMutation
) {
  return invoke<GitHubRepositoryFileCommit>("github_commit_repository_file", {
    ...target,
    branch,
    message,
    mutation,
  });
}

export function createRepositoryBranch(
  target: GitHubCodeMutationTarget,
  sourceBranch: string,
  expectedSourceSha: string,
  branch: string
) {
  return invoke<GitHubBranch>("github_create_repository_branch", {
    ...target,
    sourceBranch,
    expectedSourceSha,
    branch,
  });
}

export function deleteRepositoryBranch(
  target: GitHubCodeMutationTarget,
  branch: string,
  expectedSha: string
) {
  return invoke<void>("github_delete_repository_branch", {
    ...target,
    branch,
    expectedSha,
  });
}

export function syncCreatedRepositoryBranch(
  queryClient: QueryClient,
  target: GitHubCodeMutationTarget,
  branch: GitHubBranch
) {
  queryClient.setQueriesData<GitHubCodeOverview>(
    { queryKey: githubQueryKeys.codeRoot(target) },
    (overview) =>
      overview
        ? {
            ...overview,
            branches: [
              branch,
              ...overview.branches.filter((candidate) => candidate.name !== branch.name),
            ],
          }
        : overview
  );
}

export function syncDeletedRepositoryBranch(
  queryClient: QueryClient,
  target: GitHubCodeMutationTarget,
  branch: string
) {
  queryClient.setQueriesData<GitHubCodeOverview>(
    { queryKey: githubQueryKeys.codeRoot(target) },
    (overview) =>
      overview
        ? {
            ...overview,
            branches: overview.branches.filter((candidate) => candidate.name !== branch),
          }
        : overview
  );
}

export function syncRepositoryFileCommit(
  queryClient: QueryClient,
  target: GitHubCodeMutationTarget,
  commit: GitHubRepositoryFileCommit
) {
  queryClient.setQueriesData<GitHubCodeOverview>(
    { queryKey: githubQueryKeys.codeRoot(target) },
    (overview) =>
      overview
        ? {
            ...overview,
            branches: overview.branches.some((branch) => branch.name === commit.branch)
              ? overview.branches.map((branch) =>
                  branch.name === commit.branch ? { ...branch, sha: commit.commitSha } : branch
                )
              : [
                  { name: commit.branch, sha: commit.commitSha, protected: false },
                  ...overview.branches,
                ],
          }
        : overview
  );
  queryClient.setQueryData<GitHubCodeOverview>(
    githubQueryKeys.code({ ...target, reference: commit.branch }),
    (overview) =>
      overview
        ? {
            ...overview,
            commits: [
              {
                sha: commit.commitSha,
                shortSha: commit.shortSha,
                title: commit.message.split("\n", 1)[0] ?? commit.message,
                author: null,
                url: commit.url,
              },
              ...overview.commits.filter((candidate) => candidate.sha !== commit.commitSha),
            ].slice(0, 8),
          }
        : overview
  );
  const affectedPaths = new Set(
    [commit.file?.path, commit.previousPath].filter((path): path is string => Boolean(path))
  );
  for (const path of affectedPaths) {
    queryClient.removeQueries({
      queryKey: githubQueryKeys.file({
        ...target,
        reference: commit.branch,
        path,
      }),
      exact: true,
    });
    queryClient.removeQueries({
      queryKey: githubQueryKeys.contents({
        ...target,
        reference: commit.branch,
        path: path.split("/").slice(0, -1).join("/"),
      }),
      exact: true,
    });
  }
}

export function refreshRepositoryAfterCodeMutation(
  queryClient: QueryClient,
  target: GitHubCodeMutationTarget
) {
  return queryClient.invalidateQueries({
    queryKey: ["github", "repository", target.owner, target.repository],
    refetchType: "active",
  });
}
