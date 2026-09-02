import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  githubIssueTrackingQueryKeys,
  issueTrackingQueryOptions,
} from "./github-issue-tracking-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("GitHub Issue tracking queries", () => {
  it("keys each direction and invokes the read-only Tauri command", async () => {
    const target = {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      direction: "trackedBy" as const,
      after: "cursor-1",
    };
    vi.mocked(invoke).mockResolvedValueOnce({
      direction: "trackedBy",
      issues: [],
      nextCursor: null,
    });

    const options = issueTrackingQueryOptions(target);
    await options.queryFn?.({} as never);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "issue",
      7,
      "tracking",
      "trackedBy",
      "cursor-1",
    ]);
    expect(githubIssueTrackingQueryKeys.root(target)).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "issue",
      7,
      "tracking",
      "trackedBy",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_tracking", target);
  });
});
