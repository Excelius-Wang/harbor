import type * as Data from "@/features/github/github-data";
import { previewIssue, previewPullRequest } from "./workspace-fixtures";

const timestamp = "2026-09-01T10:00:00Z";
const sha = "d291348a9f51a76fcbb3ad0e1c81a440378f280b";

export function discoveryFixture(
  command: string,
  args: Record<string, unknown>,
  repositories: Data.GitHubRepository[],
  empty: boolean,
  scenario: string | null
): Data.GitHubDiscoverySearchPage | Data.GitHubDeveloperFeedPage | undefined {
  if (command !== "github_search_discovery" && command !== "github_list_developer_feed")
    return undefined;
  const page = Number(args.page ?? 1);
  if (page > 1 && scenario === "next-error") throw new Error("Preview next page failed");
  const rows = scenario === "dense" ? 24 : repositories.length;
  const users: Data.GitHubUserSummary[] = Array.from({ length: rows }, (_, index) => ({
    id: index + 1,
    login: `developer-${index + 1}`,
    avatarUrl: "",
    url: `https://github.com/developer-${index + 1}`,
  }));
  const pagination = { page, hasPrevious: page > 1, hasMore: !empty && page < 2 };
  const repository = repositories[0];
  if (command === "github_list_developer_feed") {
    const types = [
      "PushEvent",
      "IssuesEvent",
      "PullRequestEvent",
      "WatchEvent",
      "ForkEvent",
      "CreateEvent",
      "IssueCommentEvent",
      "ReleaseEvent",
    ];
    return {
      ...pagination,
      events: empty
        ? []
        : users.map((actor, index) => ({
            id: `feed-${page}-${index}`,
            eventType: types[index % types.length],
            actor,
            repository,
            action: "opened",
            reference: "feature/workspace-surfaces",
            resourceNumber: index + 1,
            resourceTitle:
              "Keep repository navigation and long descriptions readable when returning from a detail view in a compact desktop window.",
            commitCount: 3,
            public: index !== 7,
            createdAt: timestamp,
          })),
    };
  }
  const metadata = {
    ...pagination,
    hasMore: !empty && scenario === "dense" && page < 2,
    totalCount: empty ? 0 : rows * (scenario === "dense" ? 2 : 1),
    incompleteResults: scenario === "incomplete",
  };
  switch (args.kind) {
    case "repositories":
      return {
        ...metadata,
        kind: "repositories",
        results: empty
          ? []
          : scenario === "dense"
            ? users.map((_, index) => ({
                ...repositories[index % repositories.length],
                id: page * 1000 + index,
                name: `${repository.name}-workspace-${page}-${index + 1}`,
                fullName: `${repository.owner}/${repository.name}-workspace-${page}-${index + 1}`,
                url: `${repository.url}-workspace-${page}-${index + 1}`,
                description: `${repository.description} ${"Descriptions stay readable alongside repository controls and metadata. ".repeat(4)}`,
              }))
            : repositories,
      };
    case "code":
      return {
        ...metadata,
        kind: "code",
        results: empty
          ? []
          : users.map((_, index) => ({
              name: `workspace-${index + 1}.ts`,
              path: `src/features/workspace/navigation/workspace-${index + 1}.ts`,
              sha,
              url: `${repository.url}/blob/main/src/workspace-${index + 1}.ts`,
              fragment:
                'export function workspaceTitle(name: string) {\n  return name.trim() || "Harbor";\n}\n\n// Keep the selected repository and the filtered results together.\n',
              repository,
            })),
      };
    case "issues":
      return {
        ...metadata,
        kind: "issues",
        results: empty
          ? []
          : users.map((_, index) => ({ repository, issue: previewIssue(index + 1, repository) })),
      };
    case "pullRequests":
      return {
        ...metadata,
        kind: "pullRequests",
        results: empty
          ? []
          : users.map((_, index) => ({ repository, ...previewPullRequest(index + 1, repository) })),
      };
    case "users":
      return { ...metadata, kind: "users", results: empty ? [] : users };
    default:
      return undefined;
  }
}
