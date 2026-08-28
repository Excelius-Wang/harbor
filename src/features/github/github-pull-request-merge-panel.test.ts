import { describe, expect, it } from "vitest";
import type { GitHubPullRequest } from "./github-data";
import { getDefaultAutoMergeMethod } from "./github-pull-request-auto-merge";
import { getMergeQueueWaitEstimate } from "./github-pull-request-merge-queue";
import {
  getDefaultPullRequestMergeCommitTitle,
  getPullRequestMergePanelStatus,
} from "./github-pull-request-merge-panel";

const pullRequest: GitHubPullRequest = {
  id: 3,
  number: 12,
  title: "Ship the PR workspace",
  url: "https://github.com/octocat/hello-world/pull/12",
  state: "open",
  draft: false,
  merged: false,
  mergeable: true,
  mergeableState: "clean",
  author: "octocat",
  assignees: [],
  requestedReviewers: [],
  requestedTeams: [],
  labels: [],
  locked: false,
  headRef: "feature/pr-workspace",
  headLabel: "octocat:feature/pr-workspace",
  headSha: "abc1234",
  baseRef: "main",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  commits: 1,
  comments: 0,
  reviewComments: 0,
};

describe("GitHub pull request merge panel state", () => {
  it("distinguishes authoritative terminal and pre-merge states", () => {
    expect(getPullRequestMergePanelStatus({ ...pullRequest, merged: true })).toBe("merged");
    expect(getPullRequestMergePanelStatus({ ...pullRequest, state: "closed" })).toBe("closed");
    expect(getPullRequestMergePanelStatus({ ...pullRequest, draft: true })).toBe("draft");
    expect(getPullRequestMergePanelStatus({ ...pullRequest, mergeable: false })).toBe("conflicts");
    expect(
      getPullRequestMergePanelStatus({ ...pullRequest, mergeable: true, mergeableState: "blocked" })
    ).toBe("blocked");
    expect(getPullRequestMergePanelStatus({ ...pullRequest, mergeable: null })).toBe("checking");
    expect(
      getPullRequestMergePanelStatus({ ...pullRequest, mergeable: true, mergeableState: "clean" })
    ).toBe("ready");
  });

  it("uses GitHub-style defaults only for editable merge commit methods", () => {
    expect(getDefaultPullRequestMergeCommitTitle(pullRequest, "merge")).toBe(
      "Merge pull request #12 from octocat:feature/pr-workspace"
    );
    expect(getDefaultPullRequestMergeCommitTitle(pullRequest, "squash")).toBe(
      "Ship the PR workspace (#12)"
    );
    expect(getDefaultPullRequestMergeCommitTitle(pullRequest, "rebase")).toBe("");
  });

  it("chooses an auto-merge method from the repository policy", () => {
    expect(getDefaultAutoMergeMethod(["squash", "rebase"])).toBe("squash");
    expect(getDefaultAutoMergeMethod(["squash", "merge"])).toBe("merge");
    expect(getDefaultAutoMergeMethod([])).toBeNull();
  });

  it("formats merge queue estimates into stable minute and hour units", () => {
    expect(getMergeQueueWaitEstimate(undefined)).toBeNull();
    expect(getMergeQueueWaitEstimate(0)).toEqual({ unit: "minute", value: 1 });
    expect(getMergeQueueWaitEstimate(420)).toEqual({ unit: "minute", value: 7 });
    expect(getMergeQueueWaitEstimate(3_601)).toEqual({ unit: "hour", value: 2 });
  });
});
