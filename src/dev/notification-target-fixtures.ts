import type * as Data from "@/features/github/github-data";

export function createNotificationTargetFixtures(
  repositories: Data.GitHubRepository[],
  enabled: boolean
) {
  const read = new Set<number>();
  const repository = repositories[0];
  const subjects: Data.GitHubNotification["subject"][] = [
    {
      kind: "workflowRun",
      title: "Workflow execution and artifacts",
      workflowRunId: 1,
      url: `${repository.url}/actions/runs/1`,
    },
    {
      kind: "checkSuite",
      title: "Check suite results",
      checkSuiteId: 1,
      url: `${repository.url}/commit/d291348`,
    },
    {
      kind: "discussion",
      title: "Discussion replies and decisions",
      number: 1,
      url: `${repository.url}/discussions/1`,
    },
    {
      kind: "release",
      title: "Release notes and assets",
      releaseId: 1,
      url: `${repository.url}/releases/tag/v1.4.0`,
    },
    {
      kind: "commit",
      title: "Commit changes and comments",
      commitSha: "d291348a9f51a76fcbb3ad0e1c81a440378f280b",
      url: `${repository.url}/commit/d291348`,
    },
    {
      kind: "dependabotAlert",
      title: "Dependency alert",
      number: 1,
      url: `${repository.url}/security/dependabot/1`,
    },
    {
      kind: "codeScanningAlert",
      title: "Code scanning alert",
      number: 2,
      url: `${repository.url}/security/code-scanning/2`,
    },
    {
      kind: "secretScanningAlert",
      title: "Secret scanning alert",
      number: 3,
      url: `${repository.url}/security/secret-scanning/3`,
    },
    {
      kind: "repositoryInvitation",
      title: "Repository invitation",
      url: `${repository.url}/invitations`,
    },
  ];
  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (!enabled) return undefined;
    if (command === "github_update_notification") {
      read.add(Number(args.threadId));
      return null;
    }
    if (command === "github_mark_all_notifications_read") {
      subjects.forEach((_, index) => read.add(index + 1));
      return null;
    }
    if (command !== "github_list_notifications") return undefined;
    return {
      page: 1,
      hasPrevious: false,
      hasMore: false,
      notifications: empty
        ? []
        : subjects
            .map((subject, index) => ({
              id: index + 1,
              repository,
              subject,
              reason: "mention",
              unread: true,
              updatedAt: "2026-09-01T10:00:00Z",
            }))
            .filter((notification) => !read.has(notification.id)),
    } satisfies Data.GitHubNotificationPage;
  };
}
