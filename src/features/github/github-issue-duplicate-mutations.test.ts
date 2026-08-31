import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssueDuplicateReference } from "./github-data";
import {
  markRepositoryIssueDuplicate,
  refreshRepositoryIssueDuplicate,
  unmarkRepositoryIssueDuplicate,
} from "./github-issue-duplicate-mutations";
import { githubIssueDuplicateQueryKeys } from "./github-issue-duplicate-queries";
import { githubIssueStateQueryKeys } from "./github-issue-state-queries";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const target = {
  owner: "octocat",
  repository: "hello-world",
  issueNumber: 7,
  expectedIssueNodeId: "I_7",
};

const canonical: GitHubIssueDuplicateReference = {
  owner: "octocat",
  repository: "api",
  fullName: "octocat/api",
  repositoryUrl: "https://github.com/octocat/api",
  issueNumber: 9,
  title: "Canonical Issue",
  url: "https://github.com/octocat/api/issues/9",
  viewerCanUnmark: true,
};

describe("GitHub Issue duplicate mutations", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("invokes the focused Tauri command with the authoritative source identity", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ number: target.issueNumber })
      .mockResolvedValueOnce({ number: target.issueNumber });

    await unmarkRepositoryIssueDuplicate(target);
    await markRepositoryIssueDuplicate(target, 9);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_unmark_repository_issue_duplicate", target);
    expect(invoke).toHaveBeenNthCalledWith(2, "github_mark_repository_issue_duplicate", {
      ...target,
      canonicalIssueNumber: 9,
    });
  });

  it("refreshes source, duplicate, state, list, inbox, and canonical Issue caches", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await refreshRepositoryIssueDuplicate(queryClient, target, canonical);

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.issueRoot(target),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.issuesRoot(target),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.issueInboxRoot,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubIssueStateQueryKeys.capabilitiesRoot(target),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubIssueDuplicateQueryKeys.root(target),
      refetchType: "active",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.issueRoot({
        owner: canonical.owner,
        repository: canonical.repository,
        issueNumber: canonical.issueNumber,
      }),
      refetchType: "active",
    });
  });
});
