import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubIssue,
  GitHubIssueCloseReasonFilter,
  GitHubIssueCloseReason,
  GitHubIssueDetailPage,
  GitHubIssueInboxPage,
  GitHubIssuePage,
  GitHubIssueState,
  GitHubIssueStateReason,
  GitHubIssueTimelineItem,
  GitHubIssueSummary,
  GitHubItemMetadataValue,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

const GITHUB_ISSUE_PAGE_SIZE = 30;
const REPOSITORY_ISSUE_MILESTONE_QUERY_KEY_INDEX = 12;

function reconcileUpdatedPageItems<T>(
  items: T[],
  updatedItem: T,
  matches: (item: T) => boolean,
  hasMore: boolean
) {
  const remainingItems = items.filter((item) => !matches(item));
  const orderedItems = [updatedItem, ...remainingItems];
  return {
    remainingItems,
    updatedPage: {
      issues: orderedItems.slice(0, GITHUB_ISSUE_PAGE_SIZE),
      hasMore: hasMore || orderedItems.length > GITHUB_ISSUE_PAGE_SIZE,
    },
  };
}

export type GitHubRepositoryIssueMutationTarget = {
  owner: string;
  repository: string;
};

export type GitHubIssueMutationTarget = GitHubRepositoryIssueMutationTarget & {
  issueNumber: number;
};

export type GitHubIssueStateMutationInput = {
  desiredState: GitHubIssueState;
  closeReason: GitHubIssueCloseReason | null;
  expected: {
    issueId: number;
    issueNodeId: string;
    state: GitHubIssueState;
    stateReason: GitHubIssueStateReason | null;
    updatedAt: string;
  };
};

export type GitHubIssueStateChoice = Pick<
  GitHubIssueStateMutationInput,
  "desiredState" | "closeReason"
>;

export function issueStateMutationInput(
  issue: GitHubIssue,
  choice: GitHubIssueStateChoice
): GitHubIssueStateMutationInput {
  return {
    ...choice,
    expected: {
      issueId: issue.id,
      issueNodeId: issue.reactionSubject.id,
      state: issue.state,
      stateReason: issue.stateReason ?? null,
      updatedAt: issue.updatedAt,
    },
  };
}

export type GitHubIssueMetadataValue = GitHubItemMetadataValue;

export type GitHubIssueCreateOptions = {
  labels: string[];
  assignees: string[];
};

export function createRepositoryIssue(
  target: GitHubRepositoryIssueMutationTarget,
  title: string,
  body: string,
  options?: GitHubIssueCreateOptions
) {
  return invoke<GitHubIssue>("github_create_repository_issue", {
    owner: target.owner,
    repository: target.repository,
    title,
    body,
    ...(options ? options : {}),
  });
}

export function updateRepositoryIssue(
  target: GitHubIssueMutationTarget,
  title: string,
  body: string
) {
  return invoke<GitHubIssue>("github_update_repository_issue", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    title,
    body,
  });
}

export function updateRepositoryIssueMetadata(
  target: GitHubIssueMutationTarget,
  value: GitHubIssueMetadataValue
) {
  return invoke<GitHubIssue>("github_update_repository_issue_metadata", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    labels: value.labels,
    assignees: value.assignees,
    milestoneNumber: value.milestoneNumber,
  });
}

export function createRepositoryIssueComment(target: GitHubIssueMutationTarget, body: string) {
  return invoke<GitHubIssueTimelineItem>("github_create_repository_issue_comment", {
    owner: target.owner,
    repository: target.repository,
    issueNumber: target.issueNumber,
    body,
  });
}

export function updateRepositoryIssueState(
  target: GitHubIssueMutationTarget,
  input: GitHubIssueStateMutationInput
) {
  return invoke<GitHubIssue>("github_update_repository_issue_state", {
    ...target,
    mutation: input,
  });
}

export function syncCreatedIssueComment(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget,
  comment: GitHubIssueTimelineItem
) {
  queryClient.setQueriesData<GitHubIssueDetailPage>(
    { queryKey: githubQueryKeys.issueRoot(target) },
    (detail) => {
      if (!detail) return detail;
      const alreadyIncluded = detail.timeline.some((item) => item.id === comment.id);
      return {
        ...detail,
        issue: { ...detail.issue, comments: detail.issue.comments + (alreadyIncluded ? 0 : 1) },
        timeline:
          detail.timelineHasMore || alreadyIncluded
            ? detail.timeline
            : [...detail.timeline, comment],
      };
    }
  );
  queryClient.setQueriesData<GitHubIssuePage>(
    { queryKey: githubQueryKeys.issuesRoot(target) },
    (page) => {
      if (!page) return page;
      return {
        ...page,
        issues: page.issues.map((issue) =>
          issue.number === target.issueNumber ? { ...issue, comments: issue.comments + 1 } : issue
        ),
      };
    }
  );
  updateIssueInboxPages(queryClient, target, (summary) => ({
    ...summary,
    issue: { ...summary.issue, comments: summary.issue.comments + 1 },
  }));
}

