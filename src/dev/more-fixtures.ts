import type * as Data from "@/features/github/github-data";

const timestamp = "2026-09-01T10:00:00Z";
const version = "d291348a9f51a76fcbb3ad0e1c81a440378f280b";
const page = { page: 1, hasPrevious: false, hasMore: false };
const titles = [
  "Workspace navigation and reading surfaces",
  "Keyboard access across compact controls",
  "Long descriptions should remain readable at the minimum window width",
  "Release preparation and documentation",
];
const gists: Data.GitHubGist[] = titles.map((description, index) => ({
  id: `preview-gist-${index + 1}`,
  description,
  url: `https://gist.github.com/harbor-preview/preview-${index + 1}`,
  public: index !== 1,
  owner: "harbor-preview",
  comments: 1,
  commentsEnabled: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  starred: index === 1,
  viewerOwns: true,
  files: [
    {
      filename: `workspace-${index + 1}.ts`,
      language: "TypeScript",
      size: 130,
      truncated: false,
      content:
        'export function workspaceTitle(name: string) {\n  return name.trim() || "Harbor";\n}\n',
    },
  ],
}));
const projects: Data.GitHubProjectSummary[] = titles.map((title, index) => ({
  id: `P_preview_${index + 1}`,
  number: index + 1,
  title,
  shortDescription: "Track the workspace changes, review feedback and verification tasks together.",
  url: `https://github.com/users/harbor-preview/projects/${index + 1}`,
  public: index !== 1,
  closed: false,
  itemCount: 4,
  updatedAt: timestamp,
  viewerCanUpdate: true,
  viewerCanClose: true,
  viewerCanReopen: true,
}));
const fields: Data.GitHubProjectField[] = [
  {
    id: "title",
    name: "Title",
    dataType: "title",
    issueField: false,
    editable: false,
    options: [],
    iterations: [],
  },
  {
    id: "status",
    name: "Status",
    dataType: "singleSelect",
    issueField: false,
    editable: true,
    options: [
      { id: "todo", name: "Todo", color: "GRAY", description: "" },
      { id: "progress", name: "In progress", color: "BLUE", description: "" },
    ],
    iterations: [],
  },
  {
    id: "date",
    name: "Target date",
    dataType: "date",
    issueField: false,
    editable: true,
    options: [],
    iterations: [],
  },
];
const views: Data.GitHubProjectView[] = ["table", "board", "roadmap"].map((layout, index) => ({
  id: layout,
  number: index + 1,
  name: layout[0].toUpperCase() + layout.slice(1),
  layout: layout as Data.GitHubProjectViewLayout,
  filter: "",
  visibleFieldIds: ["title", "status", "date"],
  groupByFieldIds: ["status"],
  verticalGroupByFieldIds: [],
}));

