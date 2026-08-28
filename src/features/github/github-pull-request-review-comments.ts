import { getChangeKey, type ChangeData } from "react-diff-view";
import type {
  GitHubPullRequestReviewComment,
  GitHubPullRequestReviewCommentSide,
  GitHubPullRequestReviewThread,
} from "./github-data";

export type PullRequestReviewDiffSelection = {
  side: GitHubPullRequestReviewCommentSide;
  anchorChangeKey: string;
  focusChangeKey: string;
};

export type PullRequestReviewCommentRange = {
  location: Omit<GitHubPullRequestReviewComment, "body">;
  changeKeys: string[];
  endChangeKey: string;
};

export function pullRequestReviewCommentKey(
  comment: Pick<GitHubPullRequestReviewComment, "path" | "line" | "side">
) {
  return `${comment.path}:${comment.side}:${comment.line}`;
}

export function pullRequestReviewCommentLocation(
  path: string,
  change: ChangeData
): Omit<GitHubPullRequestReviewComment, "body"> {
  const side = change.type === "delete" ? "left" : "right";
  return pullRequestReviewCommentLocationForSide(path, change, side)!;
}

export function pullRequestReviewCommentLocationForSide(
  path: string,
  change: ChangeData,
  side: GitHubPullRequestReviewCommentSide
): Omit<GitHubPullRequestReviewComment, "body"> | null {
  if (side === "left") {
    if (change.type === "insert") return null;
    return {
      path,
      line: change.type === "delete" ? change.lineNumber : change.oldLineNumber,
      side,
    };
  }
  if (change.type === "delete") return null;
  return {
    path,
    line: change.type === "insert" ? change.lineNumber : change.newLineNumber,
    side,
  };
}

export function pullRequestReviewCommentRange(
  path: string,
  changes: ChangeData[],
  selection: PullRequestReviewDiffSelection
): PullRequestReviewCommentRange | null {
  const sideChanges = changes.flatMap((change) => {
    const location = pullRequestReviewCommentLocationForSide(path, change, selection.side);
    return location ? [{ change, location }] : [];
  });
  const anchorIndex = sideChanges.findIndex(
    ({ change }) => getChangeKey(change) === selection.anchorChangeKey
  );
  const focusIndex = sideChanges.findIndex(
    ({ change }) => getChangeKey(change) === selection.focusChangeKey
  );
  if (anchorIndex < 0 || focusIndex < 0) return null;

  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  const selected = sideChanges.slice(startIndex, endIndex + 1);
  const start = selected[0];
  const end = selected[selected.length - 1];
  if (!start || !end) return null;

  return {
    location:
      selected.length === 1
        ? end.location
        : {
            ...end.location,
            startLine: start.location.line,
            startSide: start.location.side,
          },
    changeKeys: selected.map(({ change }) => getChangeKey(change)),
    endChangeKey: getChangeKey(end.change),
  };
}

export function pullRequestDiffChangeKey(path: string, change: ChangeData) {
  return `${path}:${getChangeKey(change)}`;
}

export function pullRequestReviewThreadMatchesChange(
  thread: GitHubPullRequestReviewThread,
  change: ChangeData
) {
  if (thread.subjectType === "file" || thread.isOutdated || thread.line === undefined) return false;
  const location = pullRequestReviewCommentLocationForSide(thread.path, change, thread.side);
  return location?.line === thread.line;
}
