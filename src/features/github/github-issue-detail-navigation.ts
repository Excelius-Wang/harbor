import type { GitHubRepositoryContentContext } from "./github-data";

export type GitHubIssueDetailLocation = {
  repository: GitHubRepositoryContentContext;
  issueNumber: number;
};

export function issueDetailLocation(
  repository: GitHubRepositoryContentContext,
  issueNumber: number
): GitHubIssueDetailLocation {
  return { repository, issueNumber };
}

function sameLocation(left: GitHubIssueDetailLocation, right: GitHubIssueDetailLocation) {
  return (
    left.issueNumber === right.issueNumber &&
    left.repository.owner.toLowerCase() === right.repository.owner.toLowerCase() &&
    left.repository.name.toLowerCase() === right.repository.name.toLowerCase()
  );
}

export function pushIssueDetailLocation(
  history: GitHubIssueDetailLocation[],
  location: GitHubIssueDetailLocation
) {
  const current = history[history.length - 1];
  return current && sameLocation(current, location) ? history : [...history, location];
}

export function popIssueDetailLocation(history: GitHubIssueDetailLocation[]) {
  return history.length > 1 ? history.slice(0, -1) : history;
}
