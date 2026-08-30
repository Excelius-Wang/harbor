import type { GitHubIssueState, GitHubIssueStateReason } from "./github-data";

export function normalizeIssueStateReason(
  reason?: GitHubIssueStateReason | "not_planned" | null
): GitHubIssueStateReason | null {
  return reason === "not_planned" ? "notPlanned" : (reason ?? null);
}

export function issueStateLabel(state: GitHubIssueState, stateReason?: GitHubIssueStateReason) {
  if (state === "open") return "workspace.repositories.open";
  switch (normalizeIssueStateReason(stateReason)) {
    case "completed":
      return "workspace.repositories.issueStateReasons.completed";
    case "notPlanned":
      return "workspace.repositories.issueStateReasons.notPlanned";
    case "duplicate":
      return "workspace.repositories.issueStateReasons.duplicate";
    default:
      return "workspace.repositories.closed";
  }
}
