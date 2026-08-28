import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubRepository,
  GitHubRepositoryPage,
  GitHubRepositoryRelationship,
  GitHubStarredRepositoryPage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";
import {
  forkRepository,
  syncPersonalFork,
  syncRepositoryStar,
  updateRepositoryStar,
  updateRepositoryWatch,
} from "./github-repository-relationships";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const repository: GitHubRepository = {
  id: 1,
  owner: "octocat",
  name: "hello-world",
  fullName: "octocat/hello-world",
  url: "https://github.com/octocat/hello-world",
  stars: 42,
  forks: 3,
  openIssues: 1,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};

const relationship: GitHubRepositoryRelationship = {
  starred: true,
  watchLevel: "participating",
  viewerLogin: "octocat",
  viewerOwnsRepository: true,
};

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

describe("GitHub repository relationship mutations", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("uses focused Tauri commands without an organization fork target", async () => {
    vi.mocked(invoke).mockResolvedValue(relationship);
    const target = { owner: "octocat", repository: "hello-world" };

    await updateRepositoryStar(target, true);
    await updateRepositoryWatch(target, "allActivity");
    await forkRepository(target, { name: "harbor-copy", defaultBranchOnly: true });

    expect(invoke).toHaveBeenNthCalledWith(1, "github_update_repository_star", {
      ...target,
      starred: true,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_repository_watch", {
      ...target,
      watchLevel: "allActivity",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_fork_repository", {
      ...target,
      name: "harbor-copy",
      defaultBranchOnly: true,
    });
  });

  it("keeps relationship, repository counts, and starred pages consistent", () => {
    const queryClient = client();
    const repositoryData: InfiniteData<GitHubRepositoryPage> = {
      pages: [{ repositories: [repository], page: 1, hasMore: false }],
      pageParams: [1],
    };
    const starredData: InfiniteData<GitHubStarredRepositoryPage> = {
      pages: [
        {
          repositories: [{ repository, starredAt: "2026-08-28T08:00:00Z" }],
          page: 1,
          hasMore: false,
        },
      ],
      pageParams: [1],
    };
    queryClient.setQueryData(githubQueryKeys.repositories, repositoryData);
    queryClient.setQueryData(githubQueryKeys.starredRepositories({ sort: "starred" }), starredData);

    syncRepositoryStar(queryClient, repository, { ...relationship, starred: false }, true);

    expect(
      queryClient.getQueryData<GitHubRepositoryRelationship>(
        githubQueryKeys.repositoryRelationship({ owner: "octocat", repository: "hello-world" })
      )?.starred
    ).toBe(false);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories)
        ?.pages[0].repositories[0].stars
    ).toBe(41);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubStarredRepositoryPage>>(
        githubQueryKeys.starredRepositories({ sort: "starred" })
      )?.pages[0].repositories
    ).toEqual([]);
  });

  it("primes a newly returned personal fork without duplicating it", () => {
    const queryClient = client();
    const fork = {
      ...repository,
      id: 2,
      name: "hello-world-fork",
      fullName: "octocat/hello-world-fork",
    };
    queryClient.setQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories, {
      pages: [{ repositories: [repository], page: 1, hasMore: false }],
      pageParams: [1],
    });

    syncPersonalFork(queryClient, fork);
    syncPersonalFork(queryClient, fork);

    expect(
      queryClient
        .getQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories)
        ?.pages[0].repositories.map(({ id }) => id)
    ).toEqual([2, 1]);
  });
});
