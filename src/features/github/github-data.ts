export type GitHubRepository = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  url: string;
  language?: string;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  updatedAt?: string;
};

export type GitHubRepositoryPage = {
  repositories: GitHubRepository[];
  page: number;
  hasMore: boolean;
};

export type GitHubWikiPageKind = "home" | "page" | "sidebar" | "footer";

export type GitHubWikiPageSummary = {
  path: string;
  title: string;
  kind: GitHubWikiPageKind;
  markdown: boolean;
  blobSha: string;
  byteSize: number;
};

export type GitHubWikiOverview = {
  repositoryId: number;
  enabled: boolean;
  initialized: boolean;
  canEdit: boolean;
  archived: boolean;
  defaultBranch?: string;
  headSha?: string;
  pages: GitHubWikiPageSummary[];
  sidebar?: GitHubWikiPageSummary;
  footer?: GitHubWikiPageSummary;
  unsupportedFileCount: number;
  truncated: boolean;
  stale: boolean;
  fetchedAt?: number;
  webUrl: string;
};

export type GitHubWikiPage = GitHubWikiPageSummary & {
  content: string;
  headSha: string;
};

export type GitHubWikiSearchResult = {
  pages: GitHubWikiPageSummary[];
  truncated: boolean;
};

export type GitHubWikiPageMutationInput = {
  originalPath?: string;
  title: string;
  content: string;
  expectedHead: string;
  expectedBlobSha?: string;
  message?: string;
};

export type GitHubWikiMutationResult = {
  overview: GitHubWikiOverview;
  page?: GitHubWikiPage;
};

export type GitHubWikiRevisionSummary = {
  sha: string;
  shortSha: string;
  message: string;
  authorName?: string;
  authoredAt: number;
};

export type GitHubWikiHistoryPage = {
  revisions: GitHubWikiRevisionSummary[];
  page: number;
  hasMore: boolean;
  truncated: boolean;
};

export type GitHubWikiRevision = {
  revision: GitHubWikiRevisionSummary;
  path: string;
  blobSha?: string;
  content?: string;
  deleted: boolean;
  markdown: boolean;
};

export type GitHubWikiComparison = {
  path: string;
  baseSha: string;
  headSha: string;
  patch: string;
  additions: number;
  deletions: number;
  truncated: boolean;
};

export type GitHubWikiRevertInput = {
  path: string;
  expectedHead: string;
  expectedBlobSha: string;
  sourceCommitSha: string;
  message?: string;
};

export type GitHubReactionSubjectKind =
  | "issue"
  | "pullRequest"
  | "commitComment"
  | "issueComment"
  | "pullRequestReview"
  | "pullRequestReviewComment"
  | "discussion"
  | "discussionComment"
  | "release";

export type GitHubReactionSubjectRef = {
  id: string;
  kind: GitHubReactionSubjectKind;
};

export type GitHubReactionContent =
  | "thumbsUp"
  | "thumbsDown"
  | "laugh"
  | "hooray"
  | "confused"
  | "heart"
  | "rocket"
  | "eyes";

export type GitHubReactionGroup = {
  content: GitHubReactionContent;
  count: number;
  viewerHasReacted: boolean;
};

export type GitHubReactionSubject = GitHubReactionSubjectRef & {
  viewerCanReact: boolean;
  groups: GitHubReactionGroup[];
};

export type GitHubDiscoverySearchKind =
  | "repositories"
  | "code"
  | "issues"
  | "pullRequests"
  | "users";

export type GitHubDiscoverySearchSort =
  | "bestMatch"
  | "updated"
  | "stars"
  | "forks"
  | "comments"
  | "followers"
  | "repositories"
  | "joined"
  | "indexed";

export type GitHubDiscoveryCodeResult = {
  name: string;
  path: string;
  sha: string;
  url: string;
  fragment?: string;
  repository: GitHubRepository;
};

type GitHubDiscoverySearchMetadata = {
  totalCount: number;
  incompleteResults: boolean;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubDiscoverySearchPage =
  | (GitHubDiscoverySearchMetadata & {
      kind: "repositories";
      results: GitHubRepository[];
    })
  | (GitHubDiscoverySearchMetadata & {
      kind: "code";
      results: GitHubDiscoveryCodeResult[];
    })
  | (GitHubDiscoverySearchMetadata & {
      kind: "issues";
      results: GitHubIssueSummary[];
    })
  | (GitHubDiscoverySearchMetadata & {
      kind: "pullRequests";
      results: GitHubPullRequestSummary[];
    })
  | (GitHubDiscoverySearchMetadata & {
      kind: "users";
      results: GitHubUserSummary[];
    });

export type GitHubDeveloperFeedRepository = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  url: string;
};

export type GitHubDeveloperFeedEvent = {
  id: string;
  eventType: string;
  actor: GitHubUserSummary;
  repository: GitHubDeveloperFeedRepository;
  action?: string;
  reference?: string;
  resourceNumber?: number;
  resourceTitle?: string;
  commitCount?: number;
  public: boolean;
  createdAt: string;
};

