import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssueDuplicateReference } from "./github-data";
import {
  markRepositoryIssueDuplicate,
  parseCanonicalIssueReference,
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
    await markRepositoryIssueDuplicate(target, {
      owner: "octocat",
      repository: "api",
      issueNumber: 9,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "github_unmark_repository_issue_duplicate", target);
    expect(invoke).toHaveBeenNthCalledWith(2, "github_mark_repository_issue_duplicate", {
      input: {
        ...target,
        canonicalOwner: "octocat",
        canonicalRepository: "api",
        canonicalIssueNumber: 9,
      },
    });
  });

  it("accepts same-repository numbers and exact cross-repository Issue URLs", () => {
    expect(parseCanonicalIssueReference("9", target)).toEqual({
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 9,
    });
    expect(parseCanonicalIssueReference("https://github.com/octocat/api/issues/9", target)).toEqual(
      { owner: "octocat", repository: "api", issueNumber: 9 }
    );
    expect(parseCanonicalIssueReference("https://github.com/octocat/api/issues/7", target)).toEqual(
      { owner: "octocat", repository: "api", issueNumber: 7 }
    );
    expect(parseCanonicalIssueReference("7", target)).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com/OCTOCAT/HELLO-WORLD/issues/7", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://example.com/octocat/api/issues/9", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com/octocat/api/pull/9", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com/octocat/api/issues/9?redirected=1", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com/octocat/api/issues/9/extra", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com//octocat/api/issues/9", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com/octocat/api/issues/9/", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com:443/octocat/api/issues/9", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://@github.com/octocat/api/issues/9", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://user:secret@github.com/octocat/api/issues/9", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("http://github.com/octocat/api/issues/9", target)
    ).toBeNull();
    expect(
      parseCanonicalIssueReference("https://github.com/octocat/api/issues/9#discussion", target)
    ).toBeNull();
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
