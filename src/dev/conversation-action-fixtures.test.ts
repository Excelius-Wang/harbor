import { describe, expect, it } from "vitest";
import type * as Data from "@/features/github/github-data";
import { createConversationActionFixtures } from "./conversation-action-fixtures";
import { repositoryFixture } from "./repository-fixtures";
import { workspaceFixture } from "./workspace-fixtures";

const repository: Data.GitHubRepository = {
  id: 1,
  owner: "harbor-preview",
  name: "harbor",
  fullName: "harbor-preview/harbor",
  url: "https://github.com/harbor-preview/harbor",
  stars: 2,
  forks: 1,
  openIssues: 1,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};
const target = { owner: repository.owner, repository: repository.name };
const subject: Data.GitHubReactionSubjectRef = { kind: "issue", id: "I_preview_1" };
const pinInput = { ...target, issueNumber: 1, expectedIssueNodeId: subject.id, action: "pin" };

it("distinguishes an upstream repository from a same-name fork in shared reads", () => {
  const fork = {
    ...repository,
    id: 2,
    owner: "another-viewer",
    fullName: "another-viewer/harbor",
    url: "https://github.com/another-viewer/harbor",
    isFork: true,
  };
  const repositories = [fork, repository];
  const detail = workspaceFixture(
    "github_get_repository_issue",
    { ...target, issueNumber: 1 },
    repositories,
    false
  ) as Data.GitHubIssueDetailPage;
  expect(detail.issue.url).toBe(`${repository.url}/issues/1`);
  const wiki = repositoryFixture(
    "github_get_repository_wiki",
    target,
    repositories,
    false
  ) as Data.GitHubWikiOverview;
  expect(wiki.repositoryId).toBe(repository.id);
});

function fixture(overrides: Partial<Parameters<typeof createConversationActionFixtures>[1]> = {}) {
  return createConversationActionFixtures(
    [repository, { ...repository, id: 2, name: "other", fullName: "harbor-preview/other" }],
    {
      conversation: "standard",
      reactions: "standard",
      pins: "standard",
      acceptWrites: true,
      pullRequest: null,
      ...overrides,
    }
  );
}

it("keeps Issue/PR lock and subscription state separate and reconciles detail reads", () => {
  const read = fixture();
  const issue = { ...target, conversationKind: "issue", conversationNumber: 1 };
  const pull = { ...issue, conversationKind: "pullRequest" };
  const before = read(
    "github_get_repository_conversation_controls",
    pull,
    false
  ) as Data.GitHubConversationControls;
  read(
    "github_update_repository_conversation_lock",
    { ...pull, action: "lock", reason: "spam" },
    false
  );
  read(
    "github_update_repository_conversation_subscription",
    { ...pull, action: "unsubscribe" },
    false
  );
  expect(read("github_get_repository_conversation_controls", pull, false)).toMatchObject({
    kind: "pullRequest",
    number: 1,
    locked: true,
    lockReason: "spam",
    viewerSubscription: "unsubscribed",
  });
  expect(read("github_get_repository_conversation_controls", issue, false)).toMatchObject({
    kind: "issue",
    locked: false,
    viewerSubscription: "subscribed",
  });
  expect(
    (
      read(
        "github_get_repository_pull_request",
        { ...target, pullRequestNumber: 1 },
        false
      ) as Data.GitHubPullRequestDetailPage
    ).pullRequest.locked
  ).toBe(true);
  expect(before.locked).toBe(false);
  read("github_update_repository_conversation_lock", { ...pull, action: "unlock" }, false);
  expect(read("github_get_repository_conversation_controls", pull, false)).toMatchObject({
    locked: false,
    lockReason: null,
  });
});

it("allows only owned reaction removal in a read-only subject without changing earlier DTOs", () => {
  const read = fixture({ reactions: "readonly" });
  const args = { ...target, subjects: [subject] };
  const before = read(
    "github_get_repository_reactions",
    args,
    false
  ) as Data.GitHubReactionSubject[];
  expect(() =>
    read(
      "github_update_repository_reaction",
      { ...target, subject, content: "thumbsUp", reacted: true },
      false
    )
  ).toThrowError();
  read(
    "github_update_repository_reaction",
    { ...target, subject, content: "heart", reacted: false },
    false
  );
  const after = read(
    "github_get_repository_reactions",
    args,
    false
  ) as Data.GitHubReactionSubject[];
  expect(after[0].groups).toEqual([{ content: "thumbsUp", count: 2, viewerHasReacted: false }]);
  expect(before[0].groups).toHaveLength(2);
  expect(
    (
      read(
        "github_get_repository_reactions",
        { ...args, repository: "other" },
        false
      ) as Data.GitHubReactionSubject[]
    )[0].groups
  ).toHaveLength(2);
});

it("reconciles reactions from an empty list and preserves Release reaction restrictions", () => {
  const read = fixture({ reactions: "empty" });
  const release = { kind: "release", id: "release_1" } as const;
  expect(
    (
      read(
        "github_get_repository_reactions",
        { ...target, subjects: [release] },
        false
      ) as Data.GitHubReactionSubject[]
    )[0].groups
  ).toEqual([]);
  read(
    "github_update_repository_reaction",
    { ...target, subject: release, content: "rocket", reacted: true },
    false
  );
  expect(
    read(
      "github_update_repository_reaction",
      { ...target, subject: release, content: "thumbsDown", reacted: true },
      false
    )
  ).toBeUndefined();
  expect(
    (
      read(
        "github_get_repository_reactions",
        { ...target, subjects: [release] },
        false
      ) as Data.GitHubReactionSubject[]
    )[0].groups
  ).toEqual([{ content: "rocket", count: 1, viewerHasReacted: true }]);
});

it("reconciles pinned Issues without mutating earlier pages", () => {
  const read = fixture();
  const before = read(
    "github_get_repository_pinned_issues",
    target,
    false
  ) as Data.GitHubPinnedIssuePage;
  const after = read(
    "github_update_repository_issue_pin",
    { input: pinInput },
    false
  ) as Data.GitHubPinnedIssuePage;
  expect(after.issues.map((item) => item.number)).toEqual([2, 3, 1]);
  expect(before.issues.map((item) => item.number)).toEqual([2, 3]);
  expect(read("github_get_repository_pinned_issues", target, false)).toEqual(after);
  read("github_update_repository_issue_pin", { input: { ...pinInput, action: "unpin" } }, false);
  expect(read("github_get_repository_pinned_issues", target, false)).toEqual(before);
});

describe("controlled pin guards", () => {
  it.each(["readonly", "limit", "identity-mismatch", "repository-mismatch"])(
    "rejects %s writes",
    (pins) => {
      const read = fixture({ pins });
      expect(() =>
        read("github_update_repository_issue_pin", { input: pinInput }, false)
      ).toThrowError();
    }
  );
});

it("requires explicit opt-in for every supported write domain", () => {
  const read = fixture({ acceptWrites: false });
  for (const [command, args] of [
    [
      "github_update_repository_conversation_lock",
      { ...target, conversationKind: "issue", conversationNumber: 1, action: "lock" },
    ],
    [
      "github_update_repository_conversation_subscription",
      { ...target, conversationKind: "issue", conversationNumber: 1, action: "unsubscribe" },
    ],
    ["github_update_repository_reaction", { ...target, subject, content: "heart", reacted: false }],
    ["github_update_repository_issue_pin", { input: pinInput }],
  ] as const)
    expect(read(command, args, false)).toBeUndefined();
});
