import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { githubQueryKeys } from "./github-queries";
import { githubIssueRelationshipQueryKeys } from "./github-issue-relationship-queries";
import { refreshRepositoryIssueRelationships } from "./github-issue-relationship-mutations";

const target = {
  owner: "octocat",
  repository: "hello-world",
  issueNumber: 7,
};

describe("GitHub Issue relationship mutations", () => {
  it("refreshes relationship and Issue detail caches for both Issues", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    await refreshRepositoryIssueRelationships(queryClient, target, 42);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: githubIssueRelationshipQueryKeys.root(target),
      refetchType: "active",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: githubIssueRelationshipQueryKeys.root({ ...target, issueNumber: 42 }),
      refetchType: "active",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.issueRoot(target),
      refetchType: "active",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: githubQueryKeys.issueRoot({ ...target, issueNumber: 42 }),
      refetchType: "active",
    });
  });
});
