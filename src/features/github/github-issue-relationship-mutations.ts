import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { githubQueryKeys } from "./github-queries";
import {
  githubIssueRelationshipQueryKeys,
  type GitHubIssueRelationshipTarget,
} from "./github-issue-relationship-queries";

export type GitHubIssueRelationshipMutationTarget = GitHubIssueRelationshipTarget;

export function parseGitHubIssueNumber(value: string): number | null {
  const issueNumber = value.trim();
  if (!/^[1-9]\d*$/.test(issueNumber)) return null;

  const number = Number(issueNumber);
  return Number.isSafeInteger(number) ? number : null;
}

export function addRepositoryIssueSubIssue(
  target: GitHubIssueRelationshipMutationTarget,
  subIssueNumber: number
) {
  return invoke<void>("github_add_repository_issue_sub_issue", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    subIssueNumber,
  });
}

export async function refreshRepositoryIssueRelationships(
  queryClient: QueryClient,
  target: GitHubIssueRelationshipMutationTarget,
  subIssueNumber: number
) {
  await Promise.all(
    [target.issueNumber, subIssueNumber].flatMap((issueNumber) => {
      const issue = { ...target, issueNumber };
      return [
        queryClient.invalidateQueries({
          queryKey: githubIssueRelationshipQueryKeys.root(issue),
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: githubQueryKeys.issueRoot(issue),
          refetchType: "active",
        }),
      ];
    })
  );
}
