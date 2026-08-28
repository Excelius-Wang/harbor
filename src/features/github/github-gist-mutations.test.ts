import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubGist, GitHubGistCommentPage, GitHubGistPage } from "./github-data";
import {
  createGist,
  deleteGist,
  forkGist,
  mutateGistComment,
  syncDeletedGist,
  syncDeletedGistComment,
  syncGist,
  syncGistComment,
  updateGist,
  updateGistStar,
} from "./github-gist-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const gist: GitHubGist = {
  id: "abc123",
  description: "Useful notes",
  url: "https://gist.github.com/octocat/abc123",
  public: true,
  owner: "octocat",
  comments: 0,
  commentsEnabled: true,
  createdAt: "2026-08-20T00:00:00Z",
  updatedAt: "2026-08-28T00:00:00Z",
  files: [
    {
      filename: "notes.md",
      size: 7,
      truncated: false,
      content: "# Notes",
    },
  ],
  starred: true,
  viewerOwns: true,
};

function page(sourceGist = gist): InfiniteData<GitHubGistPage> {
  return {
    pages: [{ gists: [sourceGist], page: 1, hasPrevious: false, hasMore: false }],
    pageParams: [1],
  };
}

describe("GitHub Gist mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(gist);
  });

  it("uses the focused Tauri contracts for every Gist write", async () => {
    const createInput = {
      description: "Useful notes",
      public: false,
      files: [{ filename: "notes.md", content: "# Notes" }],
    };
    const updateInput = {
      description: "Updated",
      files: [
        {
          originalFilename: "notes.md",
          filename: "README.md",
          content: "# Updated",
          deleted: false,
        },
      ],
    };
    await createGist(createInput);
    await updateGist("abc123", updateInput);
    await updateGistStar("abc123", false);
    await forkGist("abc123");
    await mutateGistComment("abc123", { action: "create", body: "Looks good" });
    await deleteGist("abc123", "abc123");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_create_gist", { input: createInput });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_gist", {
      gistId: "abc123",
      input: updateInput,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_update_gist_star", {
      gistId: "abc123",
      starred: false,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_fork_gist", { gistId: "abc123" });
    expect(invoke).toHaveBeenNthCalledWith(5, "github_mutate_gist_comment", {
      gistId: "abc123",
      mutation: { action: "create", body: "Looks good" },
    });
    expect(invoke).toHaveBeenNthCalledWith(6, "github_delete_gist", {
      gistId: "abc123",
      confirmation: "abc123",
    });
  });

  it("reconciles source lists by authoritative personal, public, and star state", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(githubQueryKeys.gists({ source: "mine" }), page());
    queryClient.setQueryData(githubQueryKeys.gists({ source: "starred" }), page());
    queryClient.setQueryData(githubQueryKeys.gists({ source: "public" }), page());
    const updated = { ...gist, starred: false, description: "Updated" };

    syncGist(queryClient, updated);

    expect(
      queryClient.getQueryData<InfiniteData<GitHubGistPage>>(
        githubQueryKeys.gists({ source: "mine" })
      )?.pages[0].gists
    ).toEqual([updated]);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubGistPage>>(
        githubQueryKeys.gists({ source: "starred" })
      )?.pages[0].gists
    ).toEqual([]);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubGistPage>>(
        githubQueryKeys.gists({ source: "public" })
      )?.pages[0].gists
    ).toEqual([updated]);

    syncDeletedGist(queryClient, gist.id);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubGistPage>>(
        githubQueryKeys.gists({ source: "mine" })
      )?.pages[0].gists
    ).toEqual([]);
  });

  it("adds, updates, and removes comments without losing paginated cache state", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(githubQueryKeys.gist({ gistId: gist.id }), gist);
    queryClient.setQueryData<InfiniteData<GitHubGistCommentPage>>(
      githubQueryKeys.gistComments({ gistId: gist.id }),
      {
        pages: [{ comments: [], page: 1, hasPrevious: false, hasMore: false }],
        pageParams: [1],
      }
    );
    const comment = {
      id: 42,
      body: "Looks good",
      author: "octocat",
      createdAt: "2026-08-28T00:00:00Z",
      updatedAt: "2026-08-28T00:00:00Z",
      viewerCanUpdate: true,
      viewerCanDelete: true,
    };

    syncGistComment(queryClient, gist.id, comment, true);
    expect(
      queryClient.getQueryData<GitHubGist>(githubQueryKeys.gist({ gistId: gist.id }))?.comments
    ).toBe(1);

    syncGistComment(queryClient, gist.id, { ...comment, body: "Updated" });
    expect(
      queryClient.getQueryData<InfiniteData<GitHubGistCommentPage>>(
        githubQueryKeys.gistComments({ gistId: gist.id })
      )?.pages[0].comments[0].body
    ).toBe("Updated");

    syncDeletedGistComment(queryClient, gist.id, comment.id);
    expect(
      queryClient.getQueryData<GitHubGist>(githubQueryKeys.gist({ gistId: gist.id }))?.comments
    ).toBe(0);
  });
});