export function moreFixture(
  command: string,
  args: Record<string, unknown>,
  repositories: Data.GitHubRepository[],
  empty: boolean
): unknown {
  const repository = repositories[0];
  const login = typeof args.username === "string" ? args.username : "harbor-preview";
  const gist = gists.find((item) => item.id === args.gistId) ?? gists[0];
  const packages: Data.GitHubPackage[] = titles.map(
    (_, index): Data.GitHubPackage => ({
      id: index + 1,
      name: ["harbor-desktop", "workspace-components", "workspace-preview", "documentation-tools"][
        index
      ],
      packageType: (args.packageType ?? "container") as Data.GitHubPackageType,
      visibility: { kind: args.visibility === "private" || index === 1 ? "private" : "public" },
      versionCount: 3,
      owner: "harbor-preview",
      url: `https://github.com/users/harbor-preview/packages/container/harbor-desktop`,
      createdAt: timestamp,
      updatedAt: timestamp,
      repository,
    })
  );
  switch (command) {
    case "github_get_user_profile":
      return {
        id: 1,
        login,
        avatarUrl: "",
        url: `https://github.com/${login}`,
        name: login === "harbor-preview" ? "Harbor Preview" : "Alex Morgan",
        bio: "Building a focused GitHub desktop workspace. Keeping navigation, reviews and the small details clear.",
        company: "Harbor",
        location: "Shanghai",
        blog: "https://github.com/harbor-preview",
        email: "",
        twitterUsername: "",
        hireable: true,
        publicRepositories: 8,
        publicGists: 4,
        followers: 3,
        following: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
        viewerOwnsProfile: login === "harbor-preview",
        viewerFollows: false,
        followsViewer: true,
      } satisfies Data.GitHubUserProfile;
    case "github_get_user_contributions":
      return {
        login,
        startedAt: "2026-01-01",
        endedAt: "2026-09-01",
        totalContributions: empty ? 0 : 340,
        restrictedContributions: 0,
        hasRestrictedContributions: false,
        commits: 250,
        issues: 30,
        pullRequests: 40,
        pullRequestReviews: 20,
        months: [{ firstDay: "2026-01-01", name: "January", totalWeeks: 52, year: 2026 }],
        weeks: Array.from({ length: 52 }, (_, week) => ({
          firstDay: new Date(Date.UTC(2025, 8, 7 + week * 7)).toISOString().slice(0, 10),
          days: Array.from({ length: 7 }, (_, day) => ({
            color: "",
            contributionCount: empty ? 0 : (week + day) % 5,
            contributionLevel: (
              [
                "NONE",
                "FIRST_QUARTILE",
                "SECOND_QUARTILE",
                "THIRD_QUARTILE",
                "FOURTH_QUARTILE",
              ] as const
            )[empty ? 0 : (week + day) % 5],
            date: new Date(Date.UTC(2025, 8, 7 + week * 7 + day)).toISOString().slice(0, 10),
            weekday: day,
          })),
        })),
      } satisfies Data.GitHubContributionSummary;
    case "github_list_profile_connections":
      return {
        ...page,
        users: empty
          ? []
          : ["alex-morgan", "lin-chen", "sam-rivera"].map((login, index) => ({
              id: index + 2,
              login,
              avatarUrl: "",
              url: `https://github.com/${login}`,
            })),
      } satisfies Data.GitHubUserPage;
    case "github_list_profile_activity":
      return {
        ...page,
        activities: empty
          ? []
          : titles.map((resourceTitle, index) => ({
              id: String(index),
              eventType: "IssuesEvent",
              repository: repository.fullName,
              action: "opened",
              resourceNumber: index + 1,
              resourceTitle,
              createdAt: timestamp,
            })),
      } satisfies Data.GitHubProfileActivityPage;
    case "github_list_notifications":
      return {
        ...page,
        notifications: empty
          ? []
          : titles.map((title, index) => ({
              id: index + 1,
              repository: repositories[index],
              subject: {
                title,
                kind: index % 2 ? "pullRequest" : "issue",
                number: 1,
                url: `${repositories[index].url}/issues/1`,
              },
              reason: index % 2 ? "review_requested" : "mention",
              unread: true,
              updatedAt: timestamp,
            })),
      } satisfies Data.GitHubNotificationPage;
    case "github_list_received_repository_invitations":
      return {
        ...page,
        invitations: empty
          ? []
          : [
              {
                id: 1,
                repository,
                inviter: {
                  id: 2,
                  login: "alex-morgan",
                  avatarUrl: "",
                  url: "https://github.com/alex-morgan",
                },
                permission: "write",
                createdAt: timestamp,
              },
            ],
      } satisfies Data.GitHubReceivedRepositoryInvitationPage;
    case "github_list_gists":
      return { ...page, gists: empty ? [] : gists } satisfies Data.GitHubGistPage;
    case "github_get_gist":
      return gist;
    case "github_list_gist_comments":
      return {
        ...page,
        comments: empty
          ? []
          : [
              {
                id: 1,
                body: "The helper keeps the workspace title readable. Thanks for including an empty-name fallback.",
                author: "alex-morgan",
                createdAt: timestamp,
                updatedAt: timestamp,
                viewerCanUpdate: true,
                viewerCanDelete: true,
              },
            ],
      } satisfies Data.GitHubGistCommentPage;
    case "github_list_gist_revisions":
      return {
        ...page,
        revisions: [
          {
            version,
            author: "harbor-preview",
            committedAt: timestamp,
            additions: 3,
            deletions: 1,
            total: 4,
          },
        ],
      } satisfies Data.GitHubGistRevisionPage;
    case "github_get_gist_revision":
      return {
        gistId: gist.id,
        version,
        description: gist.description,
        createdAt: timestamp,
        updatedAt: timestamp,
        files: gist.files,
      } satisfies Data.GitHubGistRevisionDetail;
    case "github_list_personal_projects":
      return {
        projects: empty ? [] : projects,
        totalCount: empty ? 0 : projects.length,
        endCursor: null,
        hasMore: false,
      } satisfies Data.GitHubProjectPage;
    case "github_get_personal_project":
      return {
        project: projects.find((item) => item.number === args.number) ?? projects[0],
        readme:
          "## Workspace improvements\n\nTrack the interface, keyboard and review tasks in one project.",
        fields,
        views,
        items: {
          totalCount: empty ? 0 : titles.length,
          endCursor: null,
          hasMore: false,
          items: empty
            ? []
            : titles.map((title, index) => ({
                id: `PI_preview_${index}`,
                archived: Boolean(args.archived),
                content: {
                  kind: "draftIssue",
                  id: `DI_preview_${index}`,
                  title,
                  body: "Verify in both themes at compact and wide desktop sizes.",
                },
                fieldValues: [
                  {
                    kind: "singleSelect",
                    fieldId: "status",
                    optionId: index % 2 ? "progress" : "todo",
                    name: index % 2 ? "In progress" : "Todo",
                    color: index % 2 ? "BLUE" : "GRAY",
                  },
                  { kind: "date", fieldId: "date", date: `2026-09-${10 + index}` },
                ],
                createdAt: timestamp,
                updatedAt: timestamp,
              })),
        },
      } satisfies Data.GitHubProjectDetail;
    case "github_list_personal_packages":
      return { ...page, packages: empty ? [] : packages } satisfies Data.GitHubPackagePage;
    case "github_get_personal_package":
      return packages.find((item) => item.name === args.packageName) ?? packages[0];
    case "github_list_personal_package_versions":
      return {
        ...page,
        state: args.state === "deleted" ? "deleted" : "active",
        versions: empty
          ? []
          : ["1.4.0", "1.3.2", "1.3.1"].map((name, index) => ({
              id: index + 1,
              name,
              state: args.state === "deleted" ? "deleted" : "active",
              metadata: { kind: "container", tags: index === 0 ? ["latest", name] : [name] },
              url: "https://github.com/harbor-preview",
              description: "Desktop workspace preview",
              license: "MIT",
              createdAt: timestamp,
              updatedAt: timestamp,
            })),
      } satisfies Data.GitHubPackageVersionPage;
    default:
      return undefined;
  }
}
