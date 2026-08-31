import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssue } from "./github-data";
import {
  githubIssueDuplicateQueryKeys,
  type GitHubIssueDuplicateTarget,
} from "./github-issue-duplicate-queries";
import { invalidateRepositoryIssue } from "./github-issue-mutations";
import { invalidateIssueStateCapabilities } from "./github-issue-state-queries";
import { githubQueryKeys } from "./github-queries";

export function unmarkRepositoryIssueDuplicate(target: GitHubIssueDuplicateTarget) {
  return invoke<GitHubIssue>("github_unmark_repository_issue_duplicate", target);
}

export function markRepositoryIssueDuplicate(
  target: GitHubIssueDuplicateTarget,
  canonicalIssueNumber: number
) {
  return invoke<GitHubIssue>("github_mark_repository_issue_duplicate", {
    ...target,
    canonicalIssueNumber,
  });
}

export async function refreshRepositoryIssueDuplicate(
  queryClient: QueryClient,
  target: GitHubIssueDuplicateTarget,
  canonical: { owner: string; repository: string; issueNumber: number }
) {
  await Promise.all([
    invalidateRepositoryIssue(queryClient, target),
    invalidateIssueStateCapabilities(queryClient, target),
    queryClient.invalidateQueries({
      queryKey: githubIssueDuplicateQueryKeys.root(target),
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.issueRoot({
        owner: canonical.owner,
        repository: canonical.repository,
        issueNumber: canonical.issueNumber,
      }),
      refetchType: "active",
    }),
  ]);
}
