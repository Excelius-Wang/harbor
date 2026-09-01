import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { GitHubCommitComment, GitHubCommitCommentPage } from "./github-data";
import { reconcileCommitCommentPages, syncRepositoryCommitComment } from "./github-commit-comments";
import { githubQueryKeys, repositoryCommitCommentsQueryOptions } from "./github-queries";

const target = {
  owner: "octocat",
  repository: "hello-world",
  commitSha: "a".repeat(40),
};

function comment(databaseId: number, body = "Body"): GitHubCommitComment {
  return {
    id: `CC_${databaseId}`,
    databaseId,
    commitSha: target.commitSha,
    body,
    path: null,
    position: null,
    line: null,
    author: null,
    authorAssociation: null,
    url: `https://github.com/octocat/hello-world/commit/${target.commitSha}#commitcomment-${databaseId}`,
    createdAt: "2026-08-30T01:00:00Z",
    updatedAt: "2026-08-30T01:00:00Z",
    viewerCanUpdate: true,
    viewerCanDelete: true,
    isMinimized: false,
    minimizedReason: null,
    viewerCanMinimize: true,
    viewerCanUnminimize: false,
  };
}

function page(comments: GitHubCommitComment[], pageNumber = 1): GitHubCommitCommentPage {
  return {
    comments,
    page: pageNumber,
    hasPrevious: pageNumber > 1,
    hasMore: false,
  };
}

describe("GitHub commit comment cache", () => {
  it("uses one repository and immutable-SHA scoped infinite-query family", () => {
    expect(githubQueryKeys.commitComments(target)).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "commit",
      target.commitSha,
      "comments",
    ]);
    const options = repositoryCommitCommentsQueryOptions(target);
    expect(options.initialPageParam).toBe(1);
    expect(options.getNextPageParam?.(page([], 1), [page([], 1)], 1, [1])).toBeUndefined();
    expect(
      options.getNextPageParam?.({ ...page([], 2), hasMore: true }, [page([], 1)], 2, [1])
    ).toBe(3);
  });

  it("replaces and deletes by stable Node and database identity", () => {
    const data: InfiniteData<GitHubCommitCommentPage, number> = {
      pages: [page([comment(1), comment(2)])],
      pageParams: [1],
    };
    expect(
      reconcileCommitCommentPages(data, comment(2, "Updated"), "update").pages[0].comments
    ).toMatchObject([
      { databaseId: 1, body: "Body" },
      { databaseId: 2, body: "Updated" },
    ]);
    expect(reconcileCommitCommentPages(data, comment(1), "delete").pages[0].comments).toEqual([
      comment(2),
    ]);
  });

  it("appends a created comment only when the loaded last page is complete and has room", () => {
    const loaded: InfiniteData<GitHubCommitCommentPage, number> = {
      pages: [page([comment(1)])],
      pageParams: [1],
    };
    expect(reconcileCommitCommentPages(loaded, comment(2), "create").pages[0].comments).toEqual([
      comment(1),
      comment(2),
    ]);
    const partial = {
      ...loaded,
      pages: [{ ...loaded.pages[0], hasMore: true }],
    };
    expect(reconcileCommitCommentPages(partial, comment(2), "create")).toEqual(partial);
  });

  it("synchronizes the focused cache without touching immutable commit pages", () => {
    const queryClient = new QueryClient();
    const commentsKey = githubQueryKeys.commitComments(target);
    const commitKey = githubQueryKeys.commitDetail(target);
    const data: InfiniteData<GitHubCommitCommentPage, number> = {
      pages: [page([comment(1)])],
      pageParams: [1],
    };
    queryClient.setQueryData(commentsKey, data);
    queryClient.setQueryData(commitKey, { pages: [{ immutable: true }], pageParams: [1] });

    syncRepositoryCommitComment(queryClient, target, comment(1, "Updated"), "update");

    expect(
      queryClient.getQueryData<InfiniteData<GitHubCommitCommentPage, number>>(commentsKey)?.pages[0]
        .comments[0].body
    ).toBe("Updated");
    expect(queryClient.getQueryData(commitKey)).toEqual({
      pages: [{ immutable: true }],
      pageParams: [1],
    });
  });
});
