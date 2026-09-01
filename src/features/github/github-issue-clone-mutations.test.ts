import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneRepositoryIssue } from "./github-issue-clone-mutations";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("GitHub Issue clone mutation", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("sends the source identity and edited content without UI-only fields", async () => {
    vi.mocked(invoke).mockResolvedValue({});

    await cloneRepositoryIssue(
      { owner: "octocat", repository: "hello-world", issueNumber: 7 },
      {
        expectedIssueNodeId: "I_7",
        title: "Cloned Issue",
        body: "Cloned body",
      }
    );

    expect(invoke).toHaveBeenCalledWith("github_clone_repository_issue", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      title: "Cloned Issue",
      body: "Cloned body",
    });
  });
});
