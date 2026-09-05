import type * as Data from "@/features/github/github-data";

const sha = "d291348a9f51a76fcbb3ad0e1c81a440378f280b";
const timestamp = "2026-09-01T10:00:00Z";
const page = { page: 1, hasPrevious: false, hasMore: false };
const actor: Data.GitHubCommitActor = {
  name: "Alex Morgan",
  email: "alex@example.com",
  login: "alex-morgan",
  avatarUrl: null,
  date: timestamp,
};
const commit: Data.GitHubCommitDetail = {
  sha,
  shortSha: sha.slice(0, 7),
  message:
    "Unify workspace surfaces\n\nKeep keyboard focus, readable source and review context together across compact and wide windows.",
  url: `https://github.com/harbor-preview/harbor/commit/${sha}`,
  author: actor,
  committer: actor,
  parents: [
    {
      sha: "a".repeat(40),
      shortSha: "aaaaaaa",
      url: "https://github.com/harbor-preview/harbor/commit/aaaaaaa",
    },
  ],
  stats: { additions: 3, deletions: 1, total: 4 },
  verification: { verified: true, reason: "valid", verifiedAt: timestamp },
};
const file: Data.GitHubChangedFile = {
  sha,
  path: "workspace.ts",
  status: "modified",
  additions: 3,
  deletions: 1,
  changes: 4,
  patch:
    '@@ -1,3 +1,5 @@\n export function workspaceTitle(name: string) {\n-  return name;\n+  const title = name.trim();\n+  if (!title) return "Harbor";\n+  return title;\n }',
  blobUrl: `https://github.com/harbor-preview/harbor/blob/${sha}/workspace.ts`,
};
const comments: Data.GitHubCommitComment[] = [
  "The compact workspace preserves enough context to review this change.",
  "The fallback makes an empty title readable.",
  "This older line is no longer in the displayed diff.",
].map((body, index) => ({
  id: `CC_preview_${index + 1}`,
  databaseId: index + 1,
  commitSha: sha,
  body,
  path: index ? "workspace.ts" : null,
  position: index === 1 ? 4 : index === 2 ? 99 : null,
  line: index ? 3 : null,
  author: { login: "lin-chen", avatarUrl: null },
  authorAssociation: "CONTRIBUTOR",
  url: `${commit.url}#commitcomment-${index + 1}`,
  createdAt: timestamp,
  updatedAt: timestamp,
  viewerCanUpdate: true,
  viewerCanDelete: true,
  isMinimized: index === 2,
  minimizedReason: index === 2 ? "outdated" : null,
  viewerCanMinimize: true,
  viewerCanUnminimize: true,
}));

export function codeFixture(
  command: string,
  args: Record<string, unknown>,
  empty: boolean
): unknown {
  if (command === "github_get_repository_commit")
    return {
      ...page,
      commit: {
        ...commit,
        stats: empty ? { additions: 0, deletions: 0, total: 0 } : commit.stats,
        sha: String(args.commitSha ?? sha),
        shortSha: String(args.commitSha ?? sha).slice(0, 7),
      },
      files: empty ? [] : [file],
      filesAtLimit: false,
    } satisfies Data.GitHubCommitDetailPage;
  if (command === "github_list_repository_commit_comments")
    return {
      ...page,
      comments: empty
        ? []
        : comments.map((comment) => ({ ...comment, commitSha: String(args.commitSha ?? sha) })),
    } satisfies Data.GitHubCommitCommentPage;
  if (command === "github_list_repository_tags")
    return {
      ...page,
      tags: empty
        ? []
        : ["v1.4.0", "v1.3.2", "v1.3.1"].map((name) => ({
            name,
            sha,
            zipballUrl: `https://github.com/harbor-preview/harbor/archive/refs/tags/${name}.zip`,
            tarballUrl: `https://github.com/harbor-preview/harbor/archive/refs/tags/${name}.tar.gz`,
          })),
    } satisfies Data.GitHubTagPage;
  if (command === "github_get_repository_blame")
    return {
      ranges: empty
        ? []
        : [
            {
              startingLine: 1,
              endingLine: 3,
              age: 1,
              commit: {
                sha,
                shortSha: sha.slice(0, 7),
                title: "Unify workspace surfaces",
                message: commit.message,
                author: "Alex Morgan",
                authorLogin: "alex-morgan",
                authorAvatarUrl: null,
                committedAt: timestamp,
                verified: true,
                url: commit.url,
              },
            },
          ],
    } satisfies Data.GitHubBlame;
  if (command === "github_search_repository_code")
    return {
      ...page,
      results: empty
        ? []
        : [
            {
              name: "workspace.ts",
              path: "workspace.ts",
              sha,
              url: file.blobUrl!,
              fragment:
                'export function workspaceTitle(name: string) {\n  return name.trim() || "Harbor";\n}',
            },
          ],
      totalCount: empty ? 0 : 1,
      incompleteResults: false,
    } satisfies Data.GitHubCodeSearchPage;
  return undefined;
}
