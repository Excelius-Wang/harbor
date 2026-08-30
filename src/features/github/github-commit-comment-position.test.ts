import { getChangeKey } from "react-diff-view";
import { describe, expect, it } from "vitest";
import type { GitHubChangedFile } from "./github-data";
import { parseGitHubFilePatch } from "./github-file-diff";
import {
  commitCommentChangeKeyForFile,
  commitCommentChangeKeyAtPosition,
  commitCommentPositionsByChangeKey,
} from "./github-commit-comment-position";

const file: GitHubChangedFile = {
  path: "src/main.ts",
  status: "modified",
  additions: 2,
  deletions: 2,
  changes: 4,
  patch: [
    "@@ -1,3 +1,3 @@",
    " alpha",
    "-old",
    "+new",
    " omega",
    "\\ No newline at end of file",
    "@@ -10 +10 @@",
    "-before",
    "+after",
  ].join("\n"),
};

describe("GitHub commit comment positions", () => {
  it("maps visible changes to GitHub's raw diff positions", () => {
    const diff = parseGitHubFilePatch(file);
    const changes = diff?.hunks.flatMap((hunk) => hunk.changes) ?? [];
    const positions = commitCommentPositionsByChangeKey(file, changes);

    expect(changes.map((change) => positions.get(getChangeKey(change)))).toEqual([
      1, 2, 3, 4, 7, 8,
    ]);
    expect(commitCommentChangeKeyAtPosition(positions, 7)).toBe(getChangeKey(changes[4]));
    expect(commitCommentChangeKeyAtPosition(positions, 5)).toBeUndefined();
    expect(commitCommentChangeKeyAtPosition(positions, 6)).toBeUndefined();
    expect(
      commitCommentPositionsByChangeKey({ ...file, patch: `${file.patch}\n` }, changes)
    ).toEqual(positions);
  });

  it("does not invent positions for missing or malformed patches", () => {
    expect(commitCommentPositionsByChangeKey({ ...file, patch: undefined }, [])).toEqual(new Map());
    expect(commitCommentPositionsByChangeKey({ ...file, patch: "not a patch" }, [])).toEqual(
      new Map()
    );
  });

  it("places only comments that match the file path and exact diff position", () => {
    const changes = parseGitHubFilePatch(file)?.hunks.flatMap((hunk) => hunk.changes) ?? [];
    const positions = commitCommentPositionsByChangeKey(file, changes);
    const placed = commitCommentChangeKeyForFile(
      file,
      { path: "src/main.ts", position: 7 },
      positions
    );
    expect(placed).toBe(getChangeKey(changes[4]));
    expect(
      commitCommentChangeKeyForFile(file, { path: "src/other.ts", position: 7 }, positions)
    ).toBeUndefined();
    expect(
      commitCommentChangeKeyForFile(file, { path: "src/main.ts", position: null }, positions)
    ).toBeUndefined();

    const renamed = { ...file, path: "src/new.ts", previousPath: "src/main.ts" };
    expect(
      commitCommentChangeKeyForFile(renamed, { path: "src/main.ts", position: 7 }, positions)
    ).toBe(getChangeKey(changes[4]));
  });
});
