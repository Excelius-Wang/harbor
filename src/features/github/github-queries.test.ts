import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubCodeOverview } from "./github-data";
import { repositoryCodeQueryOptions, resetGitHubQueryCache } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const overview: GitHubCodeOverview = {
  branches: [{ name: "main", protected: true }],
  commits: [],
  commitsHaveMore: false,
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

describe("GitHub repository queries", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(overview);
  });

  it("deduplicates matching in-flight reads and reuses fresh Code data", async () => {
    const client = createTestQueryClient();
    const options = repositoryCodeQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });

    const [first, second] = await Promise.all([
      client.fetchQuery(options),
      client.fetchQuery(options),
    ]);
    const cached = await client.fetchQuery(options);

    expect(first).toEqual(overview);
    expect(second).toEqual(overview);
    expect(cached).toEqual(overview);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_code_overview", {
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });
  });

  it("refetches Code data after explicit invalidation", async () => {
    const client = createTestQueryClient();
    const options = repositoryCodeQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });

    await client.fetchQuery(options);
    await client.invalidateQueries({ queryKey: options.queryKey, exact: true });
    await client.fetchQuery(options);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("resets active GitHub data on an account change without clearing unrelated data", async () => {
    const client = createTestQueryClient();
    const options = repositoryCodeQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.refetch();
    client.setQueryData(["settings", "theme"], "dark");
    client.setQueryData(["github", "repository", "old", "private", "issues"], {
      issues: [{ id: 1 }],
    });

    let resolveRefetch: ((value: GitHubCodeOverview) => void) | undefined;
    const nextOverview = { ...overview, commitsHaveMore: true };
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve as (value: GitHubCodeOverview) => void;
        })
    );

    const reset = resetGitHubQueryCache(client);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBeUndefined());
    resolveRefetch?.(nextOverview);
    await reset;

    expect(observer.getCurrentResult().data).toEqual(nextOverview);
    expect(
      client.getQueryData(["github", "repository", "old", "private", "issues"])
    ).toBeUndefined();
    expect(client.getQueryData(["settings", "theme"])).toBe("dark");
    unsubscribe();
  });
});
