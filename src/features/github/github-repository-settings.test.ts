import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubRepository,
  GitHubRepositoryPage,
  GitHubRepositorySettings,
  GitHubStarredRepositoryPage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";
import {
  createPersonalRepository,
  deletePersonalRepository,
  syncCreatedPersonalRepository,
  syncDeletedPersonalRepository,
  syncUpdatedPersonalRepository,
  updatePersonalRepositorySettings,
} from "./github-repository-settings";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const repository: GitHubRepository = {
  id: 42,
  owner: "octocat",
  name: "harbor",
  fullName: "octocat/harbor",
  url: "https://github.com/octocat/harbor",
  stars: 12,
  forks: 3,
  openIssues: 4,
  defaultBranch: "main",
  isPrivate: true,
  isFork: false,
  isArchived: false,
};

const settings: GitHubRepositorySettings = {
  repository,
  visibility: "private",
  isTemplate: false,
  hasIssues: true,
  hasProjects: true,
  hasWiki: false,
  hasDiscussions: true,
  allowMergeCommit: true,
  allowSquashMerge: true,
  allowRebaseMerge: false,
  allowAutoMerge: true,
  allowUpdateBranch: true,
  deleteBranchOnMerge: true,
};

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

describe("personal repository settings", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("uses owner-scoped settings commands and a personal create command", async () => {
    vi.mocked(invoke).mockResolvedValue(settings);
    const input = {
      name: "harbor",
      visibility: "private" as const,
      initializeWithReadme: true,
      hasIssues: true,
      hasProjects: true,
      hasWiki: false,
      hasDiscussions: true,
    };
    const target = { owner: "octocat", repository: "harbor" };
    const update = {
      ...settings,
      repository: undefined,
      name: "harbor",
      defaultBranch: "main",
      archived: false,
      acceptVisibilityChangeConsequences: false,
      confirmArchiveChange: false,
    };
    delete update.repository;

    await createPersonalRepository(input);
    await updatePersonalRepositorySettings(target, update);
    await deletePersonalRepository(target, "octocat/harbor");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_create_personal_repository", { input });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_personal_repository_settings", {
      ...target,
      update,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_delete_personal_repository", {
      ...target,
      confirmation: "octocat/harbor",
    });
  });

  it("primes, renames, and removes repositories across owned and starred caches", () => {
    const queryClient = client();
    const old = { ...repository, name: "old", fullName: "octocat/old" };
    queryClient.setQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories, {
      pages: [{ repositories: [old], page: 1, hasMore: false }],
      pageParams: [1],
    });
    queryClient.setQueryData<InfiniteData<GitHubStarredRepositoryPage>>(
      githubQueryKeys.starredRepositories({ sort: "starred" }),
      {
        pages: [
          {
            repositories: [{ repository: old, starredAt: "2026-08-28T08:00:00Z" }],
            page: 1,
            hasMore: false,
          },
        ],
        pageParams: [1],
      }
    );

    syncUpdatedPersonalRepository(queryClient, { owner: "octocat", repository: "old" }, settings);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories)
        ?.pages[0].repositories[0].name
    ).toBe("harbor");
    expect(
      queryClient.getQueryData<InfiniteData<GitHubStarredRepositoryPage>>(
        githubQueryKeys.starredRepositories({ sort: "starred" })
      )?.pages[0].repositories[0].repository.name
    ).toBe("harbor");

    syncDeletedPersonalRepository(
      queryClient,
      { owner: "octocat", repository: "harbor" },
      repository.id
    );
    expect(
      queryClient.getQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories)
        ?.pages[0].repositories
    ).toEqual([]);
  });

  it("adds a newly created personal repository only once", () => {
    const queryClient = client();
    queryClient.setQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories, {
      pages: [{ repositories: [], page: 1, hasMore: false }],
      pageParams: [1],
    });
    syncCreatedPersonalRepository(queryClient, settings);
    syncCreatedPersonalRepository(queryClient, settings);
    expect(
      queryClient
        .getQueryData<InfiniteData<GitHubRepositoryPage>>(githubQueryKeys.repositories)
        ?.pages[0].repositories.map(({ id }) => id)
    ).toEqual([42]);
  });
});
