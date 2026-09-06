import type * as Data from "@/features/github/github-data";
import { moreFixture } from "./more-fixtures";

const changedAt = "2026-09-01T10:05:00Z";
const firstVersion = "d291348a9f51a76fcbb3ad0e1c81a440378f280b";
const page = { page: 1, hasPrevious: false, hasMore: false };

export function createGistFixtures(scenario: string | null, acceptWrites: boolean) {
  const initial = structuredClone(
    (moreFixture("github_list_gists", {}, [], false) as Data.GitHubGistPage).gists
  ).map((gist) => ({
    ...gist,
    ...(scenario === "external" || scenario === "readonly-comments"
      ? { owner: "harbor-community", viewerOwns: false }
      : {}),
    ...(scenario === "comments-disabled" ? { commentsEnabled: false } : {}),
    ...(scenario === "long" ? { description: `${gist.description}. `.repeat(8) } : {}),
    files: gist.files.map((file) => ({
      ...file,
      ...(scenario === "truncated" ? { truncated: true, content: undefined } : {}),
    })),
  }));
  const gists = new Map(initial.map((gist) => [gist.id, gist]));
  const comments = new Map<string, Data.GitHubGistComment[]>();
  const revisions = new Map<string, Data.GitHubGistRevisionDetail[]>();
  let nextId = 100;
  let nextComment = 100;
  let nextVersion = 1;

  function file(filename: string, content: string): Data.GitHubGistFile {
    return {
      filename,
      content,
      size: new TextEncoder().encode(content).length,
      truncated: false,
      language: filename.endsWith(".md")
        ? "Markdown"
        : filename.endsWith(".ts")
          ? "TypeScript"
          : undefined,
    };
  }

  function remember(
    gist: Data.GitHubGist,
    version = (++nextVersion).toString(16).padStart(40, "0")
  ) {
    gist.files = gist.files.map((item) => ({
      ...item,
      rawUrl: `https://gist.githubusercontent.com/${gist.owner}/${gist.id}/raw/${version}/${encodeURIComponent(item.filename)}`,
    }));
    revisions.set(gist.id, [
      {
        gistId: gist.id,
        version,
        description: gist.description,
        createdAt: gist.createdAt,
        updatedAt: gist.updatedAt,
        files: structuredClone(gist.files),
      },
      ...(revisions.get(gist.id) ?? []),
    ]);
  }

  for (const gist of initial) {
    if (scenario === "files" || scenario === "long")
      gist.files.push(
        file(
          "reading-notes.md",
          "# Workspace notes\n\nKeep file changes and comments together.\n".repeat(
            scenario === "long" ? 30 : 1
          )
        )
      );
    gist.url = `https://gist.github.com/${gist.owner}/${gist.id}`;
    const seeded = (
      moreFixture(
        "github_list_gist_comments",
        { gistId: gist.id },
        [],
        false
      ) as Data.GitHubGistCommentPage
    ).comments;
    comments.set(
      gist.id,
      structuredClone(seeded).map((comment) => ({
        ...comment,
        author: scenario === "readonly-comments" ? "alex-morgan" : "harbor-preview",
        ...(scenario === "readonly-comments"
          ? { viewerCanUpdate: false, viewerCanDelete: false }
          : {}),
        ...(scenario === "long" ? { body: `${comment.body}\n\n`.repeat(12) } : {}),
      }))
    );
    remember(gist, firstVersion);
  }

  const fail = (message: string): never => {
    throw { code: "preview", message };
  };
  const ownerOnly = (gist: Data.GitHubGist) => {
    if (!gist.viewerOwns) fail("This preview Gist belongs to another account.");
  };
  const validateFiles = (files: Data.GitHubGistFile[]) => {
    const names = files.map((item) => item.filename.trim());
    if (
      !files.length ||
      files.length > 100 ||
      names.some((name) => !name) ||
      new Set(names).size !== names.length
    )
      fail("Keep one to 100 files with distinct names.");
  };

  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (!scenario) return undefined;
    if (command === "github_list_gists")
      return structuredClone({
        ...page,
        gists: empty
          ? []
          : [...gists.values()].filter((gist) =>
              args.source === "starred"
                ? gist.starred
                : args.source === "public"
                  ? gist.public
                  : gist.viewerOwns
            ),
      });

    const reads = [
      "github_get_gist",
      "github_list_gist_comments",
      "github_list_gist_revisions",
      "github_get_gist_revision",
    ];
    const writes = [
      "github_create_gist",
      "github_update_gist",
      "github_delete_gist",
      "github_update_gist_star",
      "github_fork_gist",
      "github_mutate_gist_comment",
    ];
    if (!reads.includes(command) && (!acceptWrites || !writes.includes(command))) return undefined;

    if (command === "github_create_gist") {
      const input = args.input as Data.GitHubGistCreateInput;
      const files = input.files.map((item) => file(item.filename.trim(), item.content));
      validateFiles(files);
      const id = `preview-gist-${++nextId}`;
      const created: Data.GitHubGist = {
        id,
        url: `https://gist.github.com/harbor-preview/${id}`,
        owner: "harbor-preview",
        description: input.description,
        public: input.public,
        files,
        viewerOwns: true,
        starred: false,
        comments: 0,
        commentsEnabled: true,
        createdAt: changedAt,
        updatedAt: changedAt,
      };
      gists.set(id, created);
      comments.set(id, []);
      remember(created);
      return structuredClone(created);
    }

    const gist = gists.get(String(args.gistId));
    if (!gist) return fail("This Gist no longer exists in the preview.");
    if (command === "github_get_gist") return structuredClone(gist);
    if (command === "github_list_gist_comments")
      return structuredClone({ ...page, comments: empty ? [] : (comments.get(gist.id) ?? []) });
    if (command === "github_list_gist_revisions")
      return {
        ...page,
        revisions: empty
          ? []
          : (revisions.get(gist.id) ?? []).map((revision) => ({
              version: revision.version,
              author: gist.owner,
              committedAt: revision.updatedAt,
              additions: 3,
              deletions: 1,
              total: 4,
            })),
      } satisfies Data.GitHubGistRevisionPage;
    if (command === "github_get_gist_revision") {
      const revision = revisions.get(gist.id)?.find((item) => item.version === args.version);
      return revision ? structuredClone(revision) : fail("This preview revision does not exist.");
    }
    if (command === "github_update_gist_star") {
      gist.starred = Boolean(args.starred);
      return structuredClone(gist);
    }
    if (command === "github_fork_gist") {
      if (gist.viewerOwns) return fail("Select another account's Gist to fork it.");
      const id = `preview-gist-${++nextId}`;
      const fork: Data.GitHubGist = {
        ...structuredClone(gist),
        id,
        owner: "harbor-preview",
        viewerOwns: true,
        url: `https://gist.github.com/harbor-preview/${id}`,
        comments: 0,
        starred: false,
        createdAt: changedAt,
        updatedAt: changedAt,
        forkOf: { id: gist.id, owner: gist.owner, url: gist.url },
      };
      gists.set(id, fork);
      comments.set(id, []);
      remember(fork);
      return structuredClone(fork);
    }
    if (command === "github_delete_gist") {
      ownerOnly(gist);
      if (String(args.confirmation).trim().toLowerCase() !== gist.id.toLowerCase())
        return fail("Enter this Gist's ID to delete it.");
      gists.delete(gist.id);
      comments.delete(gist.id);
      revisions.delete(gist.id);
      return null;
    }
    if (command === "github_update_gist") {
      ownerOnly(gist);
      if (gist.files.some((item) => item.truncated || item.content === undefined))
        return fail("The full file is unavailable for editing.");
      const input = args.input as Data.GitHubGistUpdateInput;
      const replacements = new Map(
        input.files
          .filter((item) => item.originalFilename)
          .map((item) => [item.originalFilename!, item])
      );
      if (
        [...replacements.keys()].some((name) => !gist.files.some((item) => item.filename === name))
      )
        return fail("The original file is missing.");
      const files = gist.files.flatMap((current) => {
        const change = replacements.get(current.filename);
        return !change
          ? [current]
          : change.deleted
            ? []
            : [file(change.filename.trim(), change.content ?? current.content ?? "")];
      });
      files.push(
        ...input.files
          .filter((item) => !item.originalFilename && !item.deleted)
          .map((item) => file(item.filename.trim(), item.content ?? ""))
      );
      validateFiles(files);
      Object.assign(gist, { description: input.description, files, updatedAt: changedAt });
      remember(gist);
      return structuredClone(gist);
    }
    const mutation = args.mutation as Data.GitHubGistCommentMutation;
    const current = comments.get(gist.id) ?? [];
    if (mutation.action === "create") {
      if (!gist.commentsEnabled || !mutation.body.trim())
        return fail("A nonempty comment and enabled comments are required.");
      const comment: Data.GitHubGistComment = {
        id: ++nextComment,
        body: mutation.body,
        author: "harbor-preview",
        createdAt: changedAt,
        updatedAt: changedAt,
        viewerCanUpdate: true,
        viewerCanDelete: true,
      };
      comments.set(gist.id, [...current, comment]);
      gist.comments += 1;
      return structuredClone(comment);
    }
    const comment = current.find((item) => item.id === mutation.commentId);
    if (!comment) return fail("This preview comment no longer exists.");
    if (mutation.action === "delete") {
      if (!comment.viewerCanDelete) return fail("This preview comment cannot be deleted.");
      comments.set(
        gist.id,
        current.filter((item) => item.id !== comment.id)
      );
      gist.comments = Math.max(0, gist.comments - 1);
      return null;
    }
    if (!comment.viewerCanUpdate || !mutation.body.trim())
      return fail("This preview comment cannot be updated.");
    Object.assign(comment, { body: mutation.body, updatedAt: changedAt });
    return structuredClone(comment);
  };
}
