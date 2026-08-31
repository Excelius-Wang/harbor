import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubIssuePinAction,
  GitHubPinnedIssuePage,
  GitHubRepositoryContentContext,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubIssuePinTarget = {
  owner: string;
  repository: string;
};

export type GitHubIssuePinMutationTarget = GitHubIssuePinTarget & {
  issueNumber: number;
  expectedIssueNodeId: string;
};

export const githubIssuePinQueryKeys = {
  root: ({ owner, repository }: GitHubIssuePinTarget) =>
    ["github", "repository", owner, repository, "pinned-issues"] as const,
};

export function repositoryPinnedIssuesQueryOptions(target: GitHubIssuePinTarget) {
  return queryOptions({
    queryKey: githubIssuePinQueryKeys.root(target),
    queryFn: () => invoke<GitHubPinnedIssuePage>("github_get_repository_pinned_issues", target),
    staleTime: 60_000,
  });
}

export function updateRepositoryIssuePin(
  target: GitHubIssuePinMutationTarget,
  action: GitHubIssuePinAction
) {
  return invoke<GitHubPinnedIssuePage>("github_update_repository_issue_pin", {
    input: { ...target, action },
  });
}

export function syncRepositoryPinnedIssues(
  queryClient: QueryClient,
  target: GitHubIssuePinTarget,
  page: GitHubPinnedIssuePage
) {
  queryClient.setQueryData(githubIssuePinQueryKeys.root(target), page);
}

export async function refreshRepositoryPinnedIssues(
  queryClient: QueryClient,
  repository: GitHubRepositoryContentContext,
  issueNumber?: number
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: githubIssuePinQueryKeys.root({
        owner: repository.owner,
        repository: repository.name,
      }),
      refetchType: "active",
    }),
    ...(issueNumber
      ? [
          queryClient.invalidateQueries({
            queryKey: githubQueryKeys.issueRoot({
              owner: repository.owner,
              repository: repository.name,
              issueNumber,
            }),
            refetchType: "active",
          }),
        ]
      : []),
  ]);
}
