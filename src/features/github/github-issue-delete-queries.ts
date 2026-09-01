import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubIssueDeleteStatus,
  GitHubIssueDeletion,
  GitHubIssueInboxPage,
  GitHubIssuePage,
  GitHubPinnedIssuePage,
} from "./github-data";
import { githubIssuePinQueryKeys } from "./github-issue-pin-queries";
import { githubQueryKeys } from "./github-queries";

export type GitHubIssueDeleteTarget = {
  owner: string;
  repository: string;
  issueNumber: number;
  expectedIssueNodeId: string;
};

export const githubIssueDeleteQueryKeys = {
  status: (target: GitHubIssueDeleteTarget) =>
    [
      "github",
      "repository",
      target.owner,
      target.repository,
      "issue-delete-status",
      target.issueNumber,
      target.expectedIssueNodeId,
    ] as const,
};

export function issueDeleteStatusQueryOptions(target: GitHubIssueDeleteTarget) {
  return queryOptions({
    queryKey: githubIssueDeleteQueryKeys.status(target),
    queryFn: () =>
      invoke<GitHubIssueDeleteStatus>("github_get_repository_issue_delete_status", {
        owner: target.owner,
        repository: target.repository,
        issueNumber: target.issueNumber,
      }),
    staleTime: 60_000,
  });
}

export function deleteRepositoryIssue(target: GitHubIssueDeleteTarget) {
  return invoke<GitHubIssueDeletion>("github_delete_repository_issue", { input: target });
}

export function issueDeleteIdentityMatches(
  value: Pick<GitHubIssueDeleteStatus, "repositoryFullName" | "issueNodeId" | "number">,
  target: GitHubIssueDeleteTarget
) {
  return (
    value.repositoryFullName.toLowerCase() ===
      `${target.owner}/${target.repository}`.toLowerCase() &&
    value.issueNodeId === target.expectedIssueNodeId &&
    value.number === target.issueNumber
  );
}

export function syncDeletedIssue(
  queryClient: QueryClient,
  target: GitHubIssueDeleteTarget,
  deletion: GitHubIssueDeletion
) {
  if (!issueDeleteIdentityMatches(deletion, target)) return false;
  queryClient.removeQueries({ queryKey: githubQueryKeys.issueRoot(target) });
  queryClient.removeQueries({ queryKey: githubIssueDeleteQueryKeys.status(target), exact: true });
  queryClient.setQueriesData<GitHubIssuePage>(
    { queryKey: githubQueryKeys.issuesRoot(target) },
    (page) => {
      if (!page) return page;
      const included = page.issues.some(
        (issue) =>
          issue.number === target.issueNumber &&
          issue.reactionSubject.id === target.expectedIssueNodeId
      );
      return {
        ...page,
        issues: page.issues.filter(
          (issue) =>
            issue.number !== target.issueNumber ||
            issue.reactionSubject.id !== target.expectedIssueNodeId
        ),
        totalCount: included ? Math.max(0, page.totalCount - 1) : page.totalCount,
      };
    }
  );
  queryClient.setQueriesData<GitHubIssueInboxPage>(
    { queryKey: githubQueryKeys.issueInboxRoot },
    (page) => {
      if (!page) return page;
      const included = page.issues.some(
        (summary) =>
          summary.repository.fullName.toLowerCase() === deletion.repositoryFullName.toLowerCase() &&
          summary.issue.number === deletion.number &&
          summary.issue.reactionSubject.id === deletion.issueNodeId
      );
      return {
        ...page,
        issues: page.issues.filter(
          (summary) =>
            summary.repository.fullName.toLowerCase() !==
              deletion.repositoryFullName.toLowerCase() ||
            summary.issue.number !== deletion.number ||
            summary.issue.reactionSubject.id !== deletion.issueNodeId
        ),
        totalCount: included ? Math.max(0, page.totalCount - 1) : page.totalCount,
      };
    }
  );
  queryClient.setQueryData<GitHubPinnedIssuePage>(githubIssuePinQueryKeys.root(target), (page) =>
    page
      ? { ...page, issues: page.issues.filter((issue) => issue.nodeId !== deletion.issueNodeId) }
      : page
  );
  return true;
}

export async function refreshIssueDeletionCaches(
  queryClient: QueryClient,
  target: GitHubIssueDeleteTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issuesRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueInboxRoot }),
    queryClient.invalidateQueries({ queryKey: githubIssuePinQueryKeys.root(target) }),
  ]);
}
