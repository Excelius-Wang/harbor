import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueLinkedBranchPage } from "./github-data";

export type GitHubIssueLinkedBranchTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
  expectedIssueNodeId: string;
  after: string | null;
};

export type GitHubIssueLinkedBranchMutationTarget = Omit<GitHubIssueLinkedBranchTarget, "after">;

export const githubIssueLinkedBranchQueryKeys = {
  root: ({ owner, repository, issueNumber }: GitHubIssueLinkedBranchMutationTarget) =>
    ["github", "repository", owner, repository, "issue", issueNumber, "linked-branches"] as const,
  page: (target: GitHubIssueLinkedBranchTarget) =>
    [...githubIssueLinkedBranchQueryKeys.root(target), target.after] as const,
};

export function issueLinkedBranchQueryOptions(target: GitHubIssueLinkedBranchTarget) {
  return queryOptions({
    queryKey: githubIssueLinkedBranchQueryKeys.page(target),
    queryFn: () =>
      invoke<GitHubIssueLinkedBranchPage>("github_get_repository_issue_linked_branches", target),
    enabled: Boolean(target.expectedIssueNodeId.trim()),
    staleTime: 30_000,
  });
}

export function createRepositoryIssueLinkedBranch(
  target: GitHubIssueLinkedBranchMutationTarget,
  expectedDefaultBranchOid: string,
  branchName: string | null
) {
  return invoke<GitHubIssueLinkedBranchPage>("github_create_repository_issue_linked_branch", {
    ...target,
    expectedDefaultBranchOid,
    branchName,
  });
}

export function deleteRepositoryIssueLinkedBranch(
  target: GitHubIssueLinkedBranchMutationTarget,
  branch: { id: string; name: string; oid: string }
) {
  return invoke<GitHubIssueLinkedBranchPage>("github_delete_repository_issue_linked_branch", {
    ...target,
    linkedBranchId: branch.id,
    expectedBranchName: branch.name,
    expectedBranchOid: branch.oid,
  });
}

export function syncIssueLinkedBranches(
  queryClient: QueryClient,
  target: GitHubIssueLinkedBranchMutationTarget,
  page: GitHubIssueLinkedBranchPage
) {
  queryClient.setQueryData(githubIssueLinkedBranchQueryKeys.page({ ...target, after: null }), page);
}

export function invalidateIssueLinkedBranches(
  queryClient: QueryClient,
  target: GitHubIssueLinkedBranchMutationTarget
) {
  return queryClient.invalidateQueries({
    queryKey: githubIssueLinkedBranchQueryKeys.root(target),
  });
}
