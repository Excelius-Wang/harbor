import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  githubIssueDependencyQueryKeys,
  issueDependenciesQueryOptions,
} from "./github-issue-dependency-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("GitHub Issue dependency queries", () => {
  it("keys both directed dependency pages under the Issue and invokes the read-only Tauri command", async () => {
    const target = {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      page: 2,
    };
    vi.mocked(invoke).mockResolvedValueOnce({
      blockedBy: [],
      blocking: [],
      page: 2,
      hasPrevious: true,
      hasMore: false,
    });

    const options = issueDependenciesQueryOptions(target);
    await options.queryFn?.({} as never);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "issue",
      7,
      "dependencies",
      2,
    ]);
    expect(githubIssueDependencyQueryKeys.root(target)).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "issue",
      7,
      "dependencies",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_dependencies", target);

    const placeholderData = options.placeholderData;
    expect(typeof placeholderData).toBe("function");
    const previous = { page: 1 };
    expect(
      typeof placeholderData === "function"
        ? placeholderData(
            previous as never,
            {
              queryKey: [...githubIssueDependencyQueryKeys.root(target), 1],
            } as never
          )
        : undefined
    ).toBe(previous);
    expect(
      typeof placeholderData === "function"
        ? placeholderData(
            previous as never,
            {
              queryKey: [
                "github",
                "repository",
                "octocat",
                "other-repository",
                "issue",
                7,
                "dependencies",
                1,
              ],
            } as never
          )
        : previous
    ).toBeUndefined();
  });
});
