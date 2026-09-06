import { expect, it } from "vitest";
import type * as Data from "@/features/github/github-data";
import { createGistFixtures } from "./gist-fixtures";

const target = { gistId: "preview-gist-1" };

it("reconciles file rename/add/delete and description clearing while preserving earlier revisions", () => {
  const invoke = createGistFixtures("files", true);
  const before = invoke("github_get_gist", target, false) as Data.GitHubGist;
  const history = invoke(
    "github_list_gist_revisions",
    target,
    false
  ) as Data.GitHubGistRevisionPage;
  const updated = invoke(
    "github_update_gist",
    {
      ...target,
      input: {
        files: [
          {
            originalFilename: "workspace-1.ts",
            filename: "helper.ts",
            content: "export const ready = true;",
            deleted: false,
          },
          { originalFilename: "reading-notes.md", filename: "reading-notes.md", deleted: true },
          { filename: "new.md", content: "新笔记", deleted: false },
        ],
      },
    },
    false
  ) as Data.GitHubGist;
  expect(updated.description).toBeUndefined();
  expect(updated.files.map((file) => file.filename)).toEqual(["helper.ts", "new.md"]);
  expect(updated.files[1].size).toBe(9);
  expect(before.files[0].filename).toBe("workspace-1.ts");
  const revision = invoke(
    "github_get_gist_revision",
    { ...target, version: history.revisions[0].version },
    false
  ) as Data.GitHubGistRevisionDetail;
  expect(revision.files).toEqual(before.files);
  expect(
    (invoke("github_list_gist_revisions", target, false) as Data.GitHubGistRevisionPage).revisions
  ).toHaveLength(2);
  updated.files[0].content = "Mutated caller snapshot";
  expect((invoke("github_get_gist", target, false) as Data.GitHubGist).files[0].content).toBe(
    "export const ready = true;"
  );
  expect(() =>
    invoke(
      "github_update_gist",
      {
        ...target,
        input: {
          files: [
            { originalFilename: "helper.ts", filename: "helper.ts", deleted: true },
            { originalFilename: "new.md", filename: "new.md", deleted: true },
          ],
        },
      },
      false
    )
  ).toThrow();
  expect((invoke("github_get_gist", target, false) as Data.GitHubGist).files).toHaveLength(2);
});

it("reconciles comments and counts without changing other Gists or returned snapshots", () => {
  const invoke = createGistFixtures("files", true);
  const before = invoke("github_list_gist_comments", target, false) as Data.GitHubGistCommentPage;
  const created = invoke(
    "github_mutate_gist_comment",
    { ...target, mutation: { action: "create", body: "New comment" } },
    false
  ) as Data.GitHubGistComment;
  invoke(
    "github_mutate_gist_comment",
    { ...target, mutation: { action: "update", commentId: created.id, body: "Edited comment" } },
    false
  );
  expect(created.body).toBe("New comment");
  expect(before.comments).toHaveLength(1);
  expect(
    (invoke("github_list_gist_comments", target, false) as Data.GitHubGistCommentPage).comments[1]
      .body
  ).toBe("Edited comment");
  expect((invoke("github_get_gist", target, false) as Data.GitHubGist).comments).toBe(2);
  expect(
    (invoke("github_get_gist", { gistId: "preview-gist-2" }, false) as Data.GitHubGist).comments
  ).toBe(1);
  invoke(
    "github_mutate_gist_comment",
    { ...target, mutation: { action: "delete", commentId: created.id } },
    false
  );
  expect((invoke("github_get_gist", target, false) as Data.GitHubGist).comments).toBe(1);
});

it("reconciles source filters, Star, Fork, creation, and confirmed deletion", () => {
  const invoke = createGistFixtures("external", true);
  expect(
    (invoke("github_list_gists", { source: "mine" }, false) as Data.GitHubGistPage).gists
  ).toHaveLength(0);
  invoke("github_update_gist_star", { ...target, starred: true }, false);
  expect(
    (invoke("github_list_gists", { source: "starred" }, false) as Data.GitHubGistPage).gists.map(
      (gist) => gist.id
    )
  ).toContain(target.gistId);
  const fork = invoke("github_fork_gist", target, false) as Data.GitHubGist;
  expect(fork).toMatchObject({ viewerOwns: true, forkOf: { id: target.gistId }, comments: 0 });
  expect(fork.files[0].rawUrl).toContain(`/${fork.id}/raw/`);
  expect(
    (invoke("github_list_gists", { source: "mine" }, false) as Data.GitHubGistPage).gists.map(
      (gist) => gist.id
    )
  ).toEqual([fork.id]);
  const created = invoke(
    "github_create_gist",
    { input: { public: false, files: [{ filename: "new.md", content: "Secret notes" }] } },
    false
  ) as Data.GitHubGist;
  expect(
    (invoke("github_list_gists", { source: "public" }, false) as Data.GitHubGistPage).gists.some(
      (gist) => gist.id === created.id
    )
  ).toBe(false);
  expect(() =>
    invoke("github_delete_gist", { gistId: created.id, confirmation: "wrong" }, false)
  ).toThrow();
  invoke("github_delete_gist", { gistId: created.id, confirmation: created.id }, false);
  expect(() => invoke("github_get_gist", { gistId: created.id }, false)).toThrow();
  expect(() =>
    invoke("github_delete_gist", { ...target, confirmation: target.gistId }, false)
  ).toThrow();
});

it("requires opt-in and enforces incomplete-file and comment permissions", () => {
  expect(createGistFixtures("files", false)("github_delete_gist", target, false)).toBeUndefined();
  expect(createGistFixtures(null, true)("github_delete_gist", target, false)).toBeUndefined();
  expect(
    createGistFixtures("files", true)("github_unknown_gist_write", target, false)
  ).toBeUndefined();
  expect(() =>
    createGistFixtures("truncated", true)(
      "github_update_gist",
      { ...target, input: { files: [] } },
      false
    )
  ).toThrow();
  expect(() =>
    createGistFixtures("comments-disabled", true)(
      "github_mutate_gist_comment",
      { ...target, mutation: { action: "create", body: "Comment" } },
      false
    )
  ).toThrow();
  const readonly = createGistFixtures("readonly-comments", true);
  expect(() =>
    readonly(
      "github_mutate_gist_comment",
      { ...target, mutation: { action: "delete", commentId: 1 } },
      false
    )
  ).toThrow();
  expect(() =>
    readonly(
      "github_mutate_gist_comment",
      { ...target, mutation: { action: "update", commentId: 1, body: "Edited" } },
      false
    )
  ).toThrow();
  const fresh = createGistFixtures("files", true);
  expect((fresh("github_get_gist", target, false) as Data.GitHubGist).starred).toBe(false);
  expect((fresh("github_list_gists", {}, true) as Data.GitHubGistPage).gists).toEqual([]);
});
