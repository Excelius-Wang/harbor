import type * as GitHubData from "@/features/github/github-data";
import type {
  GitHubCodeOverview,
  GitHubContentEntry,
  GitHubIssue,
  GitHubIssueTimelineItem,
  GitHubPullRequest,
  GitHubPullRequestSummary,
  GitHubRepository,
} from "@/features/github/github-data";

const timestamp = "2026-09-01T10:00:00Z";
const sha = "d291348a9f51a76fcbb3ad0e1c81a440378f280b";
const body = `## Context\n\nKeep repository navigation, reading surfaces and actions clear in a compact window. This is controlled preview content.\n\n- Preserve keyboard access and focus.\n- Keep long descriptions readable.\n- Return to the same filtered results.\n\n\`\`\`typescript\nexport function workspaceTitle(name: string) {\n  return name.trim() || "Harbor";\n}\n\`\`\`\n\n| Check | Result |\n| --- | --- |\n| Keyboard | Ready |\n| Layout | In review |`;
const labels = [
  { name: "enhancement", color: "a2eeef" },
  { name: "accessibility", color: "bfd4f2" },
];
const titles = [
  "Keep context when returning from a detail view",
  "Make long repository names readable at the minimum window width",
  "Align the filter menu with the workspace toolbar",
  "Improve keyboard focus in review forms",
  "Handle a failed refresh without losing previous results",
  "Unify loading placeholders with the content layout",
];

