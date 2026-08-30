import { getChangeKey, type ChangeData } from "react-diff-view";
import type { GitHubChangedFile } from "./github-data";

export function commitCommentPositionsByChangeKey(
  file: Pick<GitHubChangedFile, "patch">,
  changes: ChangeData[]
): Map<string, number> {
  if (!file.patch || !changes.length) return new Map();
  const positions = new Map<string, number>();
  let changeIndex = 0;
  let position = 0;
  let sawFirstHunk = false;

  for (const line of file.patch.split("\n")) {
    if (line.startsWith("@@")) {
      if (sawFirstHunk) position += 1;
      else sawFirstHunk = true;
      continue;
    }
    if (!sawFirstHunk) return new Map();
    position += 1;
    if (line.startsWith("\\")) continue;
    if (!line.startsWith(" ") && !line.startsWith("+") && !line.startsWith("-")) {
      return new Map();
    }
    const change = changes[changeIndex];
    if (!change) return new Map();
    positions.set(getChangeKey(change), position);
    changeIndex += 1;
  }

  return changeIndex === changes.length ? positions : new Map();
}

export function commitCommentChangeKeyAtPosition(
  positions: ReadonlyMap<string, number>,
  position: number
) {
  for (const [changeKey, candidate] of positions) {
    if (candidate === position) return changeKey;
  }
  return undefined;
}

export function commitCommentChangeKeyForFile(
  file: Pick<GitHubChangedFile, "path" | "previousPath" | "patch">,
  comment: { path: string | null; position: number | null },
  positions: ReadonlyMap<string, number>
) {
  if (
    comment.position === null ||
    !comment.path ||
    (comment.path !== file.path && comment.path !== file.previousPath)
  ) {
    return undefined;
  }
  return commitCommentChangeKeyAtPosition(positions, comment.position);
}

export function placedCommitCommentIdsForFile(
  file: Pick<GitHubChangedFile, "path" | "previousPath" | "patch">,
  comments: Array<{ id: string; path: string | null; position: number | null }>,
  changes: ChangeData[]
) {
  const positions = commitCommentPositionsByChangeKey(file, changes);
  return new Set(
    comments.flatMap((comment) =>
      commitCommentChangeKeyForFile(file, comment, positions) ? [comment.id] : []
    )
  );
}
