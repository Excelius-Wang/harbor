import { describe, expect, it } from "vitest";
import type { GitHubPullRequestReviewThread } from "./github-data";
import {
  pullRequestDiffChangeKey,
  pullRequestReviewCommentKey,
  pullRequestReviewCommentLocation,
  pullRequestReviewCommentLocationForSide,
  pullRequestReviewCommentRange,
  pullRequestReviewThreadMatchesChange,
} from "./github-pull-request-review-comments";

describe("pull request review comment locations", () => {
  it("maps additions and context to the right side of GitHub's diff", () => {
    expect(
      pullRequestReviewCommentLocation("src/app.ts", {
        type: "insert",
        content: "+const value = true;",
        lineNumber: 18,
        isInsert: true,
      })
    ).toEqual({ path: "src/app.ts", line: 18, side: "right" });
    expect(
      pullRequestReviewCommentLocation("src/app.ts", {
        type: "normal",
        content: " const value = true;",
        oldLineNumber: 20,
        newLineNumber: 22,
        isNormal: true,
      })
    ).toEqual({ path: "src/app.ts", line: 22, side: "right" });
  });

  it("maps deletions to the left side and keeps stable UI and payload keys", () => {
    const change = {
      type: "delete" as const,
      content: "-const value = false;",
      lineNumber: 17,
      isDelete: true as const,
    };
    const location = pullRequestReviewCommentLocation("src/app.ts", change);
    expect(location).toEqual({ path: "src/app.ts", line: 17, side: "left" });
    expect(pullRequestReviewCommentKey(location)).toBe("src/app.ts:left:17");
    expect(pullRequestDiffChangeKey("src/app.ts", change)).toBe("src/app.ts:D17");
  });

  it("builds ordered multi-line ranges on one diff side", () => {
    const changes = [
      {
        type: "normal" as const,
        content: " const first = true;",
        oldLineNumber: 20,
        newLineNumber: 22,
        isNormal: true as const,
      },
      {
        type: "delete" as const,
        content: "-const removed = true;",
        lineNumber: 21,
        isDelete: true as const,
      },
      {
        type: "insert" as const,
        content: "+const added = true;",
        lineNumber: 23,
        isInsert: true as const,
      },
      {
        type: "normal" as const,
        content: " return value;",
        oldLineNumber: 22,
        newLineNumber: 24,
        isNormal: true as const,
      },
    ];

    expect(
      pullRequestReviewCommentRange("src/app.ts", changes, {
        side: "right",
        anchorChangeKey: "N22",
        focusChangeKey: "N20",
      })
    ).toEqual({
      location: {
        path: "src/app.ts",
        startLine: 22,
        startSide: "right",
        line: 24,
        side: "right",
      },
      changeKeys: ["N20", "I23", "N22"],
      endChangeKey: "N22",
    });
    expect(
      pullRequestReviewCommentRange("src/app.ts", changes, {
        side: "left",
        anchorChangeKey: "D21",
        focusChangeKey: "N22",
      })
    ).toEqual({
      location: {
        path: "src/app.ts",
        startLine: 21,
        startSide: "left",
        line: 22,
        side: "left",
      },
      changeKeys: ["D21", "N22"],
      endChangeKey: "N22",
    });
  });

  it("keeps single-line locations compatible and rejects a missing diff side", () => {
    const insert = {
      type: "insert" as const,
      content: "+const added = true;",
      lineNumber: 23,
      isInsert: true as const,
    };
    expect(
      pullRequestReviewCommentRange("src/app.ts", [insert], {
        side: "right",
        anchorChangeKey: "I23",
        focusChangeKey: "I23",
      })
    ).toEqual({
      location: { path: "src/app.ts", line: 23, side: "right" },
      changeKeys: ["I23"],
      endChangeKey: "I23",
    });
    expect(pullRequestReviewCommentLocationForSide("src/app.ts", insert, "left")).toBeNull();
  });

  it("attaches current review threads to their documented diff side and line", () => {
    const thread: GitHubPullRequestReviewThread = {
      id: "PRRT_1",
      path: "src/app.ts",
      line: 18,
      side: "right",
      subjectType: "line",
      isResolved: false,
      isOutdated: false,
      isCollapsed: false,
      viewerCanReply: true,
      viewerCanResolve: true,
      viewerCanUnresolve: false,
      comments: [],
      commentsHaveMore: false,
    };
    const change = {
      type: "insert" as const,
      content: "+const value = true;",
      lineNumber: 18,
      isInsert: true as const,
    };

    expect(pullRequestReviewThreadMatchesChange(thread, change)).toBe(true);
    expect(pullRequestReviewThreadMatchesChange({ ...thread, side: "left" }, change)).toBe(false);
    expect(pullRequestReviewThreadMatchesChange({ ...thread, isOutdated: true }, change)).toBe(
      false
    );

    const contextChange = {
      type: "normal" as const,
      content: " const value = true;",
      oldLineNumber: 17,
      newLineNumber: 18,
      isNormal: true as const,
    };
    expect(
      pullRequestReviewThreadMatchesChange({ ...thread, side: "left", line: 17 }, contextChange)
    ).toBe(true);
  });
});
