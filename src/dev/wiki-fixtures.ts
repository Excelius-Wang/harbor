import type * as Data from "@/features/github/github-data";
import { repositoryFixture } from "./repository-fixtures";

export function createWikiFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean
) {
  const currentSha = "d291348a9f51a76fcbb3ad0e1c81a440378f280b";
  const olderSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const deletedSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const restoredSha = "cccccccccccccccccccccccccccccccccccccccc";
  const previousContent =
    "# Workspace notes\n\nKeep navigation and review context together.\n\n- Open a repository.\n- Review the selected change.\n- Return to the same list.\n";
  let restored = false;
  const revisions: Data.GitHubWikiRevisionSummary[] = [
    {
      sha: currentSha,
      shortSha: currentSha.slice(0, 7),
      message: "Document navigation and review workflows across compact desktop windows",
      authorName: "Alex Morgan",
      authoredAt: 1788256800,
    },
    {
      sha: olderSha,
      shortSha: olderSha.slice(0, 7),
      message: "Keep repository notes and keyboard shortcuts together",
      authorName: "Lin Chen",
      authoredAt: 1788170400,
    },
    {
      sha: deletedSha,
      shortSha: deletedSha.slice(0, 7),
      message: "Remove the outdated page before reorganizing its contents",
      authorName: "Alex Morgan",
      authoredAt: 1788084000,
    },
  ];
  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (!scenario || !command.includes("wiki")) return undefined;
    const overview = repositoryFixture(
      "github_get_repository_wiki",
      args,
      repositories,
      false
    ) as Data.GitHubWikiOverview;
    const page = repositoryFixture(
      "github_get_repository_wiki_page",
      args,
      repositories,
      false
    ) as Data.GitHubWikiPage;
    const headSha = restored ? restoredSha : currentSha;
    const title =
      scenario === "long"
        ? "Workspace navigation, review context and keyboard shortcuts across compact desktop windows"
        : page.title;
    const nextOverview: Data.GitHubWikiOverview = {
      ...overview,
      pages: overview.pages.map((item) => (item.path === page.path ? { ...item, title } : item)),
      headSha,
      stale: scenario === "offline",
      archived: scenario === "archived",
      canEdit: scenario !== "readonly" && scenario !== "archived",
      enabled: scenario !== "disabled",
      initialized: scenario !== "uninitialized",
    };
    const nextPage: Data.GitHubWikiPage = {
      ...page,
      title,
      headSha,
      ...(restored ? { blobSha: restoredSha, content: previousContent } : {}),
    };
    if (command === "github_get_repository_wiki") return nextOverview;
    if (command === "github_get_repository_wiki_page") return nextPage;
    if (command === "github_list_repository_wiki_history")
      return {
        revisions: empty
          ? []
          : restored
            ? [
                {
                  ...revisions[1],
                  sha: restoredSha,
                  shortSha: restoredSha.slice(0, 7),
                  message: "Restore workspace notes with a new commit",
                },
                ...revisions,
              ]
            : revisions,
        page: 1,
        hasMore: false,
        truncated: scenario === "truncated",
      } satisfies Data.GitHubWikiHistoryPage;
    if (command === "github_get_repository_wiki_revision") {
      const candidates = restored
        ? [
            {
              ...revisions[1],
              sha: restoredSha,
              shortSha: restoredSha.slice(0, 7),
              message: "Restore workspace notes with a new commit",
            },
            ...revisions,
          ]
        : revisions;
      const revision = candidates.find((item) => item.sha === args.commitSha) ?? revisions[0];
      const deleted = revision.sha === deletedSha;
      return {
        revision,
        path: page.path,
        blobSha: deleted ? undefined : revision.sha,
        content: deleted ? undefined : revision.sha === currentSha ? page.content : previousContent,
        deleted,
        markdown: scenario !== "source",
      } satisfies Data.GitHubWikiRevision;
    }
    if (command === "github_compare_repository_wiki_revisions")
      return {
        path: page.path,
        baseSha: String(args.baseSha ?? olderSha),
        headSha,
        patch: empty
          ? ""
          : scenario === "raw"
            ? "Binary files differ: workspace notes at the selected revisions"
            : "diff --git a/Home.md b/Home.md\nindex aaaaaaa..d291348 100644\n--- a/Home.md\n+++ b/Home.md\n@@ -1,2 +1,2 @@\n-# Workspace notes\n+# Workspace navigation and reviews\n Keep navigation and review context together.\n",
        additions: empty ? 0 : 1,
        deletions: empty ? 0 : 1,
        truncated: scenario === "truncated",
      } satisfies Data.GitHubWikiComparison;
    if (acceptWrites && command === "github_revert_repository_wiki_page") {
      restored = true;
      return {
        overview: { ...nextOverview, headSha: restoredSha },
        page: { ...nextPage, headSha: restoredSha, blobSha: restoredSha, content: previousContent },
      } satisfies Data.GitHubWikiMutationResult;
    }
    return undefined;
  };
}
