import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubCodeOverview, GitHubRepositoryFileCommit } from "./github-data";
import {
  commitRepositoryFile,
  createRepositoryBranch,
  deleteRepositoryBranch,
  syncCreatedRepositoryBranch,
  syncDeletedRepositoryBranch,
  syncRepositoryFileCommit,
} from "./github-code-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = { owner: "octocat", repository: "harbor" };
const mainSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const commitSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const overview: GitHubCodeOverview = {
  branches: [{ name: "main", sha: mainSha, protected: true }],
  tags: [],
  tagsHaveMore: false,
  commits: [],
  commitsHaveMore: false,
  canWrite: true,
  isArchived: false,
};

describe("GitHub Code mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("sends exact file, branch, and stale-revision arguments", async () => {
    vi.mocked(invoke).mockResolvedValue({});
    await commitRepositoryFile(target, "main", "Update src/lib.rs", {
      action: "update",
      path: "src/lib.rs",
      expectedSha: mainSha,
      content: "pub fn harbor() {}\n",
    });
    await createRepositoryBranch(target, "main", mainSha, "feature/code-write");
    await deleteRepositoryBranch(target, "feature/code-write", mainSha);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_commit_repository_file", {
      ...target,
      branch: "main",
      message: "Update src/lib.rs",
      mutation: {
        action: "update",
        path: "src/lib.rs",
        expectedSha: mainSha,
        content: "pub fn harbor() {}\n",
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_create_repository_branch", {
      ...target,
      sourceBranch: "main",
      expectedSourceSha: mainSha,
      branch: "feature/code-write",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_delete_repository_branch", {
      ...target,
      branch: "feature/code-write",
      expectedSha: mainSha,
    });
  });

  it("reconciles branch lists and the selected branch head before invalidation", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(githubQueryKeys.code({ ...target, reference: "main" }), overview);
    syncCreatedRepositoryBranch(queryClient, target, {
      name: "feature/code-write",
      sha: mainSha,
      protected: false,
    });

    expect(
      queryClient
        .getQueryData<GitHubCodeOverview>(githubQueryKeys.code({ ...target, reference: "main" }))
        ?.branches.map((branch) => branch.name)
    ).toEqual(["feature/code-write", "main"]);

    const commit: GitHubRepositoryFileCommit = {
      branch: "main",
      commitSha,
      shortSha: "bbbbbbb",
      message: "Update src/lib.rs",
      url: `https://github.com/octocat/harbor/commit/${commitSha}`,
      file: {
        name: "lib.rs",
        path: "src/lib.rs",
        sha: commitSha,
        kind: "file",
        size: 20,
      },
      previousPath: null,
    };
    syncRepositoryFileCommit(queryClient, target, commit);
    expect(
      queryClient
        .getQueryData<GitHubCodeOverview>(githubQueryKeys.code({ ...target, reference: "main" }))
        ?.branches.find((branch) => branch.name === "main")?.sha
    ).toBe(commitSha);
    expect(
      queryClient.getQueryData<GitHubCodeOverview>(
        githubQueryKeys.code({ ...target, reference: "main" })
      )?.commits[0]
    ).toMatchObject({ sha: commitSha, title: "Update src/lib.rs" });

    syncDeletedRepositoryBranch(queryClient, target, "feature/code-write");
    expect(
      queryClient
        .getQueryData<GitHubCodeOverview>(githubQueryKeys.code({ ...target, reference: "main" }))
        ?.branches.map((branch) => branch.name)
    ).toEqual(["main"]);
  });
});
