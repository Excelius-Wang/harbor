import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubWikiMutationResult, GitHubWikiOverview } from "./github-data";
import {
  githubQueryKeys,
  repositoryWikiComparisonQueryOptions,
  repositoryWikiHistoryQueryOptions,
  repositoryWikiPageQueryOptions,
  repositoryWikiQueryOptions,
  repositoryWikiRevisionQueryOptions,
} from "./github-queries";
import {
  deleteRepositoryWikiPage,
  mutateRepositoryWikiPage,
  revertRepositoryWikiPage,
  resolveWikiPagePath,
  syncRepositoryWikiMutation,
} from "./github-wiki";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = { owner: "octocat", repository: "harbor" };
const headSha = "a".repeat(40);
const blobSha = "b".repeat(40);

const overview: GitHubWikiOverview = {
  repositoryId: 42,
  enabled: true,
  initialized: true,
  canEdit: true,
  archived: false,
  defaultBranch: "wiki-main",
  headSha,
  pages: [
    {
      path: "Home.md",
      title: "Home",
      kind: "home",
      markdown: true,
      blobSha,
      byteSize: 12,
    },
  ],
  unsupportedFileCount: 0,
  truncated: false,
  stale: false,
  fetchedAt: 1,
  webUrl: "https://github.com/octocat/harbor/wiki",
};

describe("GitHub Wiki transport contracts", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("resolves unique relative Wiki links without guessing ambiguous paths", () => {
    const pages = [
      overview.pages[0],
      {
        ...overview.pages[0],
        path: "Guides/Install.md",
        title: "Install",
      },
      {
        ...overview.pages[0],
        path: "guides/install.textile",
        title: "install",
        markdown: false,
      },
    ];

    expect(resolveWikiPagePath("../Home", "Guides/Install.md", pages)).toBe("Home.md");
    expect(resolveWikiPagePath("Install.md#linux", "Guides/Start.md", pages)).toBe(
      "Guides/Install.md"
    );
    expect(resolveWikiPagePath("GUIDES/INSTALL", "Home.md", pages)).toBeNull();
    expect(resolveWikiPagePath("%E0%A4%A", "Home.md", pages)).toBeNull();
  });

  it("keeps overview and immutable page snapshots in focused caches", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce({ ...overview.pages[0], content: "# Home", headSha });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const overviewOptions = repositoryWikiQueryOptions(target);
    const pageTarget = {
      ...target,
      repositoryId: 42,
      headSha,
      path: "Home.md",
    };
    const pageOptions = repositoryWikiPageQueryOptions(pageTarget);

    await queryClient.fetchQuery(overviewOptions);
    await queryClient.fetchQuery(pageOptions);

    expect(overviewOptions.queryKey).toEqual(["github", "repository", "octocat", "harbor", "wiki"]);
    expect(pageOptions.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "harbor",
      "wiki",
      "page",
      headSha,
      "Home.md",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_wiki", target);
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_repository_wiki_page", pageTarget);
  });

  it("sends exact head and blob guards for writes", async () => {
    vi.mocked(invoke).mockResolvedValue({});
    await mutateRepositoryWikiPage(target, {
      originalPath: "Home.md",
      title: "Home",
      content: "# Updated",
      expectedHead: headSha,
      expectedBlobSha: blobSha,
      message: "Clarify the landing page",
    });
    await deleteRepositoryWikiPage(target, "Home.md", headSha, blobSha);
    await revertRepositoryWikiPage(target, {
      path: "Home.md",
      expectedHead: headSha,
      expectedBlobSha: blobSha,
      sourceCommitSha: "c".repeat(40),
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "github_mutate_repository_wiki_page", {
      ...target,
      input: {
        originalPath: "Home.md",
        title: "Home",
        content: "# Updated",
        expectedHead: headSha,
        expectedBlobSha: blobSha,
        message: "Clarify the landing page",
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_delete_repository_wiki_page", {
      ...target,
      path: "Home.md",
      expectedHead: headSha,
      expectedBlobSha: blobSha,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_revert_repository_wiki_page", {
      ...target,
      input: {
        path: "Home.md",
        expectedHead: headSha,
        expectedBlobSha: blobSha,
        sourceCommitSha: "c".repeat(40),
      },
    });
  });

  it("keys history, revision, and comparison by immutable revisions", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ revisions: [], page: 1, hasMore: false, truncated: false })
      .mockResolvedValueOnce({ revision: { sha: headSha }, path: "Home.md", deleted: false })
      .mockResolvedValueOnce({ path: "Home.md", patch: "", additions: 0, deletions: 0 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const history = repositoryWikiHistoryQueryOptions({
      ...target,
      repositoryId: 42,
      headSha,
      path: "Home.md",
      page: 1,
    });
    const revision = repositoryWikiRevisionQueryOptions({
      ...target,
      repositoryId: 42,
      commitSha: blobSha,
      path: "Home.md",
    });
    const comparison = repositoryWikiComparisonQueryOptions({
      ...target,
      repositoryId: 42,
      path: "Home.md",
      baseSha: blobSha,
      headSha,
    });

    await queryClient.fetchQuery(history);
    await queryClient.fetchQuery(revision);
    await queryClient.fetchQuery(comparison);

    expect(history.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "harbor",
      "wiki",
      "history",
      headSha,
      "Home.md",
      1,
    ]);
    expect(revision.queryKey).toContain("revision");
    expect(comparison.queryKey).toContain("compare");
    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repository_wiki_history", {
      ...target,
      repositoryId: 42,
      headSha,
      path: "Home.md",
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_repository_wiki_revision", {
      ...target,
      repositoryId: 42,
      commitSha: blobSha,
      path: "Home.md",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_compare_repository_wiki_revisions", {
      ...target,
      repositoryId: 42,
      path: "Home.md",
      baseSha: blobSha,
      headSha,
    });
  });

  it("seeds the authoritative page before invalidating the Wiki root", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const nextHead = "c".repeat(40);
    const result: GitHubWikiMutationResult = {
      overview: { ...overview, headSha: nextHead },
      page: {
        ...overview.pages[0],
        blobSha: "d".repeat(40),
        content: "# Updated",
        headSha: nextHead,
      },
    };

    syncRepositoryWikiMutation(queryClient, target, result, "Home.md");

    expect(
      queryClient.getQueryData(
        githubQueryKeys.repositoryWikiPage({
          ...target,
          repositoryId: 42,
          headSha: nextHead,
          path: "Home.md",
        })
      )
    ).toEqual(result.page);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.repositoryWiki(target),
    });
  });
});