export function syncCreatedIssue(
  queryClient: QueryClient,
  target: GitHubRepositoryIssueMutationTarget,
  issue: GitHubIssue
) {
  queryClient.setQueryData<GitHubIssueDetailPage>(
    githubQueryKeys.issueDetail({
      owner: target.owner,
      repository: target.repository,
      issueNumber: issue.number,
      timelinePage: 1,
    }),
    {
      issue,
      timeline: [],
      timelinePage: 1,
      timelineHasPrevious: false,
      timelineHasMore: false,
    }
  );
}

export function syncUpdatedIssue(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget,
  issue: GitHubIssue
) {
  queryClient.setQueriesData<GitHubIssueDetailPage>(
    { queryKey: githubQueryKeys.issueRoot(target) },
    (detail) => (detail ? { ...detail, issue } : detail)
  );
  updateRepositoryIssuePages(queryClient, target, issue);
  updateIssueInboxPages(queryClient, target, (summary) => ({ ...summary, issue }), issue.state);
}

export function syncIssueLockedState(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget,
  locked: boolean
) {
  queryClient.setQueriesData<GitHubIssueDetailPage>(
    { queryKey: githubQueryKeys.issueRoot(target) },
    (detail) => (detail ? { ...detail, issue: { ...detail.issue, locked } } : detail)
  );
  queryClient.setQueriesData<GitHubIssuePage>(
    { queryKey: githubQueryKeys.issuesRoot(target) },
    (page) =>
      page
        ? {
            ...page,
            issues: page.issues.map((issue) =>
              issue.number === target.issueNumber ? { ...issue, locked } : issue
            ),
          }
        : page
  );
  updateIssueInboxPages(queryClient, target, (summary) => ({
    ...summary,
    issue: { ...summary.issue, locked },
  }));
}

export async function invalidateRepositoryIssue(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issuesRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueInboxRoot }),
  ]);
}

function issueStateFromQueryKey(queryKey: QueryKey): GitHubIssueState | null {
  if (queryKey[0] === "github" && queryKey[1] === "repository" && queryKey[4] === "issues") {
    return queryKey[5] === "open" || queryKey[5] === "closed" ? queryKey[5] : null;
  }
  if (queryKey[0] === "github" && queryKey[1] === "issue-inbox") {
    return queryKey[3] === "open" || queryKey[3] === "closed" ? queryKey[3] : null;
  }
  return null;
}

function updateRepositoryIssuePages(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget,
  issue: GitHubIssue
) {
  for (const [queryKey, page] of queryClient.getQueriesData<GitHubIssuePage>({
    queryKey: githubQueryKeys.issuesRoot(target),
  })) {
    if (!page) continue;
    const matches = page.issues.filter((item) => item.number === target.issueNumber);
    const cachedState = issueStateFromQueryKey(queryKey);
    const closeReasonMatches = repositoryIssueCloseReasonMatches(queryKey, issue);
    const milestoneMatches = repositoryIssueMilestoneMatches(queryKey, issue);
    const exactDestination = repositoryIssuePageAccepts(queryKey, issue);
    const shouldInsert = !matches.length && cachedState === issue.state && exactDestination;
    if (
      matches.length &&
      cachedState === issue.state &&
      (!closeReasonMatches || !milestoneMatches)
    ) {
      queryClient.setQueryData<GitHubIssuePage>(queryKey, {
        ...page,
        issues: page.issues.filter((item) => item.number !== target.issueNumber),
        totalCount: Math.max(0, page.totalCount - matches.length),
      });
      void queryClient.invalidateQueries({ queryKey, exact: true });
      continue;
    }
    if (!matches.length && !shouldInsert) {
      if (cachedState === issue.state) {
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }
      continue;
    }
    const { remainingItems: withoutIssue, updatedPage } = reconcileUpdatedPageItems(
      page.issues,
      issue,
      (item) => item.number === target.issueNumber,
      page.hasMore
    );
    const staleUpdatedPage =
      cachedState === issue.state && queryKey[10] === "updated" && queryKey[11] !== 1;
    if (staleUpdatedPage) {
      queryClient.setQueryData<GitHubIssuePage>(queryKey, {
        ...page,
        issues: withoutIssue,
      });
      void queryClient.invalidateQueries({ queryKey, exact: true });
      continue;
    }
    const moveToFront = queryKey[10] === "updated" && queryKey[11] === 1;
    queryClient.setQueryData<GitHubIssuePage>(
      queryKey,
      cachedState && cachedState !== issue.state
        ? {
            ...page,
            issues: withoutIssue,
            totalCount: Math.max(0, page.totalCount - matches.length),
          }
        : shouldInsert
          ? {
              ...page,
              ...updatedPage,
              totalCount: page.totalCount + 1,
            }
          : moveToFront
            ? {
                ...page,
                ...updatedPage,
              }
            : {
                ...page,
                issues: page.issues.map((item) =>
                  item.number === target.issueNumber ? issue : item
                ),
              }
    );
  }
}

