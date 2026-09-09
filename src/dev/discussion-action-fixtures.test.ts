import { describe, expect, it } from "vitest";
import type {
  GitHubDiscussionComment,
  GitHubDiscussionDetailPage,
  GitHubRepository,
} from "@/features/github/github-data";
import { createDiscussionActionFixtures } from "./discussion-action-fixtures";
const repositories = [
  {
    owner: "preview",
    name: "harbor",
    fullName: "preview/harbor",
    url: "https://github.com/preview/harbor",
  },
] as GitHubRepository[];
const target = { owner: "preview", repository: "harbor", discussionNumber: 1 };
describe("discussion preview isolation", () => {
  it("requires both scenario and write authorization", () => {
    expect(
      createDiscussionActionFixtures(
        repositories,
        null,
        true
      )("github_get_repository_discussion", target)
    ).toBeUndefined();
    const fixture = createDiscussionActionFixtures(repositories, "nested", false);
    expect(
      fixture("github_create_repository_discussion_comment", { ...target, body: "unsafe" })
    ).toBeUndefined();
  });
  it("retains replies through parent deletion and returns isolated snapshots", () => {
    const fixture = createDiscussionActionFixtures(repositories, "nested", true);
    const read = () =>
      fixture("github_get_repository_discussion", target) as GitHubDiscussionDetailPage;
    const first = read();
    const parentId = first.comments[0].id;
    first.comments[0].body = "outside mutation";
    expect(read().comments[0].body).not.toBe("outside mutation");
    const reply = fixture("github_create_repository_discussion_comment", {
      ...target,
      replyToId: parentId,
      body: "new nested reply",
    }) as GitHubDiscussionComment;
    const replies = read().comments[0].replies;
    expect(replies[replies.length - 1]?.id).toBe(reply.id);
    expect(read().commentCount).toBe(2);
    const result = fixture("github_delete_repository_discussion_comment", {
      ...target,
      commentId: parentId,
    });
    expect(result).toMatchObject({ preserved: true, commentId: parentId });
    expect(read().comments[0]).toMatchObject({ body: "", deletedAt: expect.any(String) });
    expect(read().comments[0].replies).toHaveLength(3);
    expect(read().commentCount).toBe(2);
  });
  it("rejects a comment ID from a different discussion", () => {
    const fixture = createDiscussionActionFixtures(repositories, "nested", true);
    const first = fixture("github_get_repository_discussion", target) as GitHubDiscussionDetailPage;
    expect(() =>
      fixture("github_delete_repository_discussion_comment", {
        ...target,
        discussionNumber: 2,
        commentId: first.comments[0].id,
      })
    ).toThrow("Unknown preview comment target");
  });
  it("reconciles edits and leaf deletion without losing sibling replies", () => {
    const fixture = createDiscussionActionFixtures(repositories, "nested", true);
    const read = () =>
      fixture("github_get_repository_discussion", target) as GitHubDiscussionDetailPage;
    const reply = read().comments[0].replies[0];
    fixture("github_update_repository_discussion_comment", { commentId: reply.id, body: "saved" });
    expect(read().comments[0].replies[0].body).toBe("saved");
    expect(
      fixture("github_delete_repository_discussion_comment", { ...target, commentId: reply.id })
    ).toMatchObject({ preserved: false, replyToId: read().comments[0].id });
    expect(read().comments[0].replies).toHaveLength(1);
    expect(read().commentCount).toBe(2);
  });
});