export type GitHubDeveloperFeedPage = {
  events: GitHubDeveloperFeedEvent[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubUserProfile = {
  id: number;
  login: string;
  avatarUrl: string;
  url: string;
  name?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  email?: string;
  twitterUsername?: string;
  hireable: boolean;
  publicRepositories: number;
  publicGists: number;
  followers: number;
  following: number;
  createdAt: string;
  updatedAt: string;
  viewerOwnsProfile: boolean;
  viewerFollows: boolean;
  followsViewer: boolean;
};

export type GitHubUserProfileUpdate = {
  name: string;
  bio: string;
  company: string;
  location: string;
  blog: string;
  email: string;
  twitterUsername: string;
  hireable: boolean;
};

export type GitHubProfileConnectionKind = "followers" | "following";

export type GitHubUserSummary = {
  id: number;
  login: string;
  avatarUrl: string;
  url: string;
};

export type GitHubUserPage = {
  users: GitHubUserSummary[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubContributionLevel =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export type GitHubContributionDay = {
  color: string;
  contributionCount: number;
  contributionLevel: GitHubContributionLevel;
  date: string;
  weekday: number;
};

export type GitHubContributionWeek = {
  firstDay: string;
  days: GitHubContributionDay[];
};

export type GitHubContributionMonth = {
  firstDay: string;
  name: string;
  totalWeeks: number;
  year: number;
};

export type GitHubContributionSummary = {
  login: string;
  startedAt: string;
  endedAt: string;
  totalContributions: number;
  restrictedContributions: number;
  hasRestrictedContributions: boolean;
  commits: number;
  issues: number;
  pullRequests: number;
  pullRequestReviews: number;
  months: GitHubContributionMonth[];
  weeks: GitHubContributionWeek[];
};

export type GitHubProfileActivity = {
  id: string;
  eventType: string;
  repository: string;
  action?: string;
  reference?: string;
  resourceNumber?: number;
  resourceTitle?: string;
  commitCount?: number;
  createdAt: string;
};

export type GitHubProfileActivityPage = {
  activities: GitHubProfileActivity[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubStarredRepositorySort = "starred" | "updated";

export type GitHubStarredRepository = {
  repository: GitHubRepository;
  starredAt: string;
};

export type GitHubStarredRepositoryPage = {
  repositories: GitHubStarredRepository[];
  page: number;
  hasMore: boolean;
};

export type GitHubRepositoryWatchLevel = "participating" | "allActivity" | "ignored";

export type GitHubRepositoryRelationship = {
  starred: boolean;
  watchLevel: GitHubRepositoryWatchLevel;
  viewerLogin: string;
  viewerOwnsRepository: boolean;
};

export type GitHubForkInput = {
  name?: string;
  defaultBranchOnly: boolean;
};

export type GitHubForkResult = {
  repository: GitHubRepository;
  created: boolean;
};

export type GitHubRepositoryVisibility = "public" | "private";

export type GitHubRepositoryLicenseTemplate = {
  key: string;
  name: string;
};

export type GitHubRepositoryCreationOptions = {
  gitignoreTemplates: string[];
  licenses: GitHubRepositoryLicenseTemplate[];
};

export type GitHubRepositoryCreateInput = {
  name: string;
  description?: string;
  homepage?: string;
  visibility: GitHubRepositoryVisibility;
  initializeWithReadme: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
  hasIssues: boolean;
  hasProjects: boolean;
  hasWiki: boolean;
  hasDiscussions: boolean;
};

export type GitHubRepositorySettings = {
  repository: GitHubRepository;
  homepage?: string;
  visibility: GitHubRepositoryVisibility;
  isTemplate: boolean;
  hasIssues: boolean;
  hasProjects: boolean;
  hasWiki: boolean;
  hasDiscussions: boolean;
  allowMergeCommit: boolean;
  allowSquashMerge: boolean;
  allowRebaseMerge: boolean;
  allowAutoMerge: boolean;
  allowUpdateBranch: boolean;
  deleteBranchOnMerge: boolean;
};

export type GitHubRepositorySettingsUpdate = Omit<GitHubRepositorySettings, "repository"> & {
  name: string;
  description?: string;
  defaultBranch: string;
  archived: boolean;
  acceptVisibilityChangeConsequences: boolean;
  confirmArchiveChange: boolean;
};

export type GitHubInsightsTrafficPeriod = "day" | "week";

export type GitHubInsightsStatisticStatus = "ready" | "building" | "unavailable";

export type GitHubCommunityFile = {
  key: string;
  name: string;
  url?: string;
  present: boolean;
};

export type GitHubCommunityProfile = {
  healthPercentage: number;
  description?: string;
  documentation?: string;
  updatedAt?: string;
  files: GitHubCommunityFile[];
};

export type GitHubCommitActivityWeek = {
  week: number;
  total: number;
};

export type GitHubCodeFrequencyWeek = {
  week: number;
  additions: number;
  deletions: number;
};

export type GitHubRepositoryInsightsOverview = {
  community: GitHubCommunityProfile;
  commitActivity: {
    status: GitHubInsightsStatisticStatus;
    weeks: GitHubCommitActivityWeek[];
  };
  codeFrequency: {
    status: GitHubInsightsStatisticStatus;
    weeks: GitHubCodeFrequencyWeek[];
  };
};

export type GitHubInsightsContributor = {
  login?: string;
  avatarUrl?: string;
  total: number;
  additions: number;
  deletions: number;
};

export type GitHubRepositoryInsightsContributors = {
  status: GitHubInsightsStatisticStatus;
  contributors: GitHubInsightsContributor[];
};

export type GitHubTrafficPoint = {
  timestamp: string;
  count: number;
  uniques: number;
};

export type GitHubTrafficSeries = {
  count: number;
  uniques: number;
  points: GitHubTrafficPoint[];
};

export type GitHubTrafficReferrer = {
  referrer: string;
  count: number;
  uniques: number;
};

export type GitHubTrafficPath = {
  path: string;
  title: string;
  url?: string;
  count: number;
  uniques: number;
};

export type GitHubRepositoryInsightsTraffic = {
  period: GitHubInsightsTrafficPeriod;
  views: GitHubTrafficSeries;
  clones: GitHubTrafficSeries;
  referrers: GitHubTrafficReferrer[];
  paths: GitHubTrafficPath[];
};

export type GitHubRepositoryAccessUser = {
  id: number;
  login: string;
  avatarUrl: string;
  url: string;
};

export type GitHubRepositoryCollaboratorPage = {
  collaborators: GitHubRepositoryAccessUser[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubRepositoryInvitation = {
  id: number;
  invitee: GitHubRepositoryAccessUser;
  inviter: GitHubRepositoryAccessUser;
  createdAt: string;
};

export type GitHubRepositoryInvitationPage = {
  invitations: GitHubRepositoryInvitation[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubRepositoryInviteResult = {
  status: "invited" | "alreadyCollaborator";
  invitation?: GitHubRepositoryInvitation | null;
};

export type GitHubPagesBuildType = "legacy" | "workflow";

export type GitHubPagesSourcePath = "root" | "docs";

export type GitHubPagesConfiguration = {
  buildType: GitHubPagesBuildType;
  branch: string | null;
  sourcePath: GitHubPagesSourcePath | null;
  customDomain: string | null;
  httpsEnforced: boolean;
};

export type GitHubPagesMutation =
  | { action: "configure"; configuration: GitHubPagesConfiguration }
  | { action: "requestBuild" }
  | { action: "disable"; confirmation: string };

export type GitHubPagesSource = {
  branch: string;
  path: GitHubPagesSourcePath;
};

export type GitHubPagesCertificate = {
  state: string;
  description?: string;
  domains: string[];
  expiresAt?: string;
};

export type GitHubPagesSite = {
  status: string;
  url: string;
  buildType: GitHubPagesBuildType;
  source?: GitHubPagesSource;
  customDomain?: string;
  custom404: boolean;
  public: boolean;
  httpsEnforced: boolean;
  certificate?: GitHubPagesCertificate;
  protectedDomainState?: string;
  pendingDomainUnverifiedAt?: string;
};

export type GitHubPagesBuild = {
  url?: string;
  status: string;
  error?: string;
  pusher?: string;
  pusherAvatarUrl?: string;
  commit?: string;
  durationMilliseconds?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type GitHubPagesWorkspace = {
  site?: GitHubPagesSite;
  builds: GitHubPagesBuild[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
  isArchived: boolean;
};

export type GitHubPagesDomainHealth = {
  host?: string;
  uri?: string;
  dnsResolves: boolean;
  proxied: boolean;
  valid: boolean;
  reason?: string;
  respondsToHttps: boolean;
  enforcesHttps: boolean;
  httpsEligible: boolean;
  httpsError?: string;
  caaError?: string;
};

export type GitHubPagesHealth = {
  pending: boolean;
  domain?: GitHubPagesDomainHealth;
  alternateDomain?: GitHubPagesDomainHealth;
};

export type GitHubGistSource = "mine" | "starred" | "public";

export type GitHubGistFile = {
  filename: string;
  language?: string;
  contentType?: string;
  rawUrl?: string;
  size: number;
  truncated: boolean;
  content?: string;
};

export type GitHubGistParent = {
  id: string;
  owner?: string;
  url: string;
};

export type GitHubGist = {
  id: string;
  description?: string;
  url: string;
  public: boolean;
  owner?: string;
  ownerAvatarUrl?: string;
  comments: number;
  commentsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  files: GitHubGistFile[];
  starred: boolean;
  viewerOwns: boolean;
  forkOf?: GitHubGistParent;
};

export type GitHubGistPage = {
  gists: GitHubGist[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubGistRevision = {
  version: string;
  author?: string;
  authorAvatarUrl?: string;
  committedAt: string;
  additions: number;
  deletions: number;
  total: number;
};

export type GitHubGistRevisionPage = {
  revisions: GitHubGistRevision[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubGistRevisionDetail = {
  gistId: string;
  version: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  files: GitHubGistFile[];
};

export type GitHubGistComment = {
  id: number;
  body: string;
  author?: string;
  authorAvatarUrl?: string;
  authorAssociation?: string;
  createdAt: string;
  updatedAt: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
};

export type GitHubGistCommentPage = {
  comments: GitHubGistComment[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubGistFileInput = {
  filename: string;
  content: string;
};

export type GitHubGistCreateInput = {
  description?: string;
  public: boolean;
  files: GitHubGistFileInput[];
};

export type GitHubGistFileMutation = {
  originalFilename?: string;
  filename: string;
  content?: string;
  deleted: boolean;
};

export type GitHubGistUpdateInput = {
  description?: string;
  files: GitHubGistFileMutation[];
};

export type GitHubGistCommentMutation =
  | { action: "create"; body: string }
  | { action: "update"; commentId: number; body: string }
  | { action: "delete"; commentId: number };

export type GitHubPackageType = "npm" | "maven" | "rubygems" | "nuget" | "container" | "docker";

export type GitHubPackageVisibility = "public" | "private";

export type GitHubPackageVisibilityValue =
  | { kind: GitHubPackageVisibility | "internal" }
  | { kind: "unknown"; value: string };

export type GitHubPackageVersionState = "active" | "deleted";

export type GitHubPackageVersionAction = "delete" | "restore";

export type GitHubPackageRepository = {
  name: string;
  fullName: string;
  url: string;
};

export type GitHubPackage = {
  id: number;
  name: string;
  packageType: GitHubPackageType;
  visibility: GitHubPackageVisibilityValue;
  versionCount: number;
  owner: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  repository?: GitHubPackageRepository;
};

export type GitHubPackagePage = {
  packages: GitHubPackage[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubPackageVersion = {
  id: number;
  name: string;
  state: GitHubPackageVersionState;
  metadata: { kind: "container"; tags: string[] } | { kind: "unknown"; raw: unknown };
  description?: string;
  license?: string;
  deletedAt?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubPackageVersionPage = {
  versions: GitHubPackageVersion[];
  state: GitHubPackageVersionState;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubPackageVersionMutationResult = {
  packageId: number;
  packageType: GitHubPackageType;
  packageName: string;
  versionId: number;
  versionName: string;
  action: GitHubPackageVersionAction;
};

export type GitHubRepositoryIdentity = Pick<GitHubRepository, "owner" | "name">;
export type GitHubRepositoryContentContext = Pick<
  GitHubRepository,
  "owner" | "name" | "url" | "defaultBranch"
>;

export type GitHubNotificationAction = "read" | "done";
export type GitHubReceivedRepositoryInvitationAction = "accept" | "decline";

export type GitHubRepositoryInvitationActor = {
  id: number;
  login: string;
  avatarUrl: string;
  url: string;
};

export type GitHubReceivedRepositoryInvitation = {
  id: number;
  repository: GitHubRepository;
  inviter: GitHubRepositoryInvitationActor;
  permission: string;
  createdAt: string;
};

export type GitHubReceivedRepositoryInvitationPage = {
  invitations: GitHubReceivedRepositoryInvitation[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubNotificationSubjectKind =
  | "issue"
  | "pullRequest"
  | "discussion"
  | "commit"
  | "release"
  | "checkSuite"
  | "workflowRun"
  | "dependabotAlert"
  | "codeScanningAlert"
  | "secretScanningAlert"
  | "securityAlert"
  | "repositoryInvitation"
  | "other";

export type GitHubNotificationSubject = {
  title: string;
  kind: GitHubNotificationSubjectKind;
  number?: number;
  releaseId?: number;
  commitSha?: string;
  checkSuiteId?: number;
  workflowRunId?: number;
  url: string;
};

export type GitHubNotification = {
  id: number;
  repository: GitHubRepository;
  subject: GitHubNotificationSubject;
  reason: string;
  unread: boolean;
  updatedAt: string;
  lastReadAt?: string;
};

export type GitHubNotificationPage = {
  notifications: GitHubNotification[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubSecurityAlertKind = "dependabot" | "codeScanning" | "secretScanning";
export type GitHubSecurityAlertStateFilter = "open" | "closed" | "all";
export type GitHubSecurityAlertSeverityFilter = "all" | "critical" | "high" | "medium" | "low";
export type GitHubSecurityAlertSort = "created" | "updated";
export type GitHubSecurityAlertMutationState = "open" | "closed";
export type GitHubDependabotDismissReason =
  | "fixStarted"
  | "inaccurate"
  | "noBandwidth"
  | "notUsed"
  | "tolerableRisk";
export type GitHubCodeScanningDismissReason =
  | "falsePositive"
  | "wontFix"
  | "usedInTests"
  | "mitigated";
export type GitHubSecretScanningResolution =
  | "falsePositive"
  | "wontFix"
  | "revoked"
  | "usedInTests";

export type GitHubSecurityActor = {
  login: string;
  avatarUrl?: string;
};

export type GitHubDependabotAlertSummary = {
  kind: "dependabot";
  number: number;
  state: string;
  severity: string;
  title: string;
  packageName: string;
  ecosystem: string;
  manifestPath: string;
  scope?: string;
  relationship?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  assignees: GitHubSecurityActor[];
};

export type GitHubCodeScanningAlertSummary = {
  kind: "codeScanning";
  number: number;
  state: string;
  severity: string;
  title: string;
  ruleId?: string;
  toolName: string;
  path?: string;
  startLine?: number;
  message?: string;
  reference?: string;
  url: string;
  createdAt: string;
  updatedAt?: string;
  assignees: GitHubSecurityActor[];
};

export type GitHubSecretScanningAlertSummary = {
  kind: "secretScanning";
  number: number;
  state: string;
  title: string;
  secretType: string;
  validity: string;
  publiclyLeaked: boolean;
  multiRepo: boolean;
  url: string;
  createdAt: string;
  updatedAt?: string;
  assignee?: GitHubSecurityActor;
};

export type GitHubSecurityAlertSummary =
  | GitHubDependabotAlertSummary
  | GitHubCodeScanningAlertSummary
  | GitHubSecretScanningAlertSummary;

export type GitHubSecurityAlertPage = {
  alerts: GitHubSecurityAlertSummary[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubSecurityCwe = {
  id: string;
  name: string;
};

export type GitHubSecurityMetadata = {
  key: string;
  value: string;
};

export type GitHubDependabotAlertDetail = {
  kind: "dependabot";
  alert: GitHubDependabotAlertSummary;
  description: string;
  ghsaId: string;
  cveId?: string;
  vulnerableVersionRange: string;
  firstPatchedVersion?: string;
  cvssScore?: number;
  cvssVector?: string;
  epssPercentage?: number;
  epssPercentile?: number;
  cwes: GitHubSecurityCwe[];
  references: string[];
  publishedAt: string;
  withdrawnAt?: string;
  dismissedAt?: string;
  dismissedBy?: GitHubSecurityActor;
  dismissedReason?: string;
  dismissedComment?: string;
  fixedAt?: string;
  autoDismissedAt?: string;
};

export type GitHubCodeScanningAlertDetail = {
  kind: "codeScanning";
  alert: GitHubCodeScanningAlertSummary;
  description: string;
  help?: string;
  helpUrl?: string;
  tags: string[];
  fixedAt?: string;
  dismissedAt?: string;
  dismissedBy?: GitHubSecurityActor;
  dismissedReason?: string;
  dismissedComment?: string;
};

export type GitHubSecretScanningAlertDetail = {
  kind: "secretScanning";
  alert: GitHubSecretScanningAlertSummary;
  resolution?: string;
  resolutionComment?: string;
  resolvedAt?: string;
  resolvedBy?: GitHubSecurityActor;
  pushProtectionBypassed: boolean;
  pushProtectionBypassedAt?: string;
  pushProtectionBypassedBy?: GitHubSecurityActor;
  metadata: GitHubSecurityMetadata[];
};

export type GitHubSecurityAlertDetail =
  | GitHubDependabotAlertDetail
  | GitHubCodeScanningAlertDetail
  | GitHubSecretScanningAlertDetail;

export type GitHubCodeScanningInstance = {
  state?: string;
  reference: string;
  commitSha: string;
  message: string;
  path: string;
  startLine: number;
  endLine: number;
  classifications: string[];
};

export type GitHubCodeScanningInstancePage = {
  instances: GitHubCodeScanningInstance[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubSecretScanningLocation = {
  kind: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  commitSha?: string;
  url?: string;
};

export type GitHubSecretScanningLocationPage = {
  locations: GitHubSecretScanningLocation[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubSecurityAlertMutation =
  | {
      kind: "dependabot";
      state: GitHubSecurityAlertMutationState;
      reason?: GitHubDependabotDismissReason;
      comment: string;
    }
  | {
      kind: "codeScanning";
      state: GitHubSecurityAlertMutationState;
      reason?: GitHubCodeScanningDismissReason;
      comment: string;
    }
  | {
      kind: "secretScanning";
      state: GitHubSecurityAlertMutationState;
      reason?: GitHubSecretScanningResolution;
      comment: string;
    };

export type GitHubDiscussionState = "open" | "closed";
export type GitHubDiscussionStateFilter = "all" | GitHubDiscussionState;
export type GitHubDiscussionAnsweredFilter = "all" | "answered" | "unanswered";
export type GitHubDiscussionSort = "updated" | "created";
export type GitHubDiscussionCloseReason = "resolved" | "outdated" | "duplicate";

export type GitHubDiscussionCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  emoji: string;
  isAnswerable: boolean;
};

export type GitHubDiscussionCategoryPage = {
  enabled: boolean;
  repositoryId: string;
  categories: GitHubDiscussionCategory[];
};

export type GitHubDiscussionSummary = {
  id: string;
  number: number;
  title: string;
  body: string;
  url: string;
  state: GitHubDiscussionState;
  stateReason?: string;
  locked: boolean;
  author?: string;
  authorAvatarUrl?: string;
  authorAssociation: string;
  category: GitHubDiscussionCategory;
  answerId?: string;
  answerChosenAt?: string;
  answerChosenBy?: string;
  commentCount: number;
  upvoteCount: number;
  createdAt: string;
  updatedAt: string;
  viewerCanClose: boolean;
  viewerCanDelete: boolean;
  viewerCanReopen: boolean;
  viewerCanUpdate: boolean;
  viewerCanUpvote: boolean;
  viewerDidAuthor: boolean;
  viewerHasUpvoted: boolean;
};

export type GitHubDiscussionPage = {
  enabled: boolean;
  discussions: GitHubDiscussionSummary[];
  totalCount: number;
  endCursor?: string;
  hasMore: boolean;
};

export type GitHubDiscussionComment = {
  id: string;
  body: string;
  url: string;
  author?: string;
  authorAvatarUrl?: string;
  authorAssociation: string;
  createdAt: string;
  updatedAt: string;
  isAnswer: boolean;
  isMinimized: boolean;
  minimizedReason?: string;
  deletedAt?: string | null;
  upvoteCount: number;
  viewerCanDelete: boolean;
  viewerCanMarkAsAnswer: boolean;
  viewerCanUnmarkAsAnswer: boolean;
  viewerCanUpdate: boolean;
  viewerCanUpvote: boolean;
  viewerCanMinimize: boolean;
  viewerCanUnminimize: boolean;
  viewerDidAuthor: boolean;
  viewerHasUpvoted: boolean;
  replies: GitHubDiscussionComment[];
  repliesHaveMore: boolean;
};

export type GitHubDiscussionPollOption = {
  id: string;
  option: string;
  totalVoteCount: number;
  viewerHasVoted: boolean;
};

export type GitHubDiscussionPoll = {
  id: string;
  question: string;
  totalVoteCount: number;
  viewerCanVote: boolean;
  viewerHasVoted: boolean;
  options: GitHubDiscussionPollOption[];
};

export type GitHubDiscussionDetailPage = {
  discussion: GitHubDiscussionSummary;
  poll?: GitHubDiscussionPoll | null;
  comments: GitHubDiscussionComment[];
  commentCount: number;
  endCursor?: string;
  hasMore: boolean;
};

export type GitHubDiscussionVote = {
  subjectId: string;
  upvoteCount: number;
  viewerCanUpvote: boolean;
  viewerHasUpvoted: boolean;
};

export type GitHubDiscussionDeletion = {
  discussionId: string;
  discussionNumber: number;
};

export type GitHubDiscussionCommentDeletion = {
  commentId: string;
  replyToId?: string;
  deletedAt?: string | null;
  preserved: boolean;
};

export type GitHubReleaseArchiveFormat = "zip" | "tarGz";

export type GitHubReleaseAsset = {
  id: number;
  name: string;
  label?: string;
  state: string;
  contentType: string;
  size: number;
  digest?: string;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  uploader?: string;
  uploaderAvatarUrl?: string;
};

export type GitHubRelease = {
  id: number;
  reactionSubject: GitHubReactionSubjectRef;
  tagName: string;
  targetCommitish: string;
  name?: string;
  body?: string;
  url: string;
  draft: boolean;
  prerelease: boolean;
  immutable: boolean;
  createdAt?: string;
  publishedAt?: string;
  author?: string;
  authorAvatarUrl?: string;
  hasZipball: boolean;
  hasTarball: boolean;
  assets: GitHubReleaseAsset[];
};

export type GitHubReleasePage = {
  releases: GitHubRelease[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubReleaseMutationInput = {
  tagName: string;
  targetCommitish: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
};

export type GitHubIssueLabel = {
  name: string;
  color: string;
  description?: string;
  isDefault?: boolean;
};

export type GitHubIssueLabelMutation =
  | { action: "create"; name: string; color: string; description: string }
  | {
      action: "update";
      originalName: string;
      name: string;
      color: string;
      description: string;
    }
  | { action: "delete"; name: string; confirmation: string };

export type GitHubIssueMilestoneState = "open" | "closed";

export type GitHubIssueMilestoneMutation =
  | { action: "create"; title: string; description: string; dueOn: string | null }
  | {
      action: "update";
      number: number;
      title: string;
      description: string;
      dueOn: string | null;
      state: GitHubIssueMilestoneState;
    }
  | { action: "delete"; number: number; confirmation: string };

export type GitHubItemMetadataValue = {
  labels: string[];
  assignees: string[];
  milestoneNumber: number | null;
};

export type GitHubIssueState = "open" | "closed";
export type GitHubIssueCloseReason = "completed" | "notPlanned";
export type GitHubIssueStateReason =
  | "completed"
  | "notPlanned"
  | "duplicate"
  | "reopened"
  | (string & {});
export type GitHubIssueStateCapabilities = {
  repositoryId: string;
  repositoryFullName: string;
  issueNodeId: string;
  number: number;
  state: GitHubIssueState;
  stateReason?: GitHubIssueStateReason;
  updatedAt: string;
  viewerCanClose: boolean;
  viewerCanReopen: boolean;
};
export type GitHubIssueAssignment = "all" | "unassigned";
export type GitHubIssueSort = "updated" | "created" | "comments";
export type GitHubIssueInboxScope = "authored" | "assigned" | "mentioned";

export type GitHubConversationKind = "issue" | "pullRequest";
export type GitHubConversationLockAction = "lock" | "unlock";
export type GitHubConversationLockReason = "offTopic" | "tooHeated" | "resolved" | "spam";
export type GitHubConversationSubscriptionAction = "subscribe" | "unsubscribe";
export type GitHubConversationSubscriptionState =
  | "subscribed"
  | "unsubscribed"
  | "ignored"
  | "unknown";

export type GitHubConversationControls = {
  kind: GitHubConversationKind;
  number: number;
  locked: boolean;
  lockReason?: GitHubConversationLockReason | null;
  viewerCanLock: boolean;
  viewerCanSubscribe: boolean;
  viewerSubscription?: GitHubConversationSubscriptionState | null;
};

export type GitHubIssue = {
  id: number;
  reactionSubject: GitHubReactionSubjectRef;
  number: number;
  title: string;
  body?: string;
  url: string;
  state: GitHubIssueState;
  stateReason?: GitHubIssueStateReason;
  author: string;
  authorAvatarUrl?: string;
  authorAssociation?: string;
  assignees: string[];
  labels: GitHubIssueLabel[];
  milestone?: string;
  milestoneNumber?: number;
  locked: boolean;
  comments: number;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubIssueType = {
  id?: number | null;
  nodeId: string;
  name: string;
  description?: string | null;
};

export type GitHubIssueTypeStatus = {
  repositoryId: string;
  repositoryFullName: string;
  issueNodeId: string;
  issueNumber: number;
  currentIssueType?: GitHubIssueType | null;
  availableIssueTypes: GitHubIssueType[];
  viewerCanType: boolean;
};

export type GitHubIssueContactLink = {
  name: string;
  about: string;
  url: string;
};

export type GitHubIssueTemplateKind = "markdown" | "form" | "github";

export type GitHubIssueTemplate = {
  path: string;
  kind: GitHubIssueTemplateKind;
  name: string;
  about: string;
  defaultTitle: string;
  body: string;
  labels: string[];
  assignees: string[];
  templateUrl: string;
};

export type GitHubIssueCreationPolicy = {
  blankIssueAllowed: boolean;
  contactLinks: GitHubIssueContactLink[];
  templates: GitHubIssueTemplate[];
  templateChooserUrl: string;
};

export type GitHubIssueCloneStatus = {
  repositoryId: string;
  repositoryFullName: string;
  issueNodeId: string;
  issueNumber: number;
  title: string;
  body?: string;
  sourceOpen: boolean;
  destinationAllowsBlankIssues: boolean;
  viewerCanClone: boolean;
};

export type GitHubIssueClone = {
  repositoryId: string;
  repositoryFullName: string;
  sourceIssueNodeId: string;
  sourceIssueNumber: number;
  targetIssueNodeId: string;
  targetIssueNumber: number;
  targetIssueUrl: string;
};

export type GitHubIssuePage = {
  issues: GitHubIssue[];
  totalCount: number;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubIssuePinAction = "pin" | "unpin";

export type GitHubPinnedIssue = {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  state: GitHubIssueState;
  stateReason?: GitHubIssueStateReason;
  pinnedBy: string;
};

export type GitHubPinnedIssuePage = {
  repositoryId: string;
  repositoryFullName: string;
  viewerCanManage: boolean;
  issues: GitHubPinnedIssue[];
};

export type GitHubIssueDeleteStatus = {
  repositoryId: string;
  repositoryFullName: string;
  issueNodeId: string;
  number: number;
  viewerCanDelete: boolean;
};

export type GitHubIssueDeletion = {
  repositoryId: string;
  repositoryFullName: string;
  issueNodeId: string;
  number: number;
};

export type GitHubIssueTransferStatus = {
  sourceRepositoryId: string;
  sourceRepositoryFullName: string;
  sourceIssueNodeId: string;
  sourceIssueNumber: number;
  sourceIssueOpen: boolean;
  sourcePrivate: boolean;
  sourceViewerCanTransfer: boolean;
  targetRepositoryId: string;
  targetRepositoryFullName: string;
  targetRepositoryUrl: string;
  targetDefaultBranch: string;
  targetPrivate: boolean;
  targetViewerCanTransfer: boolean;
  sameOwner: boolean;
  privateCompatible: boolean;
  viewerCanTransfer: boolean;
};

export type GitHubIssueTransfer = {
  sourceRepositoryId: string;
  sourceRepositoryFullName: string;
  sourceIssueNodeId: string;
  sourceIssueNumber: number;
  targetRepositoryId: string;
  targetRepositoryFullName: string;
  targetRepositoryUrl: string;
  targetDefaultBranch: string;
  targetIssueNodeId: string;
  targetIssueNumber: number;
  targetIssueUrl: string;
};

export type GitHubIssueRepository = GitHubRepositoryContentContext & {
  fullName: string;
};

export type GitHubIssueSummary = {
  issue: GitHubIssue;
  repository: GitHubIssueRepository;
};

export type GitHubIssueInboxPage = {
  issues: GitHubIssueSummary[];
  totalCount: number;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubIssueRelationshipsPage = {
  parent?: GitHubIssueSummary | null;
  subIssues: GitHubIssueSummary[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubIssueDependenciesPage = {
  blockedBy: GitHubIssueSummary[];
  blocking: GitHubIssueSummary[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubIssueDuplicateReference = {
  owner: string;
  repository: string;
  fullName: string;
  repositoryUrl: string;
  issueNumber: number;
  title: string;
  url: string;
  viewerCanUnmark: boolean;
};

export type GitHubIssueLinkedPullRequestReference = {
  repository: GitHubPullRequestRepository;
  number: number;
  title: string;
  url: string;
  state: GitHubPullRequestState;
  draft: boolean;
  merged: boolean;
};

export type GitHubIssueLinkedPullRequestPage = {
  pullRequests: GitHubIssueLinkedPullRequestReference[];
  nextCursor?: string | null;
};

export type GitHubIssueLinkedBranch = {
  id: string;
  name: string;
  repositoryId: string;
  repositoryFullName: string;
  oid: string;
};

export type GitHubIssueLinkedBranchPage = {
  repositoryId: string;
  repositoryFullName: string;
  issueNodeId: string;
  issueNumber: number;
  defaultBranch: string;
  defaultBranchOid: string;
  viewerCanCreate: boolean;
  viewerCanRead: boolean;
  branches: GitHubIssueLinkedBranch[];
  nextCursor?: string | null;
};

export type GitHubIssueTimelineItem = {
  id: string;
  reactionSubject?: GitHubReactionSubjectRef;
  kind: "comment" | "event";
  event: string;
  actor?: string;
  actorAvatarUrl?: string;
  authorAssociation?: string;
  body?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
  isPinned?: boolean;
  viewerCanPin?: boolean;
  viewerCanUnpin?: boolean;
  viewerCanMinimize?: boolean;
  viewerCanUnminimize?: boolean;
  isMinimized: boolean;
  minimizedReason?: string;
  label?: GitHubIssueLabel;
  assignee?: string;
  milestone?: string;
  renameFrom?: string;
  renameTo?: string;
  commitId?: string;
  reviewId?: number;
  reviewState?: GitHubPullRequestReviewState;
};

export type GitHubIssueDetailPage = {
  issue: GitHubIssue;
  timeline: GitHubIssueTimelineItem[];
  timelinePage: number;
  timelineHasPrevious: boolean;
  timelineHasMore: boolean;
};

export type GitHubPullRequestState = "open" | "closed";
export type GitHubPullRequestSort = "updated" | "created" | "comments";
export type GitHubPullRequestInboxScope = "authored" | "assigned" | "reviewRequested";
export type GitHubPullRequestMergeMethod = "merge" | "squash" | "rebase";
export type GitHubPullRequestAutoMergeState =
  | "enabled"
  | "available"
  | "repositoryDisabled"
  | "mergeQueue"
  | "draft"
  | "closed"
  | "merged"
  | "notNeeded"
  | "unavailable";

export type GitHubPullRequestAutoMergeStatus = {
  state: GitHubPullRequestAutoMergeState;
  headSha: string;
  mergeStateStatus?: string;
  allowedMergeMethods: GitHubPullRequestMergeMethod[];
  mergeMethod?: GitHubPullRequestMergeMethod;
  enabledAt?: string;
  enabledBy?: string;
  viewerCanEnable: boolean;
  viewerCanDisable: boolean;
};

export type GitHubPullRequestMergeQueueState =
  | "available"
  | "waiting"
  | "queued"
  | "notConfigured"
  | "draft"
  | "closed"
  | "merged"
  | "unavailable";

export type GitHubPullRequestMergeQueueEntryState =
  | "awaitingChecks"
  | "locked"
  | "mergeable"
  | "queued"
  | "unmergeable";

export type GitHubPullRequestMergeQueueEntry = {
  id: string;
  position: number;
  state: GitHubPullRequestMergeQueueEntryState;
  enqueuedAt: string;
  enqueuedBy: string;
  estimatedTimeToMergeSeconds?: number;
  headSha?: string;
  jump: boolean;
};

export type GitHubPullRequestMergeQueueStatus = {
  state: GitHubPullRequestMergeQueueState;
  headSha: string;
  baseRef: string;
  mergeStateStatus?: string;
  queueUrl?: string;
  entry?: GitHubPullRequestMergeQueueEntry;
  viewerCanEnqueue: boolean;
  viewerCanDequeue: boolean;
};

export type GitHubPullRequestBranchUpdateState =
  | "available"
  | "upToDate"
  | "conflicts"
  | "unavailable";

export type GitHubPullRequestBranchUpdateStatus = {
  state: GitHubPullRequestBranchUpdateState;
  headSha: string;
  behindBy: number;
};

export type GitHubPullRequestBranchUpdate = {
  message: string;
  url?: string;
};

export type GitHubPullRequestComparisonStatus = "ahead" | "behind" | "diverged" | "identical";

export type GitHubPullRequestComparison = {
  base: string;
  head: string;
  status: GitHubPullRequestComparisonStatus;
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  changedFiles: number;
  additions: number;
  deletions: number;
  commits: GitHubCommit[];
  suggestedTitle: string;
};

export type GitHubPullRequestRepository = GitHubRepositoryIdentity & {
  fullName: string;
  url: string;
};

export type GitHubPullRequestReviewTeam = {
  name: string;
  slug: string;
  description?: string;
};

export type GitHubPullRequestReviewTeamPage = {
  teams: GitHubPullRequestReviewTeam[];
};

export type GitHubPullRequestSummary = {
  id: number;
  number: number;
  title: string;
  body?: string;
  url: string;
  state: GitHubPullRequestState;
  draft: boolean;
  merged: boolean;
  repository: GitHubPullRequestRepository;
  author: string;
  authorAvatarUrl?: string;
  labels: GitHubIssueLabel[];
  comments: number;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
};

export type GitHubPullRequestPage = {
  pullRequests: GitHubPullRequestSummary[];
  totalCount: number;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubPullRequest = {
  id: number;
  reactionSubject?: GitHubReactionSubjectRef;
  number: number;
  title: string;
  body?: string;
  url: string;
  state: GitHubPullRequestState;
  draft: boolean;
  merged: boolean;
  maintainerCanModify?: boolean | null;
  mergeable?: boolean | null;
  mergeableState?: string | null;
  author: string;
  authorAvatarUrl?: string;
  authorAssociation?: string;
  assignees: string[];
  requestedReviewers: string[];
  requestedTeams: GitHubPullRequestReviewTeam[];
  labels: GitHubIssueLabel[];
  milestone?: string;
  milestoneNumber?: number;
  locked: boolean;
  headRef: string;
  headLabel?: string;
  headSha: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  comments: number;
  reviewComments: number;
  mergedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  mergedAt?: string;
};

export type GitHubPullRequestReviewState =
  | "approved"
  | "changesRequested"
  | "commented"
  | "dismissed"
  | "pending";

export type GitHubPullRequestReviewAction = "comment" | "approve" | "requestChanges";

export type GitHubPullRequestReviewCommentSide = "left" | "right";

export type GitHubPullRequestReviewComment = {
  path: string;
  line: number;
  side: GitHubPullRequestReviewCommentSide;
  startLine?: number;
  startSide?: GitHubPullRequestReviewCommentSide;
  body: string;
};

export type GitHubPendingPullRequestReviewComment = GitHubPullRequestReviewComment & {
  id: string;
  databaseId: number;
};

export type GitHubPendingPullRequestReview = {
  id: number;
  nodeId: string;
  body: string;
  commitId?: string;
  comments: GitHubPendingPullRequestReviewComment[];
  uneditableCommentCount: number;
};

export type GitHubPullRequestReview = {
  id: number;
  nodeId: string;
  author: string;
  authorAvatarUrl?: string;
  authorAssociation?: string;
  state: GitHubPullRequestReviewState;
  body?: string;
  url: string;
  commitId?: string;
  submittedAt?: string;
};

export type GitHubPullRequestReviewPage = {
  reviews: GitHubPullRequestReview[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubPullRequestDetailPage = {
  pullRequest: GitHubPullRequest;
  timeline: GitHubIssueTimelineItem[];
  reviews: GitHubPullRequestReview[];
  reviewsHaveMore: boolean;
  timelinePage: number;
  timelineHasPrevious: boolean;
  timelineHasMore: boolean;
};

export type GitHubPullRequestBaseBranchPage = {
  pullRequestNumber: number;
  currentBase: string;
  currentBaseSha: string;
  headSha: string;
  branches: GitHubBranch[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubPullRequestMaintainerEditabilityState =
  | "available"
  | "notAuthor"
  | "sameRepository"
  | "organizationFork"
  | "closed"
  | "headUnavailable";

export type GitHubPullRequestWorkflowRisk = "present" | "absent" | "unknown";

export type GitHubPullRequestMaintainerEditability = {
  pullRequest: GitHubPullRequest;
  state: GitHubPullRequestMaintainerEditabilityState;
  workflowRisk: GitHubPullRequestWorkflowRisk;
  pullRequestId: number;
  pullRequestNodeId: string;
  pullRequestNumber: number;
  authorId: number;
  authorLogin: string;
  viewerId: number;
  currentValue: boolean;
  draft: boolean;
  merged: boolean;
  baseRepositoryId: number;
  baseRepository: string;
  headRepositoryId?: number | null;
  headRepository?: string | null;
  headRepositoryOwnerType?: string | null;
  headRepositoryPrivate?: boolean | null;
  headRepositoryFork?: boolean | null;
  headRef: string;
  headSha: string;
};

export type GitHubCommit = {
  sha: string;
  shortSha: string;
  title: string;
  message: string;
  author: string | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  url: string;
  verified: boolean | null;
};

export type GitHubCommitActor = {
  name: string | null;
  email: string | null;
  login: string | null;
  avatarUrl: string | null;
  date: string | null;
};

export type GitHubCommitParent = {
  sha: string;
  shortSha: string;
  url: string;
};

export type GitHubCommitStats = {
  additions: number;
  deletions: number;
  total: number;
};

export type GitHubCommitVerification = {
  verified: boolean;
  reason: string;
  verifiedAt: string | null;
};

export type GitHubChangedFile = {
  sha?: string;
  path: string;
  previousPath?: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blobUrl?: string;
  rawUrl?: string;
};

export type GitHubCommitDetail = {
  sha: string;
  shortSha: string;
  message: string;
  url: string;
  author: GitHubCommitActor | null;
  committer: GitHubCommitActor | null;
  parents: GitHubCommitParent[];
  stats: GitHubCommitStats | null;
  verification: GitHubCommitVerification | null;
};

export type GitHubCommitDetailPage = {
  commit: GitHubCommitDetail;
  files: GitHubChangedFile[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
  filesAtLimit: boolean;
};

export type GitHubCommitCommentAuthor = {
  login: string;
  avatarUrl: string | null;
};

export type GitHubCommitComment = {
  id: string;
  databaseId: number;
  commitSha: string;
  body: string;
  path: string | null;
  position: number | null;
  line: number | null;
  author: GitHubCommitCommentAuthor | null;
  authorAssociation: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
};

export type GitHubCommitCommentPage = {
  comments: GitHubCommitComment[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubCommitCommentPlacement = {
  path: string;
  position: number;
};

export type GitHubCommitCommentGuard = {
  commentId: number;
  commentNodeId: string;
  expectedUpdatedAt: string;
};

export type GitHubCommitCommentMutation =
  | {
      action: "create";
      body: string;
      placement?: GitHubCommitCommentPlacement;
    }
  | ({
      action: "update";
      body: string;
    } & GitHubCommitCommentGuard)
  | ({
      action: "delete";
    } & GitHubCommitCommentGuard);

export type GitHubPullRequestCommit = GitHubCommit;

export type GitHubPullRequestCommitPage = {
  commits: GitHubPullRequestCommit[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubPullRequestFile = {
  sha?: string;
  path: string;
  previousPath?: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blobUrl?: string;
};

export type GitHubPullRequestFilePage = {
  files: GitHubPullRequestFile[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubPullRequestFileViewedState = "dismissed" | "unviewed" | "viewed";

export type GitHubPullRequestFileViewState = {
  path: string;
  state: GitHubPullRequestFileViewedState;
};

export type GitHubPullRequestFileViewStateSnapshot = {
  pullRequestId: string;
  files: GitHubPullRequestFileViewState[];
};

export type GitHubPullRequestReviewThreadComment = {
  id: string;
  databaseId?: number;
  author: string;
  authorAvatarUrl?: string;
  authorAssociation?: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  pending: boolean;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
  viewerCanMinimize?: boolean;
  viewerCanUnminimize?: boolean;
  isMinimized: boolean;
  minimizedReason?: string;
  outdated: boolean;
};

export type GitHubCommentMinimizeClassifier =
  | "spam"
  | "abuse"
  | "offTopic"
  | "outdated"
  | "duplicate"
  | "resolved"
  | "lowQuality";

export type GitHubCommentMutation =
  | {
      action: "update";
      commentId: string;
      expectedUpdatedAt: string;
      body: string;
    }
  | {
      action: "delete";
      commentId: string;
      expectedUpdatedAt: string;
    }
  | {
      action: "pin" | "unpin";
      commentId: string;
      expectedUpdatedAt: string;
      expectedPinned: boolean;
    }
  | {
      action: "minimize";
      commentId: string;
      expectedUpdatedAt: string;
      expectedMinimized: boolean;
      classifier: GitHubCommentMinimizeClassifier;
    }
  | {
      action: "unminimize";
      commentId: string;
      expectedUpdatedAt: string;
      expectedMinimized: boolean;
    };

export type GitHubPullRequestReviewThread = {
  id: string;
  path: string;
  line?: number;
  originalLine?: number;
  startLine?: number;
  originalStartLine?: number;
  side: GitHubPullRequestReviewCommentSide;
  startSide?: GitHubPullRequestReviewCommentSide;
  subjectType: "line" | "file";
  isResolved: boolean;
  isOutdated: boolean;
  isCollapsed: boolean;
  resolvedBy?: string | null;
  viewerCanReply: boolean;
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
  comments: GitHubPullRequestReviewThreadComment[];
  commentsHaveMore: boolean;
};

export type GitHubPullRequestReviewThreadPage = {
  threads: GitHubPullRequestReviewThread[];
  endCursor?: string;
  hasMore: boolean;
};

export type GitHubPullRequestReviewThreadState = Pick<
  GitHubPullRequestReviewThread,
  | "id"
  | "isResolved"
  | "isCollapsed"
  | "resolvedBy"
  | "viewerCanReply"
  | "viewerCanResolve"
  | "viewerCanUnresolve"
>;

export type GitHubCheck = {
  id: string;
  kind: "checkRun" | "commitStatus";
  name: string;
  status: string;
  conclusion?: string;
  description?: string;
  url?: string;
  startedAt?: string;
  completedAt?: string;
};

export type GitHubCheckPage = {
  checks: GitHubCheck[];
  totalCount: number;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubCheckSuite = {
  id: number;
  headSha: string;
  headBranch?: string;
  status: string;
  conclusion?: string;
  appName?: string;
};

export type GitHubWorkflowRunStatusFilter =
  | "all"
  | "queued"
  | "inProgress"
  | "completed"
  | "success"
  | "failure"
  | "cancelled";

export type GitHubWorkflowRunFilters = {
  status: GitHubWorkflowRunStatusFilter;
  branch: string;
  event: string;
  actor: string;
};

export type GitHubWorkflowRunFilterOptions = {
  branches: string[];
  events: string[];
  actors: string[];
};

export type GitHubWorkflowRunAction = "cancel" | "rerunAll" | "rerunFailed";

export type GitHubWorkflowRunDeletion = {
  runId: number;
};

export type GitHubWorkflowReferenceKind = "branch" | "tag";

export type GitHubWorkflowDispatchInputType =
  | "boolean"
  | "choice"
  | "number"
  | "environment"
  | "string";

export type GitHubWorkflowState =
  | "active"
  | "disabled_manually"
  | "disabled_inactivity"
  | "disabled_fork"
  | "deleted";

export type GitHubWorkflow = {
  id: number;
  name: string;
  path: string;
  state: GitHubWorkflowState;
  url: string;
};

export type GitHubWorkflowReference = {
  name: string;
  kind: GitHubWorkflowReferenceKind;
};

export type GitHubWorkflowDispatchOptions = {
  workflows: GitHubWorkflow[];
  references: GitHubWorkflowReference[];
};

export type GitHubWorkflowDispatchInput = {
  name: string;
  description: string | null;
  required: boolean;
  inputType: GitHubWorkflowDispatchInputType;
  defaultValue: string | number | boolean | null;
  options: string[];
};

export type GitHubWorkflowDispatchConfig = {
  workflow: GitHubWorkflow;
  reference: string;
  dispatchable: boolean;
  inputs: GitHubWorkflowDispatchInput[];
};

export type GitHubWorkflowDispatchValue = string | number | boolean;

export type GitHubWorkflowRun = {
  id: number;
  workflowId: number;
  workflowName: string;
  title: string;
  runNumber: number;
  runAttempt: number;
  event: string;
  status: string;
  conclusion: string | null;
  headBranch: string | null;
  headSha: string;
  headCommitMessage: string | null;
  actor: string | null;
  actorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  url: string;
};

export type GitHubWorkflowRunPage = {
  runs: GitHubWorkflowRun[];
  totalCount: number;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubWorkflowStep = {
  name: string;
  number: number;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type GitHubWorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  runnerName: string | null;
  labels: string[];
  steps: GitHubWorkflowStep[];
  url: string;
};

export type GitHubWorkflowJobPage = {
  jobs: GitHubWorkflowJob[];
  totalCount: number;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubWorkflowJobLog = {
  jobId: number;
  content: string;
  truncated: boolean;
};

export type GitHubWorkflowArtifact = {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  createdAt: string;
  expiresAt: string;
};

export type GitHubWorkflowArtifactPage = {
  artifacts: GitHubWorkflowArtifact[];
  totalCount: number;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubIssueLabelPage = {
  labels: GitHubIssueLabel[];
};

export type GitHubIssueAssignee = {
  login: string;
  avatarUrl?: string;
};

export type GitHubIssueAssigneePage = {
  assignees: GitHubIssueAssignee[];
};

export type GitHubIssueMilestone = {
  number: number;
  title: string;
  description?: string;
  state: GitHubIssueMilestoneState;
  openIssues: number;
  closedIssues: number;
  dueOn?: string;
};

export type GitHubIssueMilestonePage = {
  milestones: GitHubIssueMilestone[];
};

export type GitHubBranch = {
  name: string;
  sha: string;
  protected: boolean;
};

export type GitHubCommitSummary = {
  sha: string;
  shortSha: string;
  title: string;
  author: string | null;
  url: string;
};

export type GitHubRepositoryCommit = GitHubCommit;

export type GitHubRepositoryCommitPage = {
  commits: GitHubRepositoryCommit[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubTag = {
  name: string;
  sha: string;
  zipballUrl: string;
  tarballUrl: string;
};

export type GitHubTagPage = {
  tags: GitHubTag[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubBlameRange = {
  startingLine: number;
  endingLine: number;
  age: number;
  commit: GitHubRepositoryCommit;
};

export type GitHubBlame = {
  ranges: GitHubBlameRange[];
};

export type GitHubCodeSearchResult = {
  name: string;
  path: string;
  sha: string;
  url: string;
  fragment: string | null;
};

export type GitHubCodeSearchPage = {
  results: GitHubCodeSearchResult[];
  totalCount: number;
  incompleteResults: boolean;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
};

export type GitHubFileDownloadResult = {
  saved: boolean;
  path: string | null;
};

export type GitHubReadme = {
  name: string;
  path: string;
  content: string;
  url: string;
};

export type GitHubCodeOverview = {
  branches: GitHubBranch[];
  tags: GitHubTag[];
  tagsHaveMore: boolean;
  commits: GitHubCommitSummary[];
  commitsHaveMore: boolean;
  readme?: GitHubReadme;
  canWrite: boolean;
  isArchived: boolean;
};

export type GitHubContentEntry = {
  name: string;
  path: string;
  sha: string;
  kind: "dir" | "file" | "symlink" | "submodule" | string;
  size: number;
  url?: string;
};

export type GitHubContentListing = {
  entries: GitHubContentEntry[];
};

type GitHubFilePreviewBase = {
  name: string;
  path: string;
  sha: string;
  size: number;
  url?: string;
  rawUrl?: string | null;
};

export type GitHubFilePreview =
  | (GitHubFilePreviewBase & {
      kind: "text";
      content: string;
    })
  | (GitHubFilePreviewBase & {
      kind: "unsupported";
      reason: "binary" | "tooLarge";
    });

export type GitHubRepositoryFileMutation =
  | {
      action: "create";
      path: string;
      content: string;
    }
  | {
      action: "update";
      path: string;
      expectedSha: string;
      content: string;
    }
  | {
      action: "rename";
      path: string;
      expectedSha: string;
      newPath: string;
      content: string;
    }
  | {
      action: "delete";
      path: string;
      expectedSha: string;
    };

export type GitHubRepositoryFileCommit = {
  branch: string;
  commitSha: string;
  shortSha: string;
  message: string;
  url: string;
  file: GitHubContentEntry | null;
  previousPath: string | null;
};

export type GitHubProjectStateFilter = "open" | "closed" | "all";
export type GitHubProjectSort = "updated" | "created" | "title";
export type GitHubProjectViewLayout = "board" | "table" | "roadmap";
export type GitHubProjectFieldType =
  | "assignees"
  | "linkedPullRequests"
  | "reviewers"
  | "labels"
  | "milestone"
  | "repository"
  | "title"
  | "text"
  | "singleSelect"
  | "multiSelect"
  | "number"
  | "date"
  | "iteration"
  | "tracks"
  | "trackedBy"
  | "issueType"
  | "parentIssue"
  | "subIssuesProgress"
  | "created"
  | "updated"
  | "closed"
  | "other";

export type GitHubProjectSummary = {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  public: boolean;
  closed: boolean;
  itemCount: number;
  updatedAt: string;
  viewerCanUpdate: boolean;
  viewerCanClose: boolean;
  viewerCanReopen: boolean;
};

export type GitHubProjectPage = {
  projects: GitHubProjectSummary[];
  totalCount: number;
  endCursor: string | null;
  hasMore: boolean;
};

export type GitHubProjectView = {
  id: string;
  number: number;
  name: string;
  layout: GitHubProjectViewLayout;
  filter: string;
  visibleFieldIds: string[];
  groupByFieldIds: string[];
  verticalGroupByFieldIds: string[];
};

export type GitHubProjectFieldOption = {
  id: string;
  name: string;
  color: string;
  description: string;
};

export type GitHubProjectIteration = {
  id: string;
  title: string;
  startDate: string;
  duration: number;
  completed: boolean;
};

export type GitHubProjectField = {
  id: string;
  name: string;
  dataType: GitHubProjectFieldType;
  issueField: boolean;
  editable: boolean;
  options: GitHubProjectFieldOption[];
  iterations: GitHubProjectIteration[];
};

export type GitHubProjectRepository = {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
};

export type GitHubProjectItemContent =
  | { kind: "draftIssue"; id: string; title: string; body: string }
  | {
      kind: "issue";
      id: string;
      title: string;
      body: string;
      number: number;
      url: string;
      state: string;
      repository: GitHubProjectRepository;
    }
  | {
      kind: "pullRequest";
      id: string;
      title: string;
      body: string;
      number: number;
      url: string;
      state: string;
      repository: GitHubProjectRepository;
    }
  | { kind: "redacted" };

export type GitHubProjectLabel = { name: string; color: string };
export type GitHubProjectUser = { login: string; avatarUrl: string | null };

export type GitHubProjectFieldValue =
  | { kind: "text"; fieldId: string; text: string }
  | { kind: "number"; fieldId: string; number: number }
  | { kind: "date"; fieldId: string; date: string }
  | {
      kind: "singleSelect";
      fieldId: string;
      optionId: string;
      name: string;
      color: string;
    }
  | { kind: "multiSelect"; fieldId: string; options: GitHubProjectFieldOption[] }
  | {
      kind: "iteration";
      fieldId: string;
      iterationId: string;
      title: string;
      startDate: string;
      duration: number;
    }
  | { kind: "labels"; fieldId: string; labels: GitHubProjectLabel[] }
  | { kind: "users"; fieldId: string; users: GitHubProjectUser[] }
  | { kind: "milestone"; fieldId: string; title: string }
  | { kind: "repository"; fieldId: string; fullName: string; url: string };

export type GitHubProjectItem = {
  id: string;
  archived: boolean;
  content: GitHubProjectItemContent;
  fieldValues: GitHubProjectFieldValue[];
  createdAt: string;
  updatedAt: string;
};

export type GitHubProjectItemPage = {
  items: GitHubProjectItem[];
  totalCount: number;
  endCursor: string | null;
  hasMore: boolean;
};

export type GitHubProjectDetail = {
  project: GitHubProjectSummary;
  readme: string;
  fields: GitHubProjectField[];
  views: GitHubProjectView[];
  items: GitHubProjectItemPage;
};

export type GitHubProjectUpdate = {
  title: string;
  shortDescription: string;
  readme: string;
  public: boolean;
  closed: boolean;
};

export type GitHubProjectItemAddition =
  | { kind: "draftIssue"; title: string; body: string }
  | { kind: "existingItem"; url: string };

export type GitHubProjectItemUpdate =
  | { kind: "draftIssue"; title: string; body: string }
  | { kind: "clearField"; fieldId: string }
  | { kind: "text"; fieldId: string; text: string }
  | { kind: "number"; fieldId: string; number: number }
  | { kind: "date"; fieldId: string; date: string }
  | { kind: "singleSelect"; fieldId: string; optionId: string }
  | { kind: "multiSelect"; fieldId: string; optionIds: string[] }
  | { kind: "iteration"; fieldId: string; iterationId: string };

export type GitHubProjectItemAction = "archive" | "unarchive" | "delete";
