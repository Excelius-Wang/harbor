import { describe, expect, it } from "vitest";
import type { GitHubCommitDetailPage } from "./github-data";
import { matchingCommitDetailPages } from "./github-commit-detail";
import { parseGitHubFilePatch } from "./github-file-diff";

function commitPage(page: number, sha = "a".repeat(40)): GitHubCommitDetailPage {
  return {
    commit: {
      sha,
      shortSha: sha.slice(0, 7),
      message: "Keep commit inspection in Harbor",
      url: `https://github.com/octocat/hello-world/commit/${sha}`,
      author: null,
      committer: null,
      parents: [],
      stats: { additions: 3, deletions: 1, total: 4 },
      verification: { verified: true, reason: "valid", verifiedAt: null },
    },
    files: [],
    page,
    hasPrevious: page > 1,
    hasMore: page < 2,
    filesAtLimit: false,
  };
}

describe("GitHub commit detail", () => {
  it("combines only contiguous pages with matching immutable metadata", () => {
    expect(matchingCommitDetailPages([commitPage(1), commitPage(2)])).toHaveLength(2);
    expect(matchingCommitDetailPages([commitPage(1), commitPage(3)])).toHaveLength(1);
    expect(matchingCommitDetailPages([commitPage(1), commitPage(2, "b".repeat(40))])).toHaveLength(
      1
    );
  });

  it("normalizes renamed patches for the shared diff renderer", () => {
    const parsed = parseGitHubFilePatch({
      path: "src/native.ts",
      previousPath: "src/web.ts",
      status: "renamed",
      patch: "@@ -1 +1 @@\n-export const web = true\n+export const native = true",
    });

    expect(parsed?.oldPath).toBe("src/web.ts");
    expect(parsed?.newPath).toBe("src/native.ts");
    expect(parsed?.hunks).toHaveLength(1);
  });

  it("keeps missing and malformed patches out of the diff parser", () => {
    expect(parseGitHubFilePatch({ path: "assets/logo.png", status: "modified" })).toBeNull();
    expect(
      parseGitHubFilePatch({ path: "src/app.ts", status: "modified", patch: "not a hunk" })
    ).toBeNull();
  });
});
