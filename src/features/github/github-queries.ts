import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubBlame,
  GitHubCodeOverview,
  GitHubCodeSearchPage,
  GitHubCommitDetailPage,
  GitHubCheckPage,
  GitHubCheckSuite,
  GitHubConversationControls,
  GitHubConversationKind,
  GitHubContentListing,
  GitHubDiscussionAnsweredFilter,
  GitHubDiscussionCategoryPage,
  GitHubDiscussionDetailPage,
  GitHubDiscussionPage,
  GitHubDiscussionSort,
  GitHubDiscussionStateFilter,
  GitHubDeveloperFeedPage,
  GitHubDiscoverySearchKind,
  GitHubDiscoverySearchPage,
  GitHubDiscoverySearchSort,
  GitHubFilePreview,
  GitHubGist,
  GitHubGistCommentPage,
  GitHubGistPage,
  GitHubGistRevisionDetail,
  GitHubGistRevisionPage,
  GitHubGistSource,
  GitHubIssueAssignment,
  GitHubIssueAssigneePage,
  GitHubIssueDetailPage,
  GitHubIssueInboxPage,
  GitHubIssueInboxScope,
  GitHubIssueLabelPage,
  GitHubIssueMilestonePage,
  GitHubIssuePage,
  GitHubIssueSort,
  GitHubIssueState,
  GitHubInsightsTrafficPeriod,
  GitHubNotificationPage,
  GitHubPackage,
  GitHubPackagePage,
  GitHubPackageType,
  GitHubPackageVersionPage,
  GitHubPackageVersionState,
  GitHubPackageVisibility,
  GitHubReceivedRepositoryInvitationPage,
  GitHubPagesHealth,
  GitHubPagesWorkspace,
  GitHubContributionSummary,
  GitHubProfileActivityPage,
  GitHubProfileConnectionKind,
  GitHubPendingPullRequestReview,
  GitHubProjectDetail,
  GitHubProjectPage,
  GitHubProjectSort,
  GitHubProjectStateFilter,
  GitHubPullRequestAutoMergeStatus,
  GitHubPullRequestBranchUpdateStatus,
  GitHubPullRequestCommitPage,
  GitHubPullRequestComparison,
  GitHubPullRequestDetailPage,
  GitHubPullRequestFilePage,
  GitHubPullRequestFileViewStateSnapshot,
  GitHubPullRequestInboxScope,
  GitHubPullRequestMergeQueueStatus,
  GitHubPullRequestPage,
  GitHubPullRequestReviewThreadPage,
  GitHubPullRequestReviewTeamPage,
  GitHubPullRequestSort,
  GitHubPullRequestState,
  GitHubReactionSubject,
  GitHubReactionSubjectRef,
  GitHubRelease,
  GitHubReleasePage,
  GitHubRepositoryPage,
  GitHubRepositoryInsightsContributors,
  GitHubRepositoryInsightsOverview,
  GitHubRepositoryInsightsTraffic,
  GitHubRepositoryCollaboratorPage,
  GitHubRepositoryCreationOptions,
  GitHubRepositoryInvitationPage,
  GitHubRepositoryRelationship,
  GitHubRepositorySettings,
  GitHubRepositoryCommitPage,
  GitHubCodeScanningInstancePage,
  GitHubSecretScanningLocationPage,
  GitHubSecurityAlertDetail,
  GitHubSecurityAlertKind,
  GitHubSecurityAlertPage,
  GitHubSecurityAlertSeverityFilter,
  GitHubSecurityAlertSort,
  GitHubSecurityAlertStateFilter,
  GitHubStarredRepositoryPage,
  GitHubStarredRepositorySort,
  GitHubTagPage,
  GitHubWorkflow,
  GitHubWorkflowArtifactPage,
  GitHubWorkflowDispatchConfig,
  GitHubWorkflowDispatchOptions,
  GitHubWorkflowJobLog,
  GitHubWorkflowJobPage,
  GitHubWorkflowRun,
  GitHubWorkflowRunPage,
  GitHubWorkflowRunFilterOptions,
  GitHubWorkflowRunFilters,
  GitHubWikiOverview,
  GitHubWikiComparison,
  GitHubWikiHistoryPage,
  GitHubWikiPage,
  GitHubWikiRevision,
  GitHubWikiSearchResult,
  GitHubUserPage,
  GitHubUserProfile,
} from "./github-data";

const GITHUB_QUERY_STALE_TIME = 60_000;

type GitHubCodeTarget = {
  owner: string;
  repository: string;
  reference: string;
};

type GitHubContentsTarget = GitHubCodeTarget & {
  path: string;
};

export type GitHubRepositoryTarget = Pick<GitHubCodeTarget, "owner" | "repository">;

export type GitHubReactionsTarget = GitHubRepositoryTarget & {
  subjects: GitHubReactionSubjectRef[];
};

export type GitHubReactionTarget = GitHubRepositoryTarget & {
  subject: GitHubReactionSubjectRef;
};

type GitHubInsightsTrafficTarget = GitHubRepositoryTarget & {
  period: GitHubInsightsTrafficPeriod;
};

export type GitHubWikiPageTarget = GitHubRepositoryTarget & {
  repositoryId: number;
  headSha: string;
  path: string;
};

export type GitHubWikiHistoryTarget = GitHubWikiPageTarget & {
  page: number;
};

export type GitHubWikiRevisionTarget = GitHubRepositoryTarget & {
  repositoryId: number;
  commitSha: string;
  path: string;
};

export type GitHubWikiComparisonTarget = GitHubRepositoryTarget & {
  repositoryId: number;
  path: string;
  baseSha: string;
  headSha: string;
};

export type GitHubWikiSearchTarget = GitHubRepositoryTarget & {
  repositoryId: number;
  headSha: string;
  query: string;
};

export type GitHubDiscussionsTarget = GitHubRepositoryTarget & {
  categoryId: string | null;
  state: GitHubDiscussionStateFilter;
  answered: GitHubDiscussionAnsweredFilter;
  sort: GitHubDiscussionSort;
};

export type GitHubDiscussionTarget = GitHubRepositoryTarget & {
  discussionNumber: number;
};

export type GitHubConversationTarget = GitHubRepositoryTarget & {
  conversationNumber: number;
  conversationKind: GitHubConversationKind;
};

