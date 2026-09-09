import { describe, expect, it } from "vitest";
import type * as Data from "@/features/github/github-data";
import { issueStateMutationInput } from "@/features/github/github-issue-mutations";
import { createIssueActionFixtures } from "./issue-action-fixtures";

const repository = {
  id: 1,
  owner: "harbor-preview",
  name: "harbor",
  fullName: "harbor-preview/harbor",
  url: "https://github.com/harbor-preview/harbor",
  defaultBranch: "main",
} as Data.GitHubRepository;
const target = { owner: repository.owner, repository: repository.name, issueNumber: 1 };
const fixture = (accept = true, scenario = "standard") =>
  createIssueActionFixtures([repository], scenario, accept);
const read = (handler: ReturnType<typeof fixture>) =>
  handler("github_get_repository_issue", target, false) as Data.GitHubIssueDetailPage;

describe("Issue action preview isolation and reconciliation", () => {
  it("requires write opt-in and exact repository identity", () => {
    const handler = fixture(false);
    expect(handler("github_delete_repository_issue", { input: target }, false)).toBeUndefined();
    expect(
      handler("github_get_repository_issue", { ...target, owner: "other" }, false)
    ).toBeUndefined();
    expect(handler("github_unknown_issue_write", target, false)).toBeUndefined();
  });
  it("reconciles lifecycle reads and rejects obsolete state writes", () => {
    const handler = fixture();
    const before = read(handler);
    const mutation = issueStateMutationInput(before.issue, {
      desiredState: "closed",
      closeReason: "notPlanned",
    });
    handler("github_update_repository_issue_state", { ...target, mutation }, false);
    expect(read(handler).issue.state).toBe("closed");
    expect(before.issue.state).toBe("open");
    expect(handler("github_get_repository_issue_state_capabilities", target, false)).toMatchObject({
      viewerCanClose: false,
      viewerCanReopen: true,
      stateReason: "notPlanned",
    });
    expect(() =>
      handler("github_update_repository_issue_state", { ...target, mutation }, false)
    ).toThrow();
  });
  it("keeps comment snapshots independent and reconciles deletion", () => {
    const handler = fixture();
    const before = read(handler);
    handler(
      "github_mutate_repository_issue_comment",
      {
        ...target,
        mutation: {
          action: "update",
          commentId: "101",
          expectedUpdatedAt: before.timeline[0].updatedAt,
          body: "Edited preview",
        },
      },
      false
    );
    expect(read(handler).timeline[0].body).toBe("Edited preview");
    expect(before.timeline[0].body).not.toBe("Edited preview");
    handler(
      "github_delete_repository_issue",
      { input: { ...target, expectedIssueNodeId: before.issue.reactionSubject.id } },
      false
    );
    expect(() => read(handler)).toThrow();
    const page = handler("github_list_issue_inbox", {}, false) as Data.GitHubIssueInboxPage;
    expect(page.issues.some((entry) => entry.issue.number === 1)).toBe(false);
  });
  it("reconciles clones and duplicate state without modifying the source snapshot", () => {
    const handler = fixture();
    const before = read(handler);
    const clone = handler(
      "github_clone_repository_issue",
      {
        ...target,
        expectedIssueNodeId: before.issue.reactionSubject.id,
        title: "Cloned preview",
        body: "New body",
      },
      false
    ) as Data.GitHubIssueClone;
    const cloned = handler(
      "github_get_repository_issue",
      { ...target, issueNumber: clone.targetIssueNumber },
      false
    ) as Data.GitHubIssueDetailPage;
    expect(cloned.issue.title).toBe("Cloned preview");
    expect(cloned.timeline).toEqual([]);
    expect(cloned.issue.comments).toBe(0);
    expect(before.issue.title).not.toBe("Cloned preview");
    handler(
      "github_mark_repository_issue_duplicate",
      {
        input: {
          ...target,
          expectedIssueNodeId: before.issue.reactionSubject.id,
          canonicalOwner: target.owner,
          canonicalRepository: target.repository,
          canonicalIssueNumber: 2,
        },
      },
      false
    );
    expect(read(handler).issue.stateReason).toBe("duplicate");
    expect(handler("github_get_repository_issue_duplicate", target, false)).toMatchObject({
      issueNumber: 2,
    });
    handler(
      "github_unmark_repository_issue_duplicate",
      { ...target, expectedIssueNodeId: before.issue.reactionSubject.id },
      false
    );
    expect(handler("github_get_repository_issue_duplicate", target, false)).toBeNull();
  });

  it("rejects writes after a read-only scenario and isolates reinstall", () => {
    const handler = fixture(true, "readonly");
    expect(() =>
      handler("github_create_repository_issue_comment", { ...target, body: "No" }, false)
    ).toThrow();
    expect(read(fixture()).timeline[0].viewerCanUpdate).toBe(true);
  });
});
