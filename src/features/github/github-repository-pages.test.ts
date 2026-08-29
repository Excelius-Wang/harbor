import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubPagesWorkspace } from "./github-data";
import { githubQueryKeys } from "./github-queries";
import { mutateRepositoryPages, syncRepositoryPages } from "./github-repository-pages";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const target = { owner: "octocat", repository: "harbor" };

function workspace(page = 1): GitHubPagesWorkspace {
  return {
    site: {
      status: "built",
      url: "https://octocat.github.io/harbor/",
      buildType: "legacy",
      source: { branch: "main", path: "docs" },
      customDomain: "docs.example.com",
      custom404: true,
      public: true,
      httpsEnforced: true,
      protectedDomainState: "verified",
    },
    builds: [
      {
        status: "built",
        commit: "abcdef1234567890",
        pusher: "octocat",
        createdAt: "2026-08-29T10:00:00Z",
      },
    ],
    page,
    hasPrevious: page > 1,
    hasMore: false,
    isArchived: false,
  };
}

describe("repository Pages", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("sends the exact typed Tauri mutation payload", async () => {
    vi.mocked(invoke).mockResolvedValue(workspace());
    const mutation = {
      action: "configure" as const,
      configuration: {
        buildType: "legacy" as const,
        branch: "main",
        sourcePath: "docs" as const,
        customDomain: "docs.example.com",
        httpsEnforced: true,
      },
    };

    await mutateRepositoryPages(target, mutation);

    expect(invoke).toHaveBeenCalledWith("github_mutate_repository_pages", {
      ...target,
      mutation,
    });
  });

  it("reconciles the site across pages and replaces only the returned build page", () => {
    const queryClient = new QueryClient();
    const firstPage = workspace(1);
    const secondPage = { ...workspace(2), builds: [{ status: "built", commit: "older" }] };
    queryClient.setQueryData(githubQueryKeys.repositoryPages({ ...target, page: 1 }), firstPage);
    queryClient.setQueryData(githubQueryKeys.repositoryPages({ ...target, page: 2 }), secondPage);
    const updated = {
      ...firstPage,
      site: { ...firstPage.site!, customDomain: undefined, httpsEnforced: false },
      builds: [{ status: "queued", commit: "new-build" }],
    };

    syncRepositoryPages(queryClient, target, updated);

    expect(
      queryClient.getQueryData<GitHubPagesWorkspace>(
        githubQueryKeys.repositoryPages({ ...target, page: 1 })
      )?.builds[0].commit
    ).toBe("new-build");
    const cachedSecondPage = queryClient.getQueryData<GitHubPagesWorkspace>(
      githubQueryKeys.repositoryPages({ ...target, page: 2 })
    );
    expect(cachedSecondPage?.builds[0].commit).toBe("older");
    expect(cachedSecondPage?.site?.customDomain).toBeUndefined();
  });

  it("clears every cached build page when Pages is disabled", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(githubQueryKeys.repositoryPages({ ...target, page: 2 }), workspace(2));

    syncRepositoryPages(queryClient, target, {
      builds: [],
      page: 1,
      hasPrevious: false,
      hasMore: false,
      isArchived: false,
    });

    const disabled = queryClient.getQueryData<GitHubPagesWorkspace>(
      githubQueryKeys.repositoryPages({ ...target, page: 2 })
    );
    expect(disabled).toMatchObject({ builds: [], page: 2 });
    expect(disabled?.site).toBeUndefined();
  });
});
