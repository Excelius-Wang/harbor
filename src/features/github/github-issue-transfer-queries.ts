import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubIssue,
  GitHubIssueInboxPage,
  GitHubIssuePage,
  GitHubIssueTransfer,
  GitHubIssueTransferStatus,
  GitHubPinnedIssuePage,
} from "./github-data";
import { githubIssuePinQueryKeys } from "./github-issue-pin-queries";
import { githubQueryKeys } from "./github-queries";

export type GitHubIssueTransferTarget = {
  sourceOwner: string;
  sourceRepository: string;
  issueNumber: number;
  targetOwner: string;
  targetRepository: string;
  expectedIssueNodeId: string;
};

export type GitHubIssueTransferRepositoryReference = {
  owner: string;
  repository: string;
};

export const githubIssueTransferQueryKeys = {
  status: (target: GitHubIssueTransferTarget) =>
    [
      "github",
      "repository",
      target.sourceOwner,
      target.sourceRepository,
      "issue-transfer-status",
      target.issueNumber,
      target.targetOwner,
      target.targetRepository,
      target.expectedIssueNodeId,
    ] as const,
};

export function issueTransferStatusQueryOptions(target: GitHubIssueTransferTarget) {
  return queryOptions({
    queryKey: githubIssueTransferQueryKeys.status(target),
    queryFn: () =>
      invoke<GitHubIssueTransferStatus>("github_get_repository_issue_transfer_status", {
        input: {
          sourceOwner: target.sourceOwner,
          sourceRepository: target.sourceRepository,
          issueNumber: target.issueNumber,
          targetOwner: target.targetOwner,
          targetRepository: target.targetRepository,
        },
      }),
    enabled: false,
    staleTime: 30_000,
  });
}

export function getIssueTransferStatus(target: GitHubIssueTransferTarget) {
  return invoke<GitHubIssueTransferStatus>("github_get_repository_issue_transfer_status", {
    input: {
      sourceOwner: target.sourceOwner,
      sourceRepository: target.sourceRepository,
      issueNumber: target.issueNumber,
      targetOwner: target.targetOwner,
      targetRepository: target.targetRepository,
    },
  });
}

export function transferRepositoryIssue(target: GitHubIssueTransferTarget) {
  return invoke<GitHubIssueTransfer>("github_transfer_repository_issue", { input: target });
}

export function parseGitHubRepositoryReference(
  value: string
): GitHubIssueTransferRepositoryReference | null {
  const normalized = value.trim();
  const match = /^(?:https:\/\/github\.com\/)?([a-z0-9_.-]{1,100})\/([a-z0-9_.-]{1,100})$/i.exec(
    normalized
  );
  if (!match) return null;
  const [, owner, repository] = match;
  if (
    !owner ||
    owner === "." ||
    owner === ".." ||
    !repository ||
    repository === "." ||
    repository === ".."
  ) {
    return null;
  }
  return { owner, repository };
}

export function issueTransferStatusIdentityMatches(
  value: Pick<
    GitHubIssueTransferStatus,
    | "sourceRepositoryFullName"
    | "sourceIssueNodeId"
    | "sourceIssueNumber"
    | "targetRepositoryFullName"
  >,
  target: GitHubIssueTransferTarget
) {
  return (
    value.sourceRepositoryFullName.toLowerCase() ===
      `${target.sourceOwner}/${target.sourceRepository}`.toLowerCase() &&
    value.sourceIssueNodeId === target.expectedIssueNodeId &&
    value.sourceIssueNumber === target.issueNumber &&
    value.targetRepositoryFullName.toLowerCase() ===
      `${target.targetOwner}/${target.targetRepository}`.toLowerCase()
  );
}

