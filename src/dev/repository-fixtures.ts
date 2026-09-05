import type * as Data from "@/features/github/github-data";

const timestamp = "2026-09-01T10:00:00Z";
const sha = "d291348a9f51a76fcbb3ad0e1c81a440378f280b";
const page = { page: 1, hasPrevious: false, hasMore: false };
const body =
  '## Workspace update\n\nKeep navigation and review context together in a compact desktop window.\n\n- Check keyboard focus and readable controls.\n- Preserve independent filters and cached results.\n- Verify the layout in both themes.\n\n```typescript\nconst workspace = { name: "Harbor", ready: true };\n```';
const workflows: Data.GitHubWorkflow[] = [
  "Workspace checks",
  "Documentation preview",
  "Release",
].map((name, index) => ({
  id: index + 1,
  name,
  path: `.github/workflows/${["checks", "docs", "release"][index]}.yml`,
  state: "active",
  url: `https://github.com/harbor-preview/harbor/actions/workflows/${index + 1}`,
}));
const runs: Data.GitHubWorkflowRun[] = [
  "Check workspace surfaces and keyboard access",
  "Build the documentation preview",
  "Verify the compact layout with long content",
  "Prepare release artifacts",
].map((title, index) => ({
  id: index + 1,
  workflowId: (index % 3) + 1,
  workflowName: workflows[index % 3].name,
  title,
  runNumber: 148 - index,
  runAttempt: 1,
  event: index === 1 ? "workflow_dispatch" : "pull_request",
  status: "completed",
  conclusion: index === 2 ? "failure" : "success",
  headBranch: "feature/workspace-surfaces",
  headSha: sha,
  headCommitMessage: title,
  actor: "harbor-preview",
  actorAvatarUrl: null,
  createdAt: timestamp,
  updatedAt: "2026-09-01T10:05:00Z",
  startedAt: timestamp,
  url: `https://github.com/harbor-preview/harbor/actions/runs/${index + 1}`,
}));
const wikiPages: Data.GitHubWikiPageSummary[] = [
  "Home",
  "Getting-started",
  "Reviewing-changes",
  "Keyboard-shortcuts",
].map((title, index) => ({
  path: `${title}.md`,
  title: title.replace(/-/g, " "),
  kind: index === 0 ? "home" : "page",
  markdown: true,
  blobSha: sha,
  byteSize: body.length,
}));
const releases: Data.GitHubRelease[] = ["v1.4.0", "v1.3.2", "v1.3.1"].map((tagName, index) => ({
  id: index + 1,
  reactionSubject: { kind: "release", id: `RE_preview_${index + 1}` },
  tagName,
  targetCommitish: "main",
  name: `${tagName} — Workspace improvements`,
  body,
  url: `https://github.com/harbor-preview/harbor/releases/tag/${tagName}`,
  draft: index === 1,
  prerelease: index === 2,
  immutable: false,
  createdAt: timestamp,
  publishedAt: timestamp,
  author: "harbor-preview",
  hasZipball: true,
  hasTarball: true,
  assets: [
    {
      id: index + 1,
      name: `Harbor_${tagName}_aarch64.dmg`,
      state: "uploaded",
      contentType: "application/octet-stream",
      size: 12480000,
      downloadCount: 124,
      createdAt: timestamp,
      updatedAt: timestamp,
      uploader: "harbor-preview",
    },
  ],
}));
const dependency: Data.GitHubDependabotAlertSummary = {
  kind: "dependabot",
  number: 1,
  state: "open",
  severity: "high",
  title: "Dependency input validation needs an update",
  packageName: "preview-parser",
  ecosystem: "npm",
  manifestPath: "package.json",
  scope: "runtime",
  relationship: "direct",
  url: "https://github.com/harbor-preview/harbor/security/dependabot/1",
  createdAt: timestamp,
  updatedAt: timestamp,
  assignees: [{ login: "alex-morgan" }],
};
const codeAlert: Data.GitHubCodeScanningAlertSummary = {
  kind: "codeScanning",
  number: 2,
  state: "open",
  severity: "medium",
  title: "Validate the workspace path before reading a file",
  ruleId: "preview/path-validation",
  toolName: "CodeQL",
  path: "src/workspace.ts",
  startLine: 12,
  message: "Check the path against the selected workspace root.",
  reference: "refs/heads/main",
  url: "https://github.com/harbor-preview/harbor/security/code-scanning/2",
  createdAt: timestamp,
  updatedAt: timestamp,
  assignees: [],
};
const secretAlert: Data.GitHubSecretScanningAlertSummary = {
  kind: "secretScanning",
  number: 3,
  state: "open",
  title: "Review a synthetic credential alert",
  secretType: "preview_token",
  validity: "unknown",
  publiclyLeaked: false,
  multiRepo: false,
  url: "https://github.com/harbor-preview/harbor/security/secret-scanning/3",
  createdAt: timestamp,
  updatedAt: timestamp,
};

