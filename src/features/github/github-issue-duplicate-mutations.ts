import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssue } from "./github-data";
import {
  githubIssueDuplicateQueryKeys,
  type GitHubIssueDuplicateTarget,
} from "./github-issue-duplicate-queries";
import { invalidateRepositoryIssue } from "./github-issue-mutations";
import { invalidateIssueStateCapabilities } from "./github-issue-state-queries";
import { parseGitHubIssueUrl } from "./github-issue-dependency-mutations";
import { parseGitHubIssueNumber } from "./github-issue-relationship-mutations";
import { githubQueryKeys } from "./github-queries";

export type GitHubCanonicalIssueReference = {
  owner: string;
  repository: string;
  issueNumber: number;
};

export function parseCanonicalIssueReference(
  value: string,
  source: { owner: string; repository: string; issueNumber: number }
): GitHubCanonicalIssueReference | null {
  const sameRepositoryNumber = parseGitHubIssueNumber(value);
  const reference = sameRepositoryNumber
    ? { owner: source.owner, repository: source.repository, issueNumber: sameRepositoryNumber }
    : parseGitHubIssueUrl(value);
  if (
    !reference ||
    (reference.issueNumber === source.issueNumber &&
      reference.owner.toLowerCase() === source.owner.toLowerCase() &&
      reference.repository.toLowerCase() === source.repository.toLowerCase())
  ) {
    return null;
  }
  return reference;
}

export function unmarkRepositoryIssueDuplicate(target: GitHubIssueDuplicateTarget) {
  return invoke<GitHubIssue>("github_unmark_repository_issue_duplicate", target);
}

export function markRepositoryIssueDuplicate(
  target: GitHubIssueDuplicateTarget,
  canonical: GitHubCanonicalIssueReference
) {
  return invoke<GitHubIssue>("github_mark_repository_issue_duplicate", {
    input: {
      ...target,
      canonicalOwner: canonical.owner,
      canonicalRepository: canonical.repository,
      canonicalIssueNumber: canonical.issueNumber,
    },
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
