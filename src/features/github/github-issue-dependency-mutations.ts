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
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const [owner, repository, kind, issueNumber] = url.pathname.split("/").filter(Boolean);
    if (
      !owner ||
      !repository ||
      kind !== "issues" ||
      !issueNumber ||
      !/^[1-9]\d*$/.test(issueNumber) ||
      !Number.isSafeInteger(Number(issueNumber))
    ) {
      return null;
    }
    return { owner, repository, issueNumber: Number(issueNumber) };
  } catch {
    return null;
  }
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
