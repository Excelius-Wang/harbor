import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateRepositoryIssueType } from "./github-issue-type-mutations";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("GitHub Issue type mutations", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("sends the authoritative Issue and nullable type identities", () => {
    vi.mocked(invoke).mockResolvedValue({} as never);
    const target = { owner: "octocat", repository: "hello-world", issueNumber: 7 };

    void updateRepositoryIssueType(target, "I_7", "IT_bug", null);

    expect(invoke).toHaveBeenCalledWith("github_update_repository_issue_type", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      expectedIssueTypeNodeId: "IT_bug",
      issueTypeNodeId: null,
    });
  });
});