export type GitHubReleasesTarget = GitHubRepositoryTarget & {
  page: number;
};

export type GitHubReleaseTarget = GitHubRepositoryTarget & {
  releaseId: number;
};

export type GitHubIssuesTarget = GitHubRepositoryTarget & {
  state: GitHubIssueState;
  assignment: GitHubIssueAssignment;
  query: string;
  label: string;
  sort: GitHubIssueSort;
  page: number;
};

export type GitHubIssueInboxTarget = {
  scope: GitHubIssueInboxScope;
  state: GitHubIssueState;
  query: string;
  sort: GitHubIssueSort;
  page: number;
};

type GitHubIssueDetailTarget = GitHubRepositoryTarget & {
  issueNumber: number;
  timelinePage: number;
};

export type GitHubPullRequestsTarget = GitHubRepositoryTarget & {
  state: GitHubPullRequestState;
  query: string;
  label: string;
  sort: GitHubPullRequestSort;
  page: number;
};

export type GitHubPullRequestInboxTarget = {
  scope: GitHubPullRequestInboxScope;
  state: GitHubPullRequestState;
  query: string;
  sort: GitHubPullRequestSort;
  page: number;
};

export type GitHubNotificationsTarget = {
  participating: boolean;
  page: number;
};

export type GitHubProjectsTarget = {
  state: GitHubProjectStateFilter;
  query: string;
  sort: GitHubProjectSort;
};

export type GitHubStarredRepositoriesTarget = {
  sort: GitHubStarredRepositorySort;
};

export type GitHubGistsTarget = {
  source: GitHubGistSource;
};

export type GitHubPackagesTarget = {
  packageType: GitHubPackageType;
  visibility: GitHubPackageVisibility | null;
  page: number;
};

export type GitHubPackageTarget = {
  packageType: GitHubPackageType;
  packageName: string;
};

export type GitHubPackageVersionsTarget = GitHubPackageTarget & {
  state: GitHubPackageVersionState;
  page: number;
};

export type GitHubGistTarget = {
  gistId: string;
};

export type GitHubGistRevisionTarget = GitHubGistTarget & {
  version: string;
};

export type GitHubProfileTarget = {
  username: string | null;
};

export type GitHubProfileConnectionTarget = {
  username: string;
  kind: GitHubProfileConnectionKind;
};

export type GitHubProfileActivityTarget = {
  username: string;
};

export type GitHubDiscoverySearchTarget = {
  kind: GitHubDiscoverySearchKind;
  query: string;
  sort: GitHubDiscoverySearchSort;
  page: number;
};

export type GitHubProjectTarget = {
  number: number;
  query: string;
  archived: boolean;
};

export type GitHubPagesTarget = GitHubRepositoryTarget & {
  page: number;
};

export type GitHubSecurityAlertsTarget = GitHubRepositoryTarget & {
  kind: GitHubSecurityAlertKind;
  state: GitHubSecurityAlertStateFilter;
  severity: GitHubSecurityAlertSeverityFilter;
  sort: GitHubSecurityAlertSort;
  page: number;
};

export type GitHubSecurityAlertTarget = GitHubRepositoryTarget & {
  kind: GitHubSecurityAlertKind;
  alertNumber: number;
};

export type GitHubSecurityEvidenceTarget = GitHubRepositoryTarget & {
  alertNumber: number;
  page: number;
};

export type GitHubPullRequestTarget = GitHubRepositoryTarget & {
  pullRequestNumber: number;
};

export type GitHubPullRequestComparisonTarget = GitHubRepositoryTarget & {
  base: string;
  head: string;
};

type GitHubPullRequestDetailTarget = GitHubPullRequestTarget & {
  timelinePage: number;
};

type GitHubPullRequestPageTarget = GitHubPullRequestTarget & {
  page: number;
};

export type GitHubPullRequestReviewThreadsTarget = GitHubPullRequestTarget;

type GitHubChecksTarget = GitHubRepositoryTarget & {
  reference: string;
  page: number;
};

type GitHubCheckSuiteTarget = GitHubRepositoryTarget & {
  checkSuiteId: number;
};

type GitHubCheckSuiteRunsTarget = GitHubCheckSuiteTarget & {
  page: number;
};

export type GitHubWorkflowRunsTarget = GitHubRepositoryTarget &
  GitHubWorkflowRunFilters & {
    workflowId: number | null;
    page: number;
  };

export type GitHubWorkflowRunFilterOptionsTarget = GitHubRepositoryTarget & {
  workflowId: number | null;
};

type GitHubWorkflowRunTarget = GitHubRepositoryTarget & {
  runId: number;
};

export type GitHubWorkflowDispatchConfigTarget = GitHubRepositoryTarget & {
  workflowId: number;
  reference: string;
};

export type GitHubWorkflowJobsTarget = GitHubWorkflowRunTarget & {
  page: number;
};

export type GitHubWorkflowArtifactsTarget = GitHubWorkflowRunTarget & {
  page: number;
};

type GitHubWorkflowJobLogTarget = GitHubWorkflowRunTarget & {
  jobId: number;
};

type GitHubRepositoryCommitsTarget = GitHubContentsTarget & {
  page: number;
};

export type GitHubCommitDetailTarget = GitHubRepositoryTarget & {
  commitSha: string;
};

type GitHubTagsTarget = GitHubRepositoryTarget & {
  page: number;
};

type GitHubCodeSearchTarget = GitHubRepositoryTarget & {
  query: string;
  page: number;
};

