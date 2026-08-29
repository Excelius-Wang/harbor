import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssueLabelPage, GitHubIssueMilestonePage } from "./github-data";
import {
  invalidateRepositoryIssueTaxonomy,
  mutateRepositoryIssueLabel,
  mutateRepositoryIssueMilestone,
  syncRepositoryIssueLabel,
  syncRepositoryIssueMilestone,
} from "./github-issue-taxonomy-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const repository = { owner: "octocat", repository: "hello-world" };

describe("GitHub issue taxonomy mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(null);
  });

  it("uses the exact label and milestone Tauri contracts", async () => {
    const labelTarget = {
      ...repository,
      mutation: {
        action: "update" as const,
        originalName: "bug",
        name: "needs-triage",
        color: "a1b2c3",
        description: "Sort incoming reports",
      },
    };
    const milestoneTarget = {
      ...repository,
      mutation: {
        action: "delete" as const,
        number: 3,
        confirmation: "Harbor 1.0",
      },
    };

    await mutateRepositoryIssueLabel(labelTarget);
    await mutateRepositoryIssueMilestone(milestoneTarget);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_mutate_repository_issue_label", labelTarget);
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "github_mutate_repository_issue_milestone",
      milestoneTarget
    );
  });

  it("reconciles renamed and deleted taxonomy records by stable identity", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<GitHubIssueLabelPage>(githubQueryKeys.issueLabels(repository), {
      labels: [
        { name: "bug", color: "d73a4a" },
        { name: "documentation", color: "0075ca" },
      ],
    });
    queryClient.setQueryData<GitHubIssueMilestonePage>(
      githubQueryKeys.issueMilestones(repository),
      {
        milestones: [
          {
            number: 3,
            title: "Harbor 1.0",
            state: "open",
            openIssues: 4,
            closedIssues: 7,
          },
        ],
      }
    );

    syncRepositoryIssueLabel(
      queryClient,
      {
        ...repository,
        mutation: {
          action: "update",
          originalName: "bug",
          name: "needs-triage",
          color: "a1b2c3",
          description: "Sort reports",
        },
      },
      {
        name: "needs-triage",
        color: "a1b2c3",
        description: "Sort reports",
      }
    );
    syncRepositoryIssueMilestone(
      queryClient,
      {
        ...repository,
        mutation: { action: "delete", number: 3, confirmation: "Harbor 1.0" },
      },
      null
    );

    expect(
      queryClient
        .getQueryData<GitHubIssueLabelPage>(githubQueryKeys.issueLabels(repository))
        ?.labels.map((label) => label.name)
    ).toEqual(["documentation", "needs-triage"]);
    expect(
      queryClient.getQueryData<GitHubIssueMilestonePage>(
        githubQueryKeys.issueMilestones(repository)
      )?.milestones
    ).toEqual([]);
  });

  it("invalidates every issue and pull request consumer", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateRepositoryIssueTaxonomy(queryClient, repository);

    for (const queryKey of [
      githubQueryKeys.issueLabels(repository),
      githubQueryKeys.issueMilestones(repository),
      githubQueryKeys.issuesRoot(repository),
      githubQueryKeys.pullRequestsRoot(repository),
      githubQueryKeys.issueInboxRoot,
      githubQueryKeys.pullRequestInboxRoot,
      githubQueryKeys.projectsRoot,
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });
});