function repositoryIssuePageAccepts(queryKey: QueryKey, issue: GitHubIssue) {
  const assignment = queryKey[6];
  const query = queryKey[7];
  const label = queryKey[8];
  const sort = queryKey[10];
  const page = queryKey[11];
  return (
    page === 1 &&
    sort === "updated" &&
    (assignment === "all" || (assignment === "unassigned" && !issue.assignees.length)) &&
    query === "" &&
    (label === "" || issue.labels.some((item) => item.name === label)) &&
    repositoryIssueCloseReasonMatches(queryKey, issue) &&
    repositoryIssueMilestoneMatches(queryKey, issue)
  );
}

function repositoryIssueCloseReasonMatches(queryKey: QueryKey, issue: GitHubIssue) {
  const closeReason = queryKey[9] as GitHubIssueCloseReasonFilter | null | undefined;
  return closeReason === null || closeReason === undefined || closeReason === issue.stateReason;
}

function repositoryIssueMilestoneMatches(queryKey: QueryKey, issue: GitHubIssue) {
  const milestone = queryKey[REPOSITORY_ISSUE_MILESTONE_QUERY_KEY_INDEX] as
    | string
    | null
    | undefined;
  return milestone === null || milestone === undefined || milestone === issue.milestone;
}

function matchesIssueSummary(summary: GitHubIssueSummary, target: GitHubIssueMutationTarget) {
  return (
    summary.issue.number === target.issueNumber &&
    summary.repository.owner === target.owner &&
    summary.repository.name === target.repository
  );
}

function updateIssueInboxPages(
  queryClient: QueryClient,
  target: GitHubIssueMutationTarget,
  update: (summary: GitHubIssueSummary) => GitHubIssueSummary,
  nextState?: GitHubIssueState
) {
  const pages = queryClient.getQueriesData<GitHubIssueInboxPage>({
    queryKey: githubQueryKeys.issueInboxRoot,
  });
  const templates = new Map<string, GitHubIssueSummary>();
  if (nextState) {
    for (const [queryKey, page] of pages) {
      const scope = queryKey[2];
      const match = page?.issues.find((summary) => matchesIssueSummary(summary, target));
      if (typeof scope === "string" && match) templates.set(scope, match);
    }
  }

  for (const [queryKey, page] of pages) {
    if (!page) continue;
    const matches = page.issues.filter((summary) => matchesIssueSummary(summary, target));
    const cachedState = issueStateFromQueryKey(queryKey);
    const scope = queryKey[2];
    const template = typeof scope === "string" ? templates.get(scope) : undefined;
    const exactDestination = queryKey[4] === "" && queryKey[5] === "updated" && queryKey[6] === 1;
    const shouldInsert =
      !matches.length && nextState === cachedState && exactDestination && Boolean(template);
    if (!matches.length && !shouldInsert) {
      if (nextState === cachedState && template) {
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }
      continue;
    }
    const baseSummary = matches[0] ?? template;
    if (!baseSummary) continue;
    const updatedSummary = update(baseSummary);
    const { remainingItems: withoutIssue, updatedPage } = reconcileUpdatedPageItems(
      page.issues,
      updatedSummary,
      (summary) => matchesIssueSummary(summary, target),
      page.hasMore
    );
    const staleUpdatedPage =
      nextState === cachedState && queryKey[5] === "updated" && queryKey[6] !== 1;
    if (staleUpdatedPage) {
      queryClient.setQueryData<GitHubIssueInboxPage>(queryKey, {
        ...page,
        issues: withoutIssue,
      });
      void queryClient.invalidateQueries({ queryKey, exact: true });
      continue;
    }
    const moveToFront = queryKey[5] === "updated" && queryKey[6] === 1;
    queryClient.setQueryData<GitHubIssueInboxPage>(
      queryKey,
      nextState && cachedState && cachedState !== nextState
        ? {
            ...page,
            issues: withoutIssue,
            totalCount: Math.max(0, page.totalCount - matches.length),
          }
        : shouldInsert
          ? {
              ...page,
              ...updatedPage,
              totalCount: page.totalCount + 1,
            }
          : moveToFront
            ? {
                ...page,
                ...updatedPage,
              }
            : {
                ...page,
                issues: page.issues.map((summary) =>
                  matchesIssueSummary(summary, target) ? update(summary) : summary
                ),
              }
    );
  }
}
