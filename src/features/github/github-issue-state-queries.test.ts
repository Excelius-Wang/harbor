import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue, GitHubIssueStateCapabilities } from "./github-data";
import {
  issueStateCapabilitiesMatchIssue,
  issueStateCapabilitiesQueryOptions,
} from "./github-issue-state-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const target = { owner: "octocat", repository: "hello-world", issueNumber: 7 };
const issue: GitHubIssue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Keep the example focused",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "closed",
  stateReason: "notPlanned",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 1,
  createdAt: "2026-08-25T08:00:00Z",
  updatedAt: "2026-08-30T08:01:00+00:00",
};
const capabilities: GitHubIssueStateCapabilities = {
  repositoryId: "R_1",
  repositoryFullName: "Octocat/Hello-World",
  issueNodeId: "I_7",
  number: 7,
  state: "closed",
  stateReason: "not_planned",
  updatedAt: "2026-08-30T08:01:00Z",
  viewerCanClose: false,
  viewerCanReopen: true,
};

beforeEach(() => vi.clearAllMocks());

describe("GitHub Issue state capabilities", () => {
  it("uses a repository-scoped Tauri read", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(capabilities);
    const options = issueStateCapabilitiesQueryOptions(target, issue.updatedAt);

    await options.queryFn?.({} as never);

    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_state_capabilities", target);
  });

  it("reconciles identity, state, reason, and timestamp with the REST Issue", () => {
    expect(issueStateCapabilitiesMatchIssue(capabilities, issue, target)).toBe(true);
    expect(
      issueStateCapabilitiesMatchIssue({ ...capabilities, issueNodeId: "I_8" }, issue, target)
    ).toBe(false);
    expect(
      issueStateCapabilitiesMatchIssue({ ...capabilities, viewerCanReopen: false }, issue, target)
    ).toBe(true);
    expect(
      issueStateCapabilitiesMatchIssue(
        { ...capabilities, updatedAt: "2026-08-30T08:02:00Z" },
        issue,
        target
      )
    ).toBe(false);
  });
});