export const githubQueryKeys = {
  all: ["github"] as const,
  repositories: ["github", "repositories"] as const,
  discoverySearch: ({ kind, query, sort, page }: GitHubDiscoverySearchTarget) =>
    ["github", "discovery", "search", kind, query, sort, page] as const,
  developerFeed: ["github", "discovery", "feed"] as const,
  starredRepositories: ({ sort }: GitHubStarredRepositoriesTarget) =>
    ["github", "starred-repositories", sort] as const,
  starredRepositoriesRoot: ["github", "starred-repositories"] as const,
  repositoryRelationship: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "relationship"] as const,
  repositoryCreationOptions: ["github", "repository-creation-options"] as const,
  repositorySettings: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "settings"] as const,
  repositoryInsightsRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "insights"] as const,
  repositoryInsightsOverview: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "insights", "overview"] as const,
  repositoryInsightsContributors: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "insights", "contributors"] as const,
  repositoryInsightsTraffic: ({ owner, repository, period }: GitHubInsightsTrafficTarget) =>
    ["github", "repository", owner, repository, "insights", "traffic", period] as const,
  repositoryWiki: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "wiki"] as const,
  repositoryWikiPage: ({ owner, repository, headSha, path }: GitHubWikiPageTarget) =>
    ["github", "repository", owner, repository, "wiki", "page", headSha, path] as const,
  repositoryWikiSearch: ({ owner, repository, headSha, query }: GitHubWikiSearchTarget) =>
    ["github", "repository", owner, repository, "wiki", "search", headSha, query] as const,
  repositoryWikiHistory: ({ owner, repository, headSha, path, page }: GitHubWikiHistoryTarget) =>
    ["github", "repository", owner, repository, "wiki", "history", headSha, path, page] as const,
  repositoryWikiRevision: ({ owner, repository, commitSha, path }: GitHubWikiRevisionTarget) =>
    ["github", "repository", owner, repository, "wiki", "revision", commitSha, path] as const,
  repositoryWikiComparison: ({
    owner,
    repository,
    baseSha,
    headSha,
    path,
  }: GitHubWikiComparisonTarget) =>
    ["github", "repository", owner, repository, "wiki", "compare", baseSha, headSha, path] as const,
  repositoryAccess: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "access"] as const,
  repositoryCollaborators: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "access", "collaborators"] as const,
  repositoryInvitations: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "access", "invitations"] as const,
  repositoryPages: ({ owner, repository, page }: GitHubPagesTarget) =>
    ["github", "repository", owner, repository, "pages", page] as const,
  repositoryPagesRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "pages"] as const,
  repositoryPagesHealth: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "pages-health"] as const,
  profile: ({ username }: GitHubProfileTarget) =>
    ["github", "profile", username ?? "viewer"] as const,
  profilesRoot: ["github", "profile"] as const,
  profileContributions: ({ username }: GitHubProfileActivityTarget) =>
    ["github", "profile", username, "contributions"] as const,
  profileConnections: ({ username, kind }: GitHubProfileConnectionTarget) =>
    ["github", "profile", username, kind] as const,
  profileConnectionsRoot: ({ username }: GitHubProfileActivityTarget) =>
    ["github", "profile", username] as const,
  profileActivity: ({ username }: GitHubProfileActivityTarget) =>
    ["github", "profile", username, "activity"] as const,
  gists: ({ source }: GitHubGistsTarget) => ["github", "gists", source] as const,
  gistsRoot: ["github", "gists"] as const,
  packages: ({ packageType, visibility, page }: GitHubPackagesTarget) =>
    ["github", "personal-packages", packageType, visibility ?? "all", page] as const,
  packagesRoot: ["github", "personal-packages"] as const,
  package: ({ packageType, packageName }: GitHubPackageTarget) =>
    ["github", "personal-package", packageType, packageName] as const,
  packageVersions: ({ packageType, packageName, state, page }: GitHubPackageVersionsTarget) =>
    ["github", "personal-package", packageType, packageName, "versions", state, page] as const,
  packageVersionsRoot: ({ packageType, packageName }: GitHubPackageTarget) =>
    ["github", "personal-package", packageType, packageName, "versions"] as const,
  gist: ({ gistId }: GitHubGistTarget) => ["github", "gist", gistId] as const,
  gistRoot: (gistId: string) => ["github", "gist", gistId] as const,
  gistRevisions: ({ gistId }: GitHubGistTarget) => ["github", "gist", gistId, "revisions"] as const,
  gistRevision: ({ gistId, version }: GitHubGistRevisionTarget) =>
    ["github", "gist", gistId, "revision", version] as const,
  gistComments: ({ gistId }: GitHubGistTarget) => ["github", "gist", gistId, "comments"] as const,
  notifications: ({ participating, page }: GitHubNotificationsTarget) =>
    ["github", "notifications", participating ? "participating" : "all", page] as const,
  notificationsRoot: ["github", "notifications"] as const,
  receivedRepositoryInvitations: ["github", "repository-invitations"] as const,
  projects: ({ state, query, sort }: GitHubProjectsTarget) =>
    ["github", "personal-projects", state, query, sort] as const,
  projectsRoot: ["github", "personal-projects"] as const,
  project: ({ number, query, archived }: GitHubProjectTarget) =>
    ["github", "personal-project", number, query, archived] as const,
  projectRoot: (number: number) => ["github", "personal-project", number] as const,
  securityAlerts: ({
    owner,
    repository,
    kind,
    state,
    severity,
    sort,
    page,
  }: GitHubSecurityAlertsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "security",
      kind,
      state,
      severity,
      sort,
      page,
    ] as const,
  securityAlertsRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "security"] as const,
  securityAlert: ({ owner, repository, kind, alertNumber }: GitHubSecurityAlertTarget) =>
    ["github", "repository", owner, repository, "security-alert", kind, alertNumber] as const,
  codeScanningInstances: ({ owner, repository, alertNumber, page }: GitHubSecurityEvidenceTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "code-scanning-alert",
      alertNumber,
      "instances",
      page,
    ] as const,
  codeScanningInstancesRoot: ({
    owner,
    repository,
    alertNumber,
  }: Omit<GitHubSecurityEvidenceTarget, "page">) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "code-scanning-alert",
      alertNumber,
      "instances",
    ] as const,
  secretScanningLocations: ({
    owner,
    repository,
    alertNumber,
    page,
  }: GitHubSecurityEvidenceTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "secret-scanning-alert",
      alertNumber,
      "locations",
      page,
    ] as const,
  secretScanningLocationsRoot: ({
    owner,
    repository,
    alertNumber,
  }: Omit<GitHubSecurityEvidenceTarget, "page">) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "secret-scanning-alert",
      alertNumber,
      "locations",
    ] as const,
  discussionCategories: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "discussion-categories"] as const,
  discussions: ({
    owner,
    repository,
    categoryId,
    state,
    answered,
    sort,
  }: GitHubDiscussionsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "discussions",
      categoryId,
      state,
      answered,
      sort,
    ] as const,
  discussionsRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "discussions"] as const,
  discussionDetail: ({ owner, repository, discussionNumber }: GitHubDiscussionTarget) =>
    ["github", "repository", owner, repository, "discussion", discussionNumber] as const,
  reactions: ({ owner, repository, subjects }: GitHubReactionsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "reactions",
      ...subjects.map((subject) => `${subject.kind}:${subject.id}`),
    ] as const,
  reaction: ({ owner, repository, subject }: GitHubReactionTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "reactions",
      "subject",
      subject.kind,
      subject.id,
    ] as const,
  reactionsRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "reactions"] as const,
  releases: ({ owner, repository, page }: GitHubReleasesTarget) =>
    ["github", "repository", owner, repository, "releases", page] as const,
  releasesRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "releases"] as const,
  release: ({ owner, repository, releaseId }: GitHubReleaseTarget) =>
    ["github", "repository", owner, repository, "release", releaseId] as const,
  code: ({ owner, repository, reference }: GitHubCodeTarget) =>
    ["github", "repository", owner, repository, "code", reference] as const,
  codeRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "code"] as const,
  contents: ({ owner, repository, reference, path }: GitHubContentsTarget) =>
    ["github", "repository", owner, repository, "contents", reference, path] as const,
  file: ({ owner, repository, reference, path }: GitHubContentsTarget) =>
    ["github", "repository", owner, repository, "file", reference, path] as const,
  commits: ({ owner, repository, reference, path, page }: GitHubRepositoryCommitsTarget) =>
    ["github", "repository", owner, repository, "commits", reference, path, page] as const,
  commitDetail: ({ owner, repository, commitSha }: GitHubCommitDetailTarget) =>
    ["github", "repository", owner, repository, "commit", commitSha] as const,
  tags: ({ owner, repository, page }: GitHubTagsTarget) =>
    ["github", "repository", owner, repository, "tags", page] as const,
  blame: ({ owner, repository, reference, path }: GitHubContentsTarget) =>
    ["github", "repository", owner, repository, "blame", reference, path] as const,
  codeSearch: ({ owner, repository, query, page }: GitHubCodeSearchTarget) =>
    ["github", "repository", owner, repository, "code-search", query, page] as const,
  issues: ({
    owner,
    repository,
    state,
    assignment,
    query,
    label,
    sort,
    page,
  }: GitHubIssuesTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "issues",
      state,
      assignment,
      query,
      label,
      sort,
      page,
    ] as const,
  issuesRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "issues"] as const,
  issueInbox: ({ scope, state, query, sort, page }: GitHubIssueInboxTarget) =>
    ["github", "issue-inbox", scope, state, query, sort, page] as const,
  issueInboxRoot: ["github", "issue-inbox"] as const,
  issueDetail: ({ owner, repository, issueNumber, timelinePage }: GitHubIssueDetailTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "issue",
      issueNumber,
      "timeline",
      timelinePage,
    ] as const,
  issueRoot: ({ owner, repository, issueNumber }: Omit<GitHubIssueDetailTarget, "timelinePage">) =>
    ["github", "repository", owner, repository, "issue", issueNumber] as const,
  conversationControls: ({
    owner,
    repository,
    conversationKind,
    conversationNumber,
  }: GitHubConversationTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "conversation-controls",
      conversationKind,
      conversationNumber,
    ] as const,
  issueLabels: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "issue-labels"] as const,
  issueAssignees: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "issue-assignees"] as const,
  issueMilestones: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "issue-milestones"] as const,
  pullRequests: ({
    owner,
    repository,
    state,
    query,
    label,
    sort,
    page,
  }: GitHubPullRequestsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-requests",
      state,
      query,
      label,
      sort,
      page,
    ] as const,
  pullRequestsRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "pull-requests"] as const,
  pullRequestInbox: ({ scope, state, query, sort, page }: GitHubPullRequestInboxTarget) =>
    ["github", "pull-request-inbox", scope, state, query, sort, page] as const,
  pullRequestInboxRoot: ["github", "pull-request-inbox"] as const,
  pullRequestReviewTeams: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "pull-request-review-teams"] as const,
  pullRequestDetail: ({
    owner,
    repository,
    pullRequestNumber,
    timelinePage,
  }: GitHubPullRequestDetailTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "timeline",
      timelinePage,
    ] as const,
  pullRequestDetailRoot: ({
    owner,
    repository,
    pullRequestNumber,
  }: Omit<GitHubPullRequestDetailTarget, "timelinePage">) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "timeline",
    ] as const,
  pullRequestRoot: ({ owner, repository, pullRequestNumber }: GitHubPullRequestTarget) =>
    ["github", "repository", owner, repository, "pull-request", pullRequestNumber] as const,
  pullRequestBranchUpdateStatus: ({
    owner,
    repository,
    pullRequestNumber,
  }: GitHubPullRequestTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "branch-update-status",
    ] as const,
  pullRequestAutoMergeStatus: ({ owner, repository, pullRequestNumber }: GitHubPullRequestTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "auto-merge-status",
    ] as const,
  pullRequestMergeQueueStatus: ({
    owner,
    repository,
    pullRequestNumber,
  }: GitHubPullRequestTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "merge-queue-status",
    ] as const,
  pullRequestComparison: ({ owner, repository, base, head }: GitHubPullRequestComparisonTarget) =>
    ["github", "repository", owner, repository, "pull-request-comparison", base, head] as const,
  pullRequestCommits: ({
    owner,
    repository,
    pullRequestNumber,
    page,
  }: GitHubPullRequestPageTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "commits",
      page,
    ] as const,
  pullRequestFiles: ({ owner, repository, pullRequestNumber, page }: GitHubPullRequestPageTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "files",
      page,
    ] as const,
  pullRequestFileViewStates: ({ owner, repository, pullRequestNumber }: GitHubPullRequestTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "file-view-states",
    ] as const,
  pullRequestReviewThreads: ({
    owner,
    repository,
    pullRequestNumber,
  }: GitHubPullRequestReviewThreadsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "review-threads",
    ] as const,
  pendingPullRequestReview: ({
    owner,
    repository,
    pullRequestNumber,
  }: GitHubPullRequestReviewThreadsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "pull-request",
      pullRequestNumber,
      "pending-review",
    ] as const,
  checks: ({ owner, repository, reference, page }: GitHubChecksTarget) =>
    ["github", "repository", owner, repository, "checks", reference, page] as const,
  checksRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "checks"] as const,
  checkSuite: ({ owner, repository, checkSuiteId }: GitHubCheckSuiteTarget) =>
    ["github", "repository", owner, repository, "check-suite", checkSuiteId] as const,
  checkSuiteRuns: ({ owner, repository, checkSuiteId, page }: GitHubCheckSuiteRunsTarget) =>
    ["github", "repository", owner, repository, "check-suite", checkSuiteId, "runs", page] as const,
  workflows: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "workflows"] as const,
  workflowRuns: ({
    owner,
    repository,
    workflowId,
    status,
    branch,
    event,
    actor,
    page,
  }: GitHubWorkflowRunsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "workflow-runs",
      workflowId ?? "all",
      status,
      branch,
      event,
      actor,
      page,
    ] as const,
  workflowRunsRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "workflow-runs"] as const,
  workflowRun: ({ owner, repository, runId }: GitHubWorkflowRunTarget) =>
    ["github", "repository", owner, repository, "workflow-run", runId] as const,
  workflowRunFilterOptions: ({
    owner,
    repository,
    workflowId,
  }: GitHubWorkflowRunFilterOptionsTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "workflow-runs",
      "filters",
      workflowId ?? "all",
    ] as const,
  workflowDispatchOptions: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "workflow-dispatch", "options"] as const,
  workflowDispatchRoot: ({ owner, repository }: GitHubRepositoryTarget) =>
    ["github", "repository", owner, repository, "workflow-dispatch"] as const,
  workflowDispatchConfig: ({
    owner,
    repository,
    workflowId,
    reference,
  }: GitHubWorkflowDispatchConfigTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "workflow-dispatch",
      workflowId,
      reference,
    ] as const,
  workflowJobs: ({ owner, repository, runId, page }: GitHubWorkflowJobsTarget) =>
    ["github", "repository", owner, repository, "workflow-run", runId, "jobs", page] as const,
  workflowJobsRoot: ({ owner, repository, runId }: GitHubWorkflowRunTarget) =>
    ["github", "repository", owner, repository, "workflow-run", runId, "jobs"] as const,
  workflowArtifacts: ({ owner, repository, runId, page }: GitHubWorkflowArtifactsTarget) =>
    ["github", "repository", owner, repository, "workflow-run", runId, "artifacts", page] as const,
  workflowArtifactsRoot: ({ owner, repository, runId }: GitHubWorkflowRunTarget) =>
    ["github", "repository", owner, repository, "workflow-run", runId, "artifacts"] as const,
  workflowJobLog: ({ owner, repository, runId, jobId }: GitHubWorkflowJobLogTarget) =>
    [
      "github",
      "repository",
      owner,
      repository,
      "workflow-run",
      runId,
      "job",
      jobId,
      "log",
    ] as const,
};