export function repositoryFixture(
  command: string,
  args: Record<string, unknown>,
  repositories: Data.GitHubRepository[],
  empty: boolean
): unknown {
  const repository = repositories.find((item) => item.name === args.repository) ?? repositories[0];
  const overview: Data.GitHubWikiOverview = {
    repositoryId: repository.id,
    enabled: true,
    initialized: !empty,
    canEdit: true,
    archived: false,
    defaultBranch: "master",
    headSha: sha,
    pages: empty ? [] : wikiPages,
    unsupportedFileCount: 0,
    truncated: false,
    stale: false,
    fetchedAt: Date.parse(timestamp) / 1000,
    webUrl: `${repository.url}/wiki`,
  };
  const selectedWiki = wikiPages.find((item) => item.path === args.path) ?? wikiPages[0];
  const revision: Data.GitHubWikiRevisionSummary = {
    sha,
    shortSha: sha.slice(0, 7),
    message: "Document workspace navigation and review controls",
    authorName: "Harbor Preview",
    authoredAt: Date.parse(timestamp) / 1000,
  };
  const kind = args.kind;
  const alert: Data.GitHubSecurityAlertSummary =
    kind === "codeScanning" ? codeAlert : kind === "secretScanning" ? secretAlert : dependency;
  const weeks = Array.from({ length: empty ? 0 : 12 }, (_, index) => ({
    week: Date.UTC(2026, 5, 7 + index * 7) / 1000,
    total: 6 + ((index * 7) % 24),
  }));
  switch (command) {
    case "github_list_repository_workflows":
      return empty ? [] : workflows;
    case "github_list_repository_workflow_runs": {
      const filtered = empty
        ? []
        : runs.filter((run) => !args.workflowId || run.workflowId === args.workflowId);
      return {
        ...page,
        runs: filtered,
        totalCount: filtered.length,
      } satisfies Data.GitHubWorkflowRunPage;
    }
    case "github_get_repository_workflow_run":
      return runs.find((run) => run.id === args.runId) ?? runs[0];
    case "github_get_workflow_run_filter_options":
      return {
        branches: ["main", "feature/workspace-surfaces"],
        events: ["pull_request", "push", "workflow_dispatch"],
        actors: ["harbor-preview", "alex-morgan"],
      } satisfies Data.GitHubWorkflowRunFilterOptions;
    case "github_get_workflow_dispatch_options":
      return {
        workflows,
        references: [
          { name: "main", kind: "branch" },
          { name: "v1.4.0", kind: "tag" },
        ],
      } satisfies Data.GitHubWorkflowDispatchOptions;
    case "github_get_workflow_dispatch_config":
      return {
        workflow: workflows.find((item) => item.id === args.workflowId) ?? workflows[0],
        reference: String(args.reference ?? "main"),
        dispatchable: true,
        inputs: [
          {
            name: "environment",
            description: "Choose the preview environment",
            required: true,
            inputType: "choice",
            defaultValue: "preview",
            options: ["preview", "staging"],
          },
          {
            name: "include_artifacts",
            description: "Keep build artifacts",
            required: false,
            inputType: "boolean",
            defaultValue: true,
            options: [],
          },
        ],
      } satisfies Data.GitHubWorkflowDispatchConfig;
    case "github_list_workflow_run_jobs":
      return {
        ...page,
        totalCount: empty ? 0 : 2,
        jobs: empty
          ? []
          : ["Frontend checks", "Native build"].map((name, index) => ({
              id: index + 1,
              name,
              status: "completed",
              conclusion: args.runId === 3 && index === 0 ? "failure" : "success",
              startedAt: timestamp,
              completedAt: "2026-09-01T10:05:00Z",
              runnerName: "preview-macos",
              labels: ["macos-latest"],
              url: `${repository.url}/actions/runs/1/job/${index + 1}`,
              steps: [
                "Check out repository",
                "Install dependencies",
                "Run checks",
                "Upload artifacts",
              ].map((name, index) => ({
                name,
                number: index + 1,
                status: "completed",
                conclusion: "success",
                startedAt: timestamp,
                completedAt: "2026-09-01T10:01:00Z",
              })),
            })),
      } satisfies Data.GitHubWorkflowJobPage;
    case "github_get_workflow_job_log":
      return {
        jobId: Number(args.jobId ?? 1),
        content:
          "2026-09-01T10:00:00Z Preparing workspace\n2026-09-01T10:00:01Z Installing dependencies\n2026-09-01T10:00:30Z Running TypeScript and UI checks\n2026-09-01T10:01:00Z All checks passed\n",
        truncated: false,
      } satisfies Data.GitHubWorkflowJobLog;
    case "github_list_workflow_run_artifacts":
      return {
        ...page,
        totalCount: empty ? 0 : 1,
        artifacts: empty
          ? []
          : [
              {
                id: 1,
                name: "harbor-preview-macos",
                sizeInBytes: 12480000,
                expired: false,
                createdAt: timestamp,
                expiresAt: "2026-12-01T10:00:00Z",
              },
            ],
      } satisfies Data.GitHubWorkflowArtifactPage;
    case "github_list_repository_releases":
      return { ...page, releases: empty ? [] : releases } satisfies Data.GitHubReleasePage;
    case "github_get_repository_release":
      return releases.find((release) => release.id === args.releaseId) ?? releases[0];
    case "github_get_repository_wiki":
      return overview;
    case "github_get_repository_wiki_page":
      return {
        ...selectedWiki,
        content: `# ${selectedWiki.title}\n\n${body}`,
        headSha: sha,
      } satisfies Data.GitHubWikiPage;
    case "github_search_repository_wiki":
      return {
        pages: empty
          ? []
          : wikiPages.filter((item) =>
              item.title.toLowerCase().includes(String(args.query ?? "").toLowerCase())
            ),
        truncated: false,
      } satisfies Data.GitHubWikiSearchResult;
    case "github_list_repository_wiki_history":
      return {
        revisions: empty ? [] : [revision],
        page: 1,
        hasMore: false,
        truncated: false,
      } satisfies Data.GitHubWikiHistoryPage;
    case "github_get_repository_wiki_revision":
      return {
        revision,
        path: selectedWiki.path,
        blobSha: sha,
        content: body,
        deleted: false,
        markdown: true,
      } satisfies Data.GitHubWikiRevision;
    case "github_compare_repository_wiki_revisions":
      return {
        path: selectedWiki.path,
        baseSha: sha,
        headSha: sha,
        patch: "@@ -1 +1 @@\n-Workspace notes\n+Workspace navigation and reviews",
        additions: 1,
        deletions: 1,
        truncated: false,
      } satisfies Data.GitHubWikiComparison;
    case "github_get_repository_insights_overview":
      return {
        community: {
          healthPercentage: empty ? 0 : 80,
          description: repository.description,
          documentation: `${repository.url}/wiki`,
          updatedAt: timestamp,
          files: ["readme", "license", "contributing", "code_of_conduct", "issue_template"].map(
            (key, index) => ({
              key,
              name: key.replace(/_/g, " "),
              present: index < 4,
              url: index < 4 ? `${repository.url}/blob/main/${key}.md` : undefined,
            })
          ),
        },
        commitActivity: { status: "ready", weeks },
        codeFrequency: {
          status: "ready",
          weeks: weeks.map(({ week, total }) => ({
            week,
            additions: total * 8,
            deletions: -total * 3,
          })),
        },
      } satisfies Data.GitHubRepositoryInsightsOverview;
    case "github_get_repository_insights_contributors":
      return {
        status: "ready",
        contributors: empty
          ? []
          : ["harbor-preview", "alex-morgan", "lin-chen", "sam-rivera"].map((login, index) => ({
              login,
              total: 148 - index * 31,
              additions: 1200 - index * 124,
              deletions: 260 - index * 48,
            })),
      } satisfies Data.GitHubRepositoryInsightsContributors;
    case "github_get_repository_insights_traffic": {
      const points = Array.from({ length: empty ? 0 : 14 }, (_, index) => ({
        timestamp: new Date(Date.UTC(2026, 7, 19 + index)).toISOString(),
        count: 12 + index * 3,
        uniques: 8 + index,
      }));
      const series = {
        count: points.reduce((sum, point) => sum + point.count, 0),
        uniques: points.reduce((sum, point) => sum + point.uniques, 0),
        points,
      };
      return {
        period: args.period === "week" ? "week" : "day",
        views: series,
        clones: series,
        referrers: empty ? [] : [{ referrer: "github.com", count: 210, uniques: 120 }],
        paths: empty
          ? []
          : [
              {
                path: "/harbor-preview/harbor",
                title: "Harbor workspace",
                url: repository.url,
                count: 180,
                uniques: 90,
              },
            ],
      } satisfies Data.GitHubRepositoryInsightsTraffic;
    }
    case "github_list_repository_security_alerts":
      return { ...page, alerts: empty ? [] : [alert] } satisfies Data.GitHubSecurityAlertPage;
    case "github_get_repository_security_alert": {
      if (kind === "codeScanning")
        return {
          kind,
          alert: codeAlert,
          description: body,
          help: "Validate the selected path before passing it to a file operation.",
          tags: ["security", "correctness"],
        } satisfies Data.GitHubCodeScanningAlertDetail;
      if (kind === "secretScanning")
        return {
          kind,
          alert: secretAlert,
          pushProtectionBypassed: false,
          metadata: [{ key: "Fixture", value: "Synthetic alert; no real credential is present." }],
        } satisfies Data.GitHubSecretScanningAlertDetail;
      return {
        kind: "dependabot",
        alert: dependency,
        description: body,
        ghsaId: "GHSA-preview-only",
        vulnerableVersionRange: "< 1.4.0",
        firstPatchedVersion: "1.4.0",
        cvssScore: 7.5,
        cwes: [{ id: "CWE-20", name: "Improper input validation" }],
        references: [repository.url],
        publishedAt: timestamp,
      } satisfies Data.GitHubDependabotAlertDetail;
    }
    case "github_list_repository_code_scanning_instances":
      return {
        ...page,
        instances: empty
          ? []
          : [
              {
                state: "open",
                reference: "refs/heads/main",
                commitSha: sha,
                message: "Check the selected workspace path.",
                path: "src/workspace.ts",
                startLine: 12,
                endLine: 14,
                classifications: ["source"],
              },
            ],
      } satisfies Data.GitHubCodeScanningInstancePage;
    case "github_list_repository_secret_scanning_locations":
      return {
        ...page,
        locations: empty
          ? []
          : [
              {
                kind: "commit",
                path: "docs/example.env",
                startLine: 1,
                endLine: 1,
                commitSha: sha,
                url: `${repository.url}/blob/main/docs/example.env`,
              },
            ],
      } satisfies Data.GitHubSecretScanningLocationPage;
    default:
      return undefined;
  }
}
