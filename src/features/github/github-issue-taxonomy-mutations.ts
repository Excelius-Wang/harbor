import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubIssueLabel,
  GitHubIssueLabelMutation,
  GitHubIssueLabelPage,
  GitHubIssueMilestone,
  GitHubIssueMilestoneMutation,
  GitHubIssueMilestonePage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubIssueTaxonomyTarget = {
  owner: string;
  repository: string;
};

export type GitHubIssueLabelMutationTarget = GitHubIssueTaxonomyTarget & {
  mutation: GitHubIssueLabelMutation;
};

export type GitHubIssueMilestoneMutationTarget = GitHubIssueTaxonomyTarget & {
  mutation: GitHubIssueMilestoneMutation;
};

export function mutateRepositoryIssueLabel(target: GitHubIssueLabelMutationTarget) {
  return invoke<GitHubIssueLabel | null>("github_mutate_repository_issue_label", target);
}

export function mutateRepositoryIssueMilestone(target: GitHubIssueMilestoneMutationTarget) {
  return invoke<GitHubIssueMilestone | null>("github_mutate_repository_issue_milestone", target);
}

export function syncRepositoryIssueLabel(
  queryClient: QueryClient,
  target: GitHubIssueLabelMutationTarget,
  label: GitHubIssueLabel | null
) {
  const key = githubQueryKeys.issueLabels(target);
  queryClient.setQueryData<GitHubIssueLabelPage>(key, (page) => {
    if (!page) return page;
    const originalName =
      target.mutation.action === "update"
        ? target.mutation.originalName
        : target.mutation.action === "delete"
          ? target.mutation.name
          : null;
    const labels = page.labels.filter(
      (item) => originalName === null || item.name.toLowerCase() !== originalName.toLowerCase()
    );
    if (label) labels.push(label);
    labels.sort((left, right) => left.name.localeCompare(right.name));
    return { ...page, labels };
  });
}

export function syncRepositoryIssueMilestone(
  queryClient: QueryClient,
  target: GitHubIssueMilestoneMutationTarget,
  milestone: GitHubIssueMilestone | null
) {
  const key = githubQueryKeys.issueMilestones(target);
  queryClient.setQueryData<GitHubIssueMilestonePage>(key, (page) => {
    if (!page) return page;
    const number = target.mutation.action === "create" ? null : target.mutation.number;
    const milestones = page.milestones.filter((item) => number === null || item.number !== number);
    if (milestone) milestones.push(milestone);
    milestones.sort((left, right) => {
      if (!left.dueOn && !right.dueOn) return left.title.localeCompare(right.title);
      if (!left.dueOn) return 1;
      if (!right.dueOn) return -1;
      return left.dueOn.localeCompare(right.dueOn);
    });
    return { ...page, milestones };
  });
}

export async function invalidateRepositoryIssueTaxonomy(
  queryClient: QueryClient,
  target: GitHubIssueTaxonomyTarget
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueLabels(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueMilestones(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issuesRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestsRoot(target) }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.issueInboxRoot }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.pullRequestInboxRoot }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.projectsRoot }),
  ]);
}