export function syncTransferredIssue(
  queryClient: QueryClient,
  target: GitHubIssueTransferTarget,
  transfer: GitHubIssueTransfer
) {
  if (
    transfer.sourceRepositoryFullName.toLowerCase() !==
      `${target.sourceOwner}/${target.sourceRepository}`.toLowerCase() ||
    transfer.sourceIssueNodeId !== target.expectedIssueNodeId ||
    transfer.sourceIssueNumber !== target.issueNumber ||
    transfer.targetRepositoryFullName.toLowerCase() !==
      `${target.targetOwner}/${target.targetRepository}`.toLowerCase() ||
    transfer.targetIssueNumber < 1 ||
    !transfer.targetRepositoryId.trim() ||
    !transfer.targetIssueNodeId.trim() ||
    !githubIssueUrlMatches(
      transfer.targetIssueUrl,
      transfer.targetRepositoryFullName,
      transfer.targetIssueNumber
    )
  ) {
    return false;
  }

  const source = {
    owner: target.sourceOwner,
    repository: target.sourceRepository,
    issueNumber: target.issueNumber,
  };
  const destination = {
    owner: target.targetOwner,
    repository: target.targetRepository,
    issueNumber: transfer.targetIssueNumber,
  };
  queryClient.removeQueries({ queryKey: githubQueryKeys.issueRoot(source) });
  queryClient.removeQueries({
    queryKey: githubIssueTransferQueryKeys.status(target),
    exact: true,
  });
  queryClient.setQueriesData<GitHubIssuePage>(
    { queryKey: githubQueryKeys.issuesRoot(source) },
    (page) => {
      if (!page) return page;
      const included = page.issues.some(
        (issue: GitHubIssue) =>
          issue.number === target.issueNumber &&
          issue.reactionSubject.id === target.expectedIssueNodeId
      );
      return {
        ...page,
        issues: page.issues.filter(
          (issue: GitHubIssue) =>
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
          summary.repository.fullName.toLowerCase() ===
            transfer.sourceRepositoryFullName.toLowerCase() &&
          summary.issue.number === transfer.sourceIssueNumber &&
          summary.issue.reactionSubject.id === transfer.sourceIssueNodeId
      );
      return {
        ...page,
        issues: page.issues.filter(
          (summary) =>
            summary.repository.fullName.toLowerCase() !==
              transfer.sourceRepositoryFullName.toLowerCase() ||
            summary.issue.number !== transfer.sourceIssueNumber ||
            summary.issue.reactionSubject.id !== transfer.sourceIssueNodeId
        ),
        totalCount: included ? Math.max(0, page.totalCount - 1) : page.totalCount,
      };
    }
  );
  queryClient.setQueryData<GitHubPinnedIssuePage>(githubIssuePinQueryKeys.root(source), (page) =>
    page
      ? {
          ...page,
          issues: page.issues.filter((issue) => issue.nodeId !== transfer.sourceIssueNodeId),
        }
      : page
  );
  return destination;
}

function githubIssueUrlMatches(value: string, fullName: string, issueNumber: number) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "github.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.toLowerCase() === `/${fullName.toLowerCase()}/issues/${issueNumber}` &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export async function refreshIssueTransferCaches(
  queryClient: QueryClient,
  target: GitHubIssueTransferTarget,
  transfer?: GitHubIssueTransfer
) {
  const source = {
    owner: target.sourceOwner,
    repository: target.sourceRepository,
    issueNumber: target.issueNumber,
  };
  const destination = {
    owner: target.targetOwner,
    repository: target.targetRepository,
  };
  const destinationIssue = transfer
    ? { ...destination, issueNumber: transfer.targetIssueNumber }
    : null;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueRoot(source) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issuesRoot(source) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issuesRoot(destination) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueInboxRoot }),
    queryClient.invalidateQueries({ queryKey: githubIssuePinQueryKeys.root(source) }),
    queryClient.invalidateQueries({ queryKey: githubIssuePinQueryKeys.root(destination) }),
    ...(destinationIssue
      ? [queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueRoot(destinationIssue) })]
      : []),
  ]);
}
