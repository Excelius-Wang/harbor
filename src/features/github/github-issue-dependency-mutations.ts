import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { githubIssueDependencyQueryKeys } from "./github-issue-dependency-queries";

export type GitHubIssueDependencyMutationTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
};

export type GitHubIssueDependencyReference = {
  owner: string;
  repository: string;
  issueNumber: number;
};

export function parseGitHubIssueUrl(value: string): GitHubIssueDependencyReference | null {
  const match =
    /^https:\/\/github\.com\/([a-z0-9_.-]{1,100})\/([a-z0-9_.-]{1,100})\/issues\/([1-9]\d*)$/i.exec(
      value.trim()
    );
  if (!match) return null;
  const [, owner, repository, issueNumber] = match;
  if (
    !owner ||
    owner === "." ||
    owner === ".." ||
    !repository ||
    repository === "." ||
    repository === ".." ||
    !issueNumber ||
    !Number.isSafeInteger(Number(issueNumber))
  ) {
    return null;
  }
  return { owner, repository, issueNumber: Number(issueNumber) };
}

export function addRepositoryIssueDependency(
  target: GitHubIssueDependencyMutationTarget,
  blocking: GitHubIssueDependencyReference
) {
  return invoke<void>("github_add_repository_issue_dependency", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    blockingOwner: blocking.owner,
    blockingRepository: blocking.repository,
    blockingIssueNumber: blocking.issueNumber,
  });
}

export function removeRepositoryIssueDependency(
  target: GitHubIssueDependencyMutationTarget,
  blockingIssueId: number
) {
  return invoke<void>("github_remove_repository_issue_dependency", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    blockingIssueId,
  });
}

export async function refreshRepositoryIssueDependencies(
  queryClient: QueryClient,
  target: GitHubIssueDependencyMutationTarget
) {
  await queryClient.invalidateQueries({
    queryKey: githubIssueDependencyQueryKeys.root(target),
    refetchType: "active",
  });
}