export async function resetGitHubQueryCache(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: githubQueryKeys.all });
  const activeRefetch = queryClient.resetQueries({ queryKey: githubQueryKeys.all });
  queryClient.removeQueries({ queryKey: githubQueryKeys.all, type: "inactive" });
  await activeRefetch;
}

export function repositoriesQueryOptions() {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.repositories,
    queryFn: ({ pageParam }) =>
      invoke<GitHubRepositoryPage>("github_list_repositories", { page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function discoverySearchQueryOptions(target: GitHubDiscoverySearchTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.discoverySearch(target),
    queryFn: () => invoke<GitHubDiscoverySearchPage>("github_search_discovery", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function developerFeedQueryOptions() {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.developerFeed,
    queryFn: ({ pageParam }) =>
      invoke<GitHubDeveloperFeedPage>("github_list_developer_feed", { page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function starredRepositoriesQueryOptions(target: GitHubStarredRepositoriesTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.starredRepositories(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubStarredRepositoryPage>("github_list_starred_repositories", {
        sort: target.sort,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryRelationshipQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryRelationship(target),
    queryFn: () =>
      invoke<GitHubRepositoryRelationship>("github_get_repository_relationship", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCreationOptionsQueryOptions() {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryCreationOptions,
    queryFn: () =>
      invoke<GitHubRepositoryCreationOptions>("github_get_repository_creation_options"),
    staleTime: 24 * 60 * 60 * 1_000,
  });
}

export function personalRepositorySettingsQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositorySettings(target),
    queryFn: () =>
      invoke<GitHubRepositorySettings>("github_get_personal_repository_settings", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryInsightsOverviewQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryInsightsOverview(target),
    queryFn: () =>
      invoke<GitHubRepositoryInsightsOverview>("github_get_repository_insights_overview", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.commitActivity.status === "building" || data?.codeFrequency.status === "building"
        ? 5_000
        : false;
    },
  });
}

export function repositoryInsightsContributorsQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryInsightsContributors(target),
    queryFn: () =>
      invoke<GitHubRepositoryInsightsContributors>(
        "github_get_repository_insights_contributors",
        target
      ),
    staleTime: GITHUB_QUERY_STALE_TIME,
    refetchInterval: (query) => (query.state.data?.status === "building" ? 5_000 : false),
  });
}

export function repositoryInsightsTrafficQueryOptions(target: GitHubInsightsTrafficTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryInsightsTraffic(target),
    queryFn: () =>
      invoke<GitHubRepositoryInsightsTraffic>("github_get_repository_insights_traffic", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryPagesQueryOptions(target: GitHubPagesTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryPages(target),
    queryFn: () => invoke<GitHubPagesWorkspace>("github_get_repository_pages", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryPagesHealthQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryPagesHealth(target),
    queryFn: () => invoke<GitHubPagesHealth>("github_get_repository_pages_health", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function personalRepositoryCollaboratorsQueryOptions(target: GitHubRepositoryTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.repositoryCollaborators(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubRepositoryCollaboratorPage>("github_list_personal_repository_collaborators", {
        ...target,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function personalRepositoryInvitationsQueryOptions(target: GitHubRepositoryTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.repositoryInvitations(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubRepositoryInvitationPage>("github_list_personal_repository_invitations", {
        ...target,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryWikiQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryWiki(target),
    queryFn: () => invoke<GitHubWikiOverview>("github_get_repository_wiki", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryWikiPageQueryOptions(target: GitHubWikiPageTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryWikiPage(target),
    queryFn: () => invoke<GitHubWikiPage>("github_get_repository_wiki_page", target),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function repositoryWikiSearchQueryOptions(target: GitHubWikiSearchTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryWikiSearch(target),
    queryFn: () => invoke<GitHubWikiSearchResult>("github_search_repository_wiki", target),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function repositoryWikiHistoryQueryOptions(target: GitHubWikiHistoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryWikiHistory(target),
    queryFn: () => invoke<GitHubWikiHistoryPage>("github_list_repository_wiki_history", target),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function repositoryWikiRevisionQueryOptions(target: GitHubWikiRevisionTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryWikiRevision(target),
    queryFn: () => invoke<GitHubWikiRevision>("github_get_repository_wiki_revision", target),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function repositoryWikiComparisonQueryOptions(target: GitHubWikiComparisonTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.repositoryWikiComparison(target),
    queryFn: () => invoke<GitHubWikiComparison>("github_compare_repository_wiki_revisions", target),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function userProfileQueryOptions(target: GitHubProfileTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.profile(target),
    queryFn: () => invoke<GitHubUserProfile>("github_get_user_profile", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function userContributionsQueryOptions(target: GitHubProfileActivityTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.profileContributions(target),
    queryFn: () => invoke<GitHubContributionSummary>("github_get_user_contributions", target),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function profileConnectionsQueryOptions(target: GitHubProfileConnectionTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.profileConnections(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubUserPage>("github_list_profile_connections", {
        ...target,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function profileActivityQueryOptions(target: GitHubProfileActivityTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.profileActivity(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubProfileActivityPage>("github_list_profile_activity", {
        ...target,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function gistsQueryOptions(target: GitHubGistsTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.gists(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubGistPage>("github_list_gists", {
        source: target.source,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function personalPackagesQueryOptions(target: GitHubPackagesTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.packages(target),
    queryFn: () =>
      invoke<GitHubPackagePage>("github_list_personal_packages", {
        packageType: target.packageType,
        visibility: target.visibility,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function personalPackageQueryOptions(target: GitHubPackageTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.package(target),
    queryFn: () => invoke<GitHubPackage>("github_get_personal_package", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function personalPackageVersionsQueryOptions(target: GitHubPackageVersionsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.packageVersions(target),
    queryFn: () =>
      invoke<GitHubPackageVersionPage>("github_list_personal_package_versions", {
        packageType: target.packageType,
        packageName: target.packageName,
        versionState: target.state,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function gistQueryOptions(target: GitHubGistTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.gist(target),
    queryFn: () => invoke<GitHubGist>("github_get_gist", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function gistRevisionsQueryOptions(target: GitHubGistTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.gistRevisions(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubGistRevisionPage>("github_list_gist_revisions", {
        ...target,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function gistRevisionQueryOptions(target: GitHubGistRevisionTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.gistRevision(target),
    queryFn: () => invoke<GitHubGistRevisionDetail>("github_get_gist_revision", target),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function gistCommentsQueryOptions(target: GitHubGistTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.gistComments(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubGistCommentPage>("github_list_gist_comments", {
        ...target,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function notificationsQueryOptions(target: GitHubNotificationsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.notifications(target),
    queryFn: () =>
      invoke<GitHubNotificationPage>("github_list_notifications", {
        participating: target.participating,
        page: target.page,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function receivedRepositoryInvitationsQueryOptions() {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.receivedRepositoryInvitations,
    queryFn: ({ pageParam }) =>
      invoke<GitHubReceivedRepositoryInvitationPage>(
        "github_list_received_repository_invitations",
        { page: pageParam }
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: 30_000,
  });
}

export function personalProjectsQueryOptions(target: GitHubProjectsTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.projects(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubProjectPage>("github_list_personal_projects", {
        projectState: target.state,
        query: target.query,
        sort: target.sort,
        after: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.endCursor ? lastPage.endCursor : undefined,
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function personalProjectQueryOptions(target: GitHubProjectTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.project(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubProjectDetail>("github_get_personal_project", {
        number: target.number,
        query: target.query,
        archived: target.archived,
        after: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.items.hasMore && lastPage.items.endCursor ? lastPage.items.endCursor : undefined,
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function securityAlertsQueryOptions(target: GitHubSecurityAlertsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.securityAlerts(target),
    queryFn: () =>
      invoke<GitHubSecurityAlertPage>("github_list_repository_security_alerts", {
        owner: target.owner,
        repository: target.repository,
        kind: target.kind,
        alertState: target.state,
        severity: target.severity,
        sort: target.sort,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function securityAlertQueryOptions(target: GitHubSecurityAlertTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.securityAlert(target),
    queryFn: () =>
      invoke<GitHubSecurityAlertDetail>("github_get_repository_security_alert", {
        owner: target.owner,
        repository: target.repository,
        kind: target.kind,
        alertNumber: target.alertNumber,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function codeScanningInstancesQueryOptions(target: GitHubSecurityEvidenceTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.codeScanningInstances(target),
    queryFn: () =>
      invoke<GitHubCodeScanningInstancePage>("github_list_repository_code_scanning_instances", {
        owner: target.owner,
        repository: target.repository,
        alertNumber: target.alertNumber,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function secretScanningLocationsQueryOptions(target: GitHubSecurityEvidenceTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.secretScanningLocations(target),
    queryFn: () =>
      invoke<GitHubSecretScanningLocationPage>("github_list_repository_secret_scanning_locations", {
        owner: target.owner,
        repository: target.repository,
        alertNumber: target.alertNumber,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCodeQueryOptions(target: GitHubCodeTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.code(target),
    queryFn: () =>
      invoke<GitHubCodeOverview>("github_get_repository_code_overview", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryContentsQueryOptions(target: GitHubContentsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.contents(target),
    queryFn: () =>
      invoke<GitHubContentListing>("github_list_repository_contents", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
        path: target.path,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryFileQueryOptions(target: GitHubContentsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.file(target),
    queryFn: () =>
      invoke<GitHubFilePreview>("github_get_repository_file", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
        path: target.path,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCommitsQueryOptions(target: GitHubRepositoryCommitsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.commits(target),
    queryFn: () =>
      invoke<GitHubRepositoryCommitPage>("github_list_repository_commits", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
        path: target.path,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCommitDetailQueryOptions(target: GitHubCommitDetailTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.commitDetail(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubCommitDetailPage>("github_get_repository_commit", {
        owner: target.owner,
        repository: target.repository,
        commitSha: target.commitSha,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: 30 * GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryTagsQueryOptions(target: GitHubTagsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.tags(target),
    queryFn: () =>
      invoke<GitHubTagPage>("github_list_repository_tags", {
        owner: target.owner,
        repository: target.repository,
        page: target.page,
      }),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryBlameQueryOptions(target: GitHubContentsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.blame(target),
    queryFn: () =>
      invoke<GitHubBlame>("github_get_repository_blame", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
        path: target.path,
      }),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCodeSearchQueryOptions(target: GitHubCodeSearchTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.codeSearch(target),
    queryFn: () =>
      invoke<GitHubCodeSearchPage>("github_search_repository_code", {
        owner: target.owner,
        repository: target.repository,
        query: target.query,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryIssuesQueryOptions(target: GitHubIssuesTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.issues(target),
    queryFn: () =>
      invoke<GitHubIssuePage>("github_list_repository_issues", {
        owner: target.owner,
        repository: target.repository,
        issueState: target.state,
        assignment: target.assignment,
        query: target.query,
        label: target.label,
        sort: target.sort,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function discussionCategoriesQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.discussionCategories(target),
    queryFn: () =>
      invoke<GitHubDiscussionCategoryPage>("github_list_repository_discussion_categories", {
        owner: target.owner,
        repository: target.repository,
      }),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function discussionsQueryOptions(target: GitHubDiscussionsTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.discussions(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubDiscussionPage>("github_list_repository_discussions", {
        owner: target.owner,
        repository: target.repository,
        categoryId: target.categoryId,
        discussionState: target.state,
        answered: target.answered,
        sort: target.sort,
        after: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.endCursor : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function discussionDetailQueryOptions(target: GitHubDiscussionTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.discussionDetail(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubDiscussionDetailPage>("github_get_repository_discussion", {
        owner: target.owner,
        repository: target.repository,
        discussionNumber: target.discussionNumber,
        after: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.endCursor : undefined),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryReactionsQueryOptions(target: GitHubReactionsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.reactions(target),
    queryFn: () => invoke<GitHubReactionSubject[]>("github_get_repository_reactions", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryReleasesQueryOptions(target: GitHubReleasesTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.releases(target),
    queryFn: () =>
      invoke<GitHubReleasePage>("github_list_repository_releases", {
        owner: target.owner,
        repository: target.repository,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryReleaseQueryOptions(target: GitHubReleaseTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.release(target),
    queryFn: () =>
      invoke<GitHubRelease>("github_get_repository_release", {
        owner: target.owner,
        repository: target.repository,
        releaseId: target.releaseId,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function issueInboxQueryOptions(target: GitHubIssueInboxTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.issueInbox(target),
    queryFn: () =>
      invoke<GitHubIssueInboxPage>("github_list_issue_inbox", {
        scope: target.scope,
        issueState: target.state,
        query: target.query,
        sort: target.sort,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryIssueDetailQueryOptions(target: GitHubIssueDetailTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.issueDetail(target),
    queryFn: () =>
      invoke<GitHubIssueDetailPage>("github_get_repository_issue", {
        owner: target.owner,
        repository: target.repository,
        issueNumber: target.issueNumber,
        timelinePage: target.timelinePage,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryConversationControlsQueryOptions(target: GitHubConversationTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.conversationControls(target),
    queryFn: () =>
      invoke<GitHubConversationControls>("github_get_repository_conversation_controls", target),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryIssueLabelsQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.issueLabels(target),
    queryFn: () =>
      invoke<GitHubIssueLabelPage>("github_list_repository_issue_labels", {
        owner: target.owner,
        repository: target.repository,
      }),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryIssueAssigneesQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.issueAssignees(target),
    queryFn: () =>
      invoke<GitHubIssueAssigneePage>("github_list_repository_issue_assignees", {
        owner: target.owner,
        repository: target.repository,
      }),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryIssueMilestonesQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.issueMilestones(target),
    queryFn: () =>
      invoke<GitHubIssueMilestonePage>("github_list_repository_issue_milestones", {
        owner: target.owner,
        repository: target.repository,
      }),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryPullRequestsQueryOptions(target: GitHubPullRequestsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequests(target),
    queryFn: () =>
      invoke<GitHubPullRequestPage>("github_list_repository_pull_requests", {
        owner: target.owner,
        repository: target.repository,
        pullRequestState: target.state,
        query: target.query,
        label: target.label,
        sort: target.sort,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestInboxQueryOptions(target: GitHubPullRequestInboxTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestInbox(target),
    queryFn: () =>
      invoke<GitHubPullRequestPage>("github_list_pull_request_inbox", {
        scope: target.scope,
        pullRequestState: target.state,
        query: target.query,
        sort: target.sort,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryPullRequestDetailQueryOptions(target: GitHubPullRequestDetailTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestDetail(target),
    queryFn: () =>
      invoke<GitHubPullRequestDetailPage>("github_get_repository_pull_request", {
        owner: target.owner,
        repository: target.repository,
        pullRequestNumber: target.pullRequestNumber,
        timelinePage: target.timelinePage,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestBranchUpdateStatusQueryOptions(target: GitHubPullRequestTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestBranchUpdateStatus(target),
    queryFn: () =>
      invoke<GitHubPullRequestBranchUpdateStatus>(
        "github_get_repository_pull_request_branch_update_status",
        target
      ),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestAutoMergeStatusQueryOptions(target: GitHubPullRequestTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestAutoMergeStatus(target),
    queryFn: () =>
      invoke<GitHubPullRequestAutoMergeStatus>(
        "github_get_repository_pull_request_auto_merge_status",
        target
      ),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestMergeQueueStatusQueryOptions(target: GitHubPullRequestTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestMergeQueueStatus(target),
    queryFn: () =>
      invoke<GitHubPullRequestMergeQueueStatus>(
        "github_get_repository_pull_request_merge_queue_status",
        target
      ),
    staleTime: GITHUB_QUERY_STALE_TIME,
    refetchInterval: (query) => (query.state.data?.state === "queued" ? 10_000 : false),
  });
}

export function pullRequestComparisonQueryOptions(target: GitHubPullRequestComparisonTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestComparison(target),
    queryFn: () =>
      invoke<GitHubPullRequestComparison>(
        "github_compare_repository_pull_request_branches",
        target
      ),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryPullRequestReviewTeamsQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestReviewTeams(target),
    queryFn: () =>
      invoke<GitHubPullRequestReviewTeamPage>(
        "github_list_repository_pull_request_review_teams",
        target
      ),
    staleTime: 5 * GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestCommitsQueryOptions(target: GitHubPullRequestPageTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestCommits(target),
    queryFn: () =>
      invoke<GitHubPullRequestCommitPage>("github_list_pull_request_commits", {
        owner: target.owner,
        repository: target.repository,
        pullRequestNumber: target.pullRequestNumber,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestFilesQueryOptions(target: GitHubPullRequestPageTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestFiles(target),
    queryFn: () =>
      invoke<GitHubPullRequestFilePage>("github_list_pull_request_files", {
        owner: target.owner,
        repository: target.repository,
        pullRequestNumber: target.pullRequestNumber,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestFileViewStatesQueryOptions(target: GitHubPullRequestTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pullRequestFileViewStates(target),
    queryFn: () =>
      invoke<GitHubPullRequestFileViewStateSnapshot>(
        "github_get_repository_pull_request_file_view_states",
        {
          owner: target.owner,
          repository: target.repository,
          pullRequestNumber: target.pullRequestNumber,
        }
      ),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pullRequestReviewThreadsQueryOptions(target: GitHubPullRequestReviewThreadsTarget) {
  return infiniteQueryOptions({
    queryKey: githubQueryKeys.pullRequestReviewThreads(target),
    queryFn: ({ pageParam }) =>
      invoke<GitHubPullRequestReviewThreadPage>("github_list_pull_request_review_threads", {
        owner: target.owner,
        repository: target.repository,
        pullRequestNumber: target.pullRequestNumber,
        after: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.endCursor ? lastPage.endCursor : undefined,
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function pendingPullRequestReviewQueryOptions(target: GitHubPullRequestReviewThreadsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.pendingPullRequestReview(target),
    queryFn: () =>
      invoke<GitHubPendingPullRequestReview | null>(
        "github_get_pending_repository_pull_request_review",
        {
          owner: target.owner,
          repository: target.repository,
          pullRequestNumber: target.pullRequestNumber,
        }
      ),
  });
}

export function repositoryChecksQueryOptions(target: GitHubChecksTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.checks(target),
    queryFn: () =>
      invoke<GitHubCheckPage>("github_list_repository_checks", {
        owner: target.owner,
        repository: target.repository,
        reference: target.reference,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCheckSuiteQueryOptions(target: GitHubCheckSuiteTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.checkSuite(target),
    queryFn: () =>
      invoke<GitHubCheckSuite>("github_get_repository_check_suite", {
        owner: target.owner,
        repository: target.repository,
        checkSuiteId: target.checkSuiteId,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryCheckSuiteRunsQueryOptions(target: GitHubCheckSuiteRunsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.checkSuiteRuns(target),
    queryFn: () =>
      invoke<GitHubCheckPage>("github_list_repository_check_suite_runs", {
        owner: target.owner,
        repository: target.repository,
        checkSuiteId: target.checkSuiteId,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryWorkflowRunQueryOptions(target: GitHubWorkflowRunTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowRun(target),
    queryFn: () =>
      invoke<GitHubWorkflowRun>("github_get_repository_workflow_run", {
        owner: target.owner,
        repository: target.repository,
        runId: target.runId,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryWorkflowRunsQueryOptions(target: GitHubWorkflowRunsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowRuns(target),
    queryFn: () =>
      invoke<GitHubWorkflowRunPage>("github_list_repository_workflow_runs", {
        owner: target.owner,
        repository: target.repository,
        workflowId: target.workflowId,
        status: target.status,
        branch: target.branch,
        event: target.event,
        actor: target.actor,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryWorkflowRunFilterOptionsQueryOptions(
  target: GitHubWorkflowRunFilterOptionsTarget
) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowRunFilterOptions(target),
    queryFn: () =>
      invoke<GitHubWorkflowRunFilterOptions>("github_get_workflow_run_filter_options", {
        owner: target.owner,
        repository: target.repository,
        workflowId: target.workflowId,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function repositoryWorkflowsQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflows(target),
    queryFn: () =>
      invoke<GitHubWorkflow[]>("github_list_repository_workflows", {
        owner: target.owner,
        repository: target.repository,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function workflowDispatchOptionsQueryOptions(target: GitHubRepositoryTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowDispatchOptions(target),
    queryFn: () =>
      invoke<GitHubWorkflowDispatchOptions>("github_get_workflow_dispatch_options", {
        owner: target.owner,
        repository: target.repository,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function workflowDispatchConfigQueryOptions(target: GitHubWorkflowDispatchConfigTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowDispatchConfig(target),
    queryFn: () =>
      invoke<GitHubWorkflowDispatchConfig>("github_get_workflow_dispatch_config", {
        owner: target.owner,
        repository: target.repository,
        workflowId: target.workflowId,
        reference: target.reference,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function workflowRunJobsQueryOptions(target: GitHubWorkflowJobsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowJobs(target),
    queryFn: () =>
      invoke<GitHubWorkflowJobPage>("github_list_workflow_run_jobs", {
        owner: target.owner,
        repository: target.repository,
        runId: target.runId,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function workflowRunArtifactsQueryOptions(target: GitHubWorkflowArtifactsTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowArtifacts(target),
    queryFn: () =>
      invoke<GitHubWorkflowArtifactPage>("github_list_workflow_run_artifacts", {
        owner: target.owner,
        repository: target.repository,
        runId: target.runId,
        page: target.page,
      }),
    staleTime: GITHUB_QUERY_STALE_TIME,
  });
}

export function workflowJobLogQueryOptions(target: GitHubWorkflowJobLogTarget) {
  return queryOptions({
    queryKey: githubQueryKeys.workflowJobLog(target),
    queryFn: () =>
      invoke<GitHubWorkflowJobLog>("github_get_workflow_job_log", {
        owner: target.owner,
        repository: target.repository,
        jobId: target.jobId,
      }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