function issue(
  number: number,
  repository: GitHubRepository,
  state: "open" | "closed" = "open"
): GitHubIssue {
  return {
    id: number,
    reactionSubject: { kind: "issue", id: `I_preview_${number}` },
    number,
    title: titles[(number - 1) % titles.length],
    body,
    url: `${repository.url}/issues/${number}`,
    state,
    author: "harbor-preview",
    authorAssociation: "OWNER",
    assignees: ["alex-morgan"],
    labels,
    locked: false,
    comments: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function pullRequest(number: number, repository: GitHubRepository): GitHubPullRequest {
  return {
    ...issue(number, repository),
    reactionSubject: { kind: "pullRequest", id: `PR_preview_${number}` },
    title: `Update workspace surfaces and controls ${number}`,
    url: `${repository.url}/pull/${number}`,
    draft: number === 2,
    merged: false,
    mergeable: true,
    mergeableState: "clean",
    maintainerCanModify: false,
    requestedReviewers: ["alex-morgan"],
    requestedTeams: [],
    headRef: "feature/workspace-surfaces",
    headLabel: "harbor-preview:feature/workspace-surfaces",
    headSha: sha,
    baseRef: "main",
    additions: 18,
    deletions: 7,
    changedFiles: 1,
    commits: 1,
    reviewComments: 0,
  };
}

const timeline: GitHubIssueTimelineItem[] = [
  {
    id: "101",
    kind: "comment",
    event: "commented",
    actor: "alex-morgan",
    body: "The compact layout keeps the related content together. Please check the loading and error states before the next review.",
    createdAt: timestamp,
    updatedAt: timestamp,
    viewerCanUpdate: true,
    viewerCanDelete: true,
    isMinimized: false,
    reactionSubject: { kind: "issueComment", id: "IC_preview_101" },
  },
];
const entries: GitHubContentEntry[] = [
  "src",
  "docs",
  "README.md",
  "package.json",
  "workspace.ts",
].map((name, index) => ({
  name,
  path: name,
  sha,
  kind: index < 2 ? "dir" : "file",
  size: index < 2 ? 0 : 1200 + index * 100,
}));
const overview: GitHubCodeOverview = {
  branches: [
    { name: "main", sha, protected: true },
    { name: "feature/workspace-surfaces", sha, protected: false },
  ],
  tags: [
    {
      name: "v0.1.0",
      sha,
      zipballUrl: "https://example.com/preview.zip",
      tarballUrl: "https://example.com/preview.tar.gz",
    },
  ],
  tagsHaveMore: false,
  commits: [
    {
      sha,
      shortSha: sha.slice(0, 7),
      title: "Unify workspace surfaces",
      author: "harbor-preview",
      url: "https://example.com/commit",
    },
  ],
  commitsHaveMore: false,
  readme: {
    name: "README.md",
    path: "README.md",
    content: "# Harbor preview\n\nA focused GitHub workspace.\n\n" + body,
    url: "https://example.com/readme",
  },
  canWrite: true,
  isArchived: false,
};

export function workspaceFixture(
  command: string,
  args: Record<string, unknown>,
  repositories: GitHubRepository[],
  empty: boolean,
  pullRequestScenario: string | null = null
): unknown {
  const repository = repositories.find((repo) => repo.name === args.repository) ?? repositories[0];
  const number = Number(args.issueNumber ?? args.pullRequestNumber ?? args.number ?? 1);
  const currentIssue = issue(number, repository);
  const pullOverrides: Record<string, Partial<GitHubPullRequest>> = {
    reviewed: { requestedReviewers: [] },
    draft: { draft: true },
    closed: { state: "closed", closedAt: timestamp },
    merged: { state: "closed", merged: true, mergedBy: "harbor-preview", mergedAt: timestamp },
    conflicts: { mergeable: false, mergeableState: "dirty" },
    unknown: { mergeable: null, mergeableState: "unknown" },
  };
  const currentPull = {
    ...pullRequest(number, repository),
    ...pullOverrides[pullRequestScenario ?? ""],
  };
  const queueStates: Record<string, GitHubData.GitHubPullRequestMergeQueueState> = {
    "queue-available": "available",
    "queue-waiting": "waiting",
    "queue-queued": "queued",
    "queue-unavailable": "unavailable",
  };
  const queueState = queueStates[pullRequestScenario ?? ""] ?? "notConfigured";
  const autoMergeEnabled = pullRequestScenario === "auto-enabled";
  const maintainerAvailable = pullRequestScenario?.startsWith("maintainer-") ?? false;
  const reviews: GitHubData.GitHubPullRequestReview[] = empty
    ? []
    : [
        {
          id: 501,
          nodeId: "PRR_preview_501",
          author: "alex-morgan",
          authorAssociation: "MEMBER",
          state: "changesRequested",
          body: "Keep the review controls reachable when the pane is narrow.",
          url: `${repository.url}/pull/${number}#pullrequestreview-501`,
          commitId: sha,
          submittedAt: timestamp,
        },
      ];
  const commits: GitHubData.GitHubCommit[] = empty
    ? []
    : [
        {
          ...overview.commits[0],
          message: "Unify workspace surfaces",
          authorLogin: "harbor-preview",
          authorAvatarUrl: null,
          committedAt: timestamp,
          verified: true,
        },
      ];
  const items = empty
    ? []
    : Array.from({ length: 6 }, (_, index) =>
        issue(index + 1, repository, args.issueState === "closed" ? "closed" : "open")
      );
  const pulls: GitHubPullRequestSummary[] = empty
    ? []
    : Array.from({ length: 4 }, (_, index) => ({
        ...pullRequest(index + 1, repository),
        repository,
      }));
  const pagination = { totalCount: items.length, page: 1, hasPrevious: false, hasMore: false };
  const identity = {
    repositoryId: "R_preview",
    repositoryFullName: repository.fullName,
    issueNodeId: currentIssue.reactionSubject.id,
    issueNumber: number,
    number,
    updatedAt: timestamp,
  };
  switch (command) {
    case "github_get_repository_creation_options":
      return {
        gitignoreTemplates: ["Node", "Rust"],
        licenses: [{ key: "mit", name: "MIT License" }],
      } satisfies GitHubData.GitHubRepositoryCreationOptions;
    case "github_list_repository_issue_types":
      return [{ nodeId: "IT_preview", name: "Task" }] satisfies GitHubData.GitHubIssueType[];
    case "github_list_repositories":
      return { repositories: empty ? [] : repositories, page: 1, hasMore: false };
    case "github_list_starred_repositories":
      return {
        repositories: empty
          ? []
          : repositories.map((repository) => ({ repository, starredAt: timestamp })),
        page: 1,
        hasMore: false,
      };
    case "github_get_repository_relationship":
      return {
        starred: false,
        watchLevel: "participating",
        viewerLogin: "harbor-preview",
        viewerOwnsRepository: true,
      };
    case "github_get_repository_code_overview":
      return empty ? { ...overview, branches: [], commits: [], tags: [] } : overview;
    case "github_list_repository_contents":
      return { entries: empty ? [] : args.path ? entries.slice(2) : entries };
    case "github_get_repository_file":
      return {
        kind: "text",
        name: String(args.path),
        path: String(args.path),
        sha,
        size: empty ? 0 : 150,
        content: empty
          ? ""
          : 'export function workspaceTitle(name: string) {\n  return name.trim() || "Harbor";\n}\n',
      };
    case "github_list_issue_inbox":
      return { ...pagination, issues: items.map((issue) => ({ repository, issue })) };
    case "github_list_repository_issues":
      return { ...pagination, issues: items };
    case "github_get_repository_issue":
      return {
        issue: currentIssue,
        timeline,
        timelinePage: 1,
        timelineHasPrevious: false,
        timelineHasMore: false,
      };
    case "github_list_pull_request_inbox":
    case "github_list_repository_pull_requests":
      return { ...pagination, totalCount: pulls.length, pullRequests: pulls };
    case "github_get_repository_pull_request":
      return {
        pullRequest: currentPull,
        timeline,
        reviews,
        reviewsHaveMore: false,
        timelinePage: 1,
        timelineHasPrevious: false,
        timelineHasMore: false,
      };
    case "github_get_repository_pull_request_branch_update_status":
      return {
        state: pullRequestScenario === "branch-conflicts" ? "conflicts" : "available",
        headSha: sha,
        behindBy: 3,
      } satisfies GitHubData.GitHubPullRequestBranchUpdateStatus;
    case "github_get_repository_pull_request_merge_queue_status":
      return {
        state: queueState,
        headSha: sha,
        baseRef: "main",
        viewerCanEnqueue: queueState === "available",
        viewerCanDequeue: queueState === "queued",
        entry:
          queueState === "queued"
            ? {
                id: "MQE_preview",
                position: 2,
                state: "awaitingChecks",
                enqueuedAt: timestamp,
                enqueuedBy: "alex-morgan",
                estimatedTimeToMergeSeconds: 240,
                headSha: sha,
                jump: false,
              }
            : undefined,
      } satisfies GitHubData.GitHubPullRequestMergeQueueStatus;
    case "github_get_repository_pull_request_auto_merge_status":
      return {
        state: autoMergeEnabled ? "enabled" : "available",
        headSha: sha,
        allowedMergeMethods: ["merge", "squash", "rebase"],
        viewerCanEnable: !autoMergeEnabled,
        viewerCanDisable: autoMergeEnabled,
        mergeMethod: autoMergeEnabled ? "squash" : undefined,
        enabledBy: autoMergeEnabled ? "alex-morgan" : undefined,
      } satisfies GitHubData.GitHubPullRequestAutoMergeStatus;
    case "github_get_repository_pull_request_maintainer_editability":
      return {
        pullRequest: currentPull,
        state: maintainerAvailable ? "available" : "sameRepository",
        workflowRisk: pullRequestScenario === "maintainer-risk" ? "present" : "absent",
        pullRequestId: number,
        pullRequestNodeId: `PR_preview_${number}`,
        pullRequestNumber: number,
        authorId: 1,
        authorLogin: "harbor-preview",
        viewerId: 1,
        currentValue: false,
        draft: currentPull.draft,
        merged: currentPull.merged,
        baseRepositoryId: repository.id,
        baseRepository: repository.fullName,
        headRepositoryId: maintainerAvailable ? 100 : repository.id,
        headRepository: maintainerAvailable ? "contributor/harbor" : repository.fullName,
        headRepositoryOwnerType: "User",
        headRepositoryFork: maintainerAvailable,
        headRepositoryPrivate: false,
        headRef: currentPull.headRef,
        headSha: sha,
      } satisfies GitHubData.GitHubPullRequestMaintainerEditability;
    case "github_list_pull_request_commits":
    case "github_list_repository_commits":
      return {
        ...pagination,
        commits,
      } satisfies GitHubData.GitHubRepositoryCommitPage;
    case "github_list_repository_pull_request_reviews":
      return {
        reviews,
        page: 1,
        hasPrevious: false,
        hasMore: false,
      } satisfies GitHubData.GitHubPullRequestReviewPage;
    case "github_list_repository_pull_request_review_teams":
      return {
        teams: empty
          ? []
          : [
              {
                name: "Workspace maintainers",
                slug: "workspace-maintainers",
                description: "Review workspace behavior and accessibility.",
              },
            ],
      } satisfies GitHubData.GitHubPullRequestReviewTeamPage;
    case "github_list_repository_pull_request_base_branches":
      return {
        pullRequestNumber: number,
        currentBase: "main",
        currentBaseSha: sha,
        headSha: sha,
        branches: empty
          ? []
          : [...overview.branches, { name: "release/0.2", sha, protected: true }],
        page: 1,
        hasPrevious: false,
        hasMore: false,
      } satisfies GitHubData.GitHubPullRequestBaseBranchPage;
    case "github_compare_repository_pull_request_branches":
      return {
        base: String(args.base ?? "main"),
        head: String(args.head ?? "feature/workspace-surfaces"),
        status: empty ? "identical" : "ahead",
        aheadBy: commits.length,
        behindBy: 0,
        totalCommits: commits.length,
        changedFiles: empty ? 0 : 1,
        additions: empty ? 0 : 18,
        deletions: empty ? 0 : 7,
        commits,
        suggestedTitle: "Unify workspace surfaces",
      } satisfies GitHubData.GitHubPullRequestComparison;
    case "github_list_pull_request_files":
      return {
        ...pagination,
        files: empty
          ? []
          : [
              {
                path: "src/workspace.ts",
                sha,
                status: "modified",
                additions: 2,
                deletions: 1,
                changes: 3,
                patch:
                  '@@ -1,3 +1,4 @@\n export function workspaceTitle(name: string) {\n-  return name;\n+  const title = name.trim();\n+  return title || "Harbor";\n }',
              },
            ],
      } satisfies GitHubData.GitHubPullRequestFilePage;
    case "github_get_repository_pull_request_file_view_states":
      return {
        pullRequestId: `PR_preview_${number}`,
        files: [
          {
            path: "src/workspace.ts",
            state: pullRequestScenario === "view-dismissed" ? "dismissed" : "unviewed",
          },
        ],
      } satisfies GitHubData.GitHubPullRequestFileViewStateSnapshot;
    case "github_list_pull_request_review_threads":
      return {
        threads: empty
          ? []
          : [
              {
                id: "PRRT_preview_1",
                path: "src/workspace.ts",
                line: 3,
                originalLine: 3,
                side: "right",
                subjectType: "line",
                isResolved: pullRequestScenario === "thread-resolved",
                isOutdated: pullRequestScenario === "thread-outdated",
                isCollapsed: false,
                resolvedBy: pullRequestScenario === "thread-resolved" ? "alex-morgan" : undefined,
                viewerCanReply: true,
                viewerCanResolve: pullRequestScenario !== "thread-resolved",
                viewerCanUnresolve: pullRequestScenario === "thread-resolved",
                comments: [
                  {
                    id: "PRRC_preview_1",
                    databaseId: 701,
                    author: "alex-morgan",
                    authorAssociation: "MEMBER",
                    body: "Please preserve the original title when the request fails.",
                    url: `${repository.url}/pull/${number}#discussion_r701`,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    pending: false,
                    viewerCanUpdate: true,
                    viewerCanDelete: true,
                    viewerCanMinimize: true,
                    isMinimized: false,
                    outdated: pullRequestScenario === "thread-outdated",
                  },
                ],
                commentsHaveMore: false,
              },
            ],
        hasMore: false,
      } satisfies GitHubData.GitHubPullRequestReviewThreadPage;
    case "github_get_pending_repository_pull_request_review":
      return pullRequestScenario === "pending-review" || pullRequestScenario === "outdated-review"
        ? ({
            id: 601,
            nodeId: "PRR_preview_pending",
            body: "A saved review draft with an inline comment.",
            commitId: pullRequestScenario === "outdated-review" ? "a".repeat(40) : sha,
            comments: [
              {
                id: "PRRC_preview_pending",
                databaseId: 801,
                path: "src/workspace.ts",
                line: 3,
                side: "right",
                body: "Keep this inline draft while reviewing the surrounding change.",
              },
            ],
            uneditableCommentCount: 0,
          } satisfies GitHubData.GitHubPendingPullRequestReview)
        : null;
    case "github_list_repository_checks":
      return {
        ...pagination,
        totalCount: 2,
        checks: [
          {
            id: "1",
            kind: "checkRun",
            name: "TypeScript and tests",
            status: "completed",
            conclusion: "success",
            description: "All checks passed",
            completedAt: timestamp,
          },
          {
            id: "2",
            kind: "checkRun",
            name: "Desktop build",
            status: "in_progress",
            description: "Building macOS application",
          },
        ],
      } satisfies GitHubData.GitHubCheckPage;
    case "github_get_repository_issue_creation_policy":
      return {
        blankIssueAllowed: true,
        contactLinks: [],
        templates: [
          {
            path: ".github/ISSUE_TEMPLATE/feedback.md",
            kind: "markdown",
            name: "Workspace feedback",
            about: "Report a workspace usability problem.",
            defaultTitle: "",
            body: "## What happened?\n\n## What did you expect?",
            labels: ["enhancement"],
            assignees: [],
            templateUrl: `${repository.url}/issues/new?template=feedback.md`,
          },
        ],
        templateChooserUrl: `${repository.url}/issues/new/choose`,
      } satisfies GitHubData.GitHubIssueCreationPolicy;
    case "github_get_repository_issue_state_capabilities":
      return { ...identity, state: "open", viewerCanClose: true, viewerCanReopen: false };
    case "github_get_repository_conversation_controls":
      return {
        kind: args.kind,
        number,
        locked: false,
        viewerCanLock: true,
        viewerCanSubscribe: true,
        viewerSubscription: "subscribed",
      };
    case "github_get_repository_pinned_issues":
      return {
        ...identity,
        viewerCanManage: true,
        issues: empty
          ? []
          : [2, 3].map((issueNumber) => ({
              nodeId: `I_preview_${issueNumber}`,
              number: issueNumber,
              title: issue(issueNumber, repository).title,
              url: `${repository.url}/issues/${issueNumber}`,
              state: "open" as const,
              pinnedBy: "harbor-preview",
            })),
      } satisfies GitHubData.GitHubPinnedIssuePage;
    case "github_get_repository_issue_type_status":
      return {
        ...identity,
        currentIssueType: null,
        availableIssueTypes: [{ nodeId: "IT_preview", name: "Task" }],
        viewerCanType: true,
      };
    case "github_get_repository_issue_delete_status":
      return { ...identity, title: currentIssue.title, viewerCanDelete: true };
    case "github_get_repository_issue_transfer_status":
      return {
        sourceRepositoryId: "R_preview",
        sourceRepositoryFullName: repository.fullName,
        sourceIssueNodeId: currentIssue.reactionSubject.id,
        sourceIssueNumber: number,
        sourceIssueOpen: true,
        sourcePrivate: false,
        sourceViewerCanTransfer: true,
        targetRepositoryId: "R_preview_target",
        targetRepositoryFullName: "harbor-preview/workflow-engine",
        targetRepositoryUrl: "https://github.com/harbor-preview/workflow-engine",
        targetDefaultBranch: "main",
        targetPrivate: false,
        targetViewerCanTransfer: true,
        sameOwner: true,
        privateCompatible: true,
        viewerCanTransfer: true,
      } satisfies GitHubData.GitHubIssueTransferStatus;
    case "github_get_repository_issue_clone_status":
      return {
        ...identity,
        title: currentIssue.title,
        body,
        sourceOpen: true,
        destinationAllowsBlankIssues: true,
        viewerCanClone: true,
      } satisfies GitHubData.GitHubIssueCloneStatus;
    case "github_get_repository_issue_relationships":
      return {
        ...pagination,
        parent: empty ? null : { issue: issue(number + 10, repository), repository },
        subIssues: empty
          ? []
          : [number + 1, number + 2].map((child) => ({
              issue: issue(child, repository),
              repository,
            })),
      } satisfies GitHubData.GitHubIssueRelationshipsPage;
    case "github_get_repository_issue_dependencies":
      return {
        blockedBy: empty ? [] : [{ issue: issue(number + 3, repository), repository }],
        blocking: empty ? [] : [{ issue: issue(number + 4, repository), repository }],
        page: 1,
        hasPrevious: false,
        hasMore: false,
      };
    case "github_get_repository_issue_duplicate":
      return empty
        ? null
        : ({
            owner: repository.owner,
            repository: repository.name,
            fullName: repository.fullName,
            repositoryUrl: repository.url,
            issueNumber: number + 1,
            title: issue(number + 1, repository).title,
            url: `${repository.url}/issues/${number + 1}`,
            viewerCanUnmark: true,
          } satisfies GitHubData.GitHubIssueDuplicateReference);
    case "github_get_repository_issue_linked_pull_requests":
      return {
        pullRequests: empty
          ? []
          : [
              {
                repository,
                number: 1,
                title: "Update workspace surfaces and controls",
                url: `${repository.url}/pull/1`,
                state: "open",
                draft: false,
                merged: false,
              },
            ],
        nextCursor: null,
      } satisfies GitHubData.GitHubIssueLinkedPullRequestPage;
    case "github_get_repository_issue_linked_branches":
      return {
        ...identity,
        defaultBranch: "main",
        defaultBranchOid: sha,
        viewerCanCreate: true,
        viewerCanRead: true,
        branches: empty
          ? []
          : [
              {
                id: "LB_preview",
                name: "feature/workspace-surfaces",
                repositoryId: "R_preview",
                repositoryFullName: repository.fullName,
                oid: sha,
              },
            ],
        nextCursor: null,
      } satisfies GitHubData.GitHubIssueLinkedBranchPage;
    case "github_get_repository_issue_tracking":
      return {
        direction: args.direction === "trackedBy" ? "trackedBy" : "tracked",
        issues: empty
          ? []
          : [
              {
                nodeId: `I_preview_${number + 5}`,
                number: number + 5,
                title: issue(number + 5, repository).title,
                url: `${repository.url}/issues/${number + 5}`,
                state: "open",
                repository,
              },
            ],
        nextCursor: null,
      } satisfies GitHubData.GitHubIssueTrackingPage;
    case "github_list_repository_issue_labels":
      return { labels: empty ? [] : labels };
    case "github_list_repository_issue_assignees":
      return {
        assignees: [
          { login: "harbor-preview", avatarUrl: "" },
          { login: "alex-morgan", avatarUrl: "" },
        ],
      };
    case "github_list_repository_issue_milestones":
      return {
        milestones: empty
          ? []
          : [
              {
                number: 1,
                title: "Workspace accessibility",
                description:
                  "Keep keyboard access and review context intact at compact window sizes.",
                state: "open",
                openIssues: 3,
                closedIssues: 7,
                dueOn: "2026-09-30T10:00:00Z",
              },
              {
                number: 2,
                title: "Stable navigation",
                state: "closed",
                openIssues: 0,
                closedIssues: 12,
              },
            ],
      } satisfies GitHubData.GitHubIssueMilestonePage;
    case "github_get_repository_reactions":
      return ((args.subjects ?? []) as GitHubData.GitHubReactionSubjectRef[]).map(
        (subject) =>
          ({
            ...subject,
            viewerCanReact: true,
            groups: [
              { content: "thumbsUp", count: 2, viewerHasReacted: false },
              { content: "heart", count: 1, viewerHasReacted: true },
            ],
          }) satisfies GitHubData.GitHubReactionSubject
      );
    default:
      return undefined;
  }
}
