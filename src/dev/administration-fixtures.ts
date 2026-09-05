import type * as Data from "@/features/github/github-data";

const timestamp = "2026-09-01T10:00:00Z";
const pagination = { page: 1, hasPrevious: false, hasMore: false };
const category: Data.GitHubDiscussionCategory = {
  id: "DIC_preview",
  name: "Ideas and feedback",
  slug: "ideas-and-feedback",
  description: "Share practical suggestions for the workspace.",
  emoji: "💡",
  isAnswerable: true,
};
const discussions: Data.GitHubDiscussionSummary[] = [
  "Keeping review context when returning to a long list",
  "Which workspace improvement should come next?",
  "An answered question about keyboard navigation",
  "A closed discussion with a longer title that wraps in a compact window",
].map((title, index) => ({
  id: `D_preview_${index + 1}`,
  number: index + 1,
  title,
  body: "## Workspace feedback\n\nKeep related context together when moving between a list and its detail. Filters and scroll position help readers resume their work.\n\n- Support keyboard navigation.\n- Keep long descriptions readable.\n- Preserve independent query results.",
  url: `https://github.com/harbor-preview/harbor/discussions/${index + 1}`,
  state: index === 3 ? "closed" : "open",
  stateReason: index === 3 ? "resolved" : undefined,
  locked: index === 3,
  author: "alex-morgan",
  authorAssociation: "MEMBER",
  category,
  answerId: index === 2 ? "DC_preview_1" : undefined,
  commentCount: 3,
  upvoteCount: 14 - index,
  createdAt: timestamp,
  updatedAt: timestamp,
  viewerCanClose: true,
  viewerCanDelete: true,
  viewerCanReopen: true,
  viewerCanUpdate: true,
  viewerCanUpvote: true,
  viewerDidAuthor: false,
  viewerHasUpvoted: false,
}));
const comments: Data.GitHubDiscussionComment[] = [
  "The list can remember its scroll position for each filter. This also makes keyboard navigation easier to resume.",
  "A minimized comment remains available for inspection.",
  "This comment was removed.",
].map((body, index) => ({
  id: `DC_preview_${index + 1}`,
  body,
  url: `https://github.com/harbor-preview/harbor/discussions/1#discussioncomment-${index + 1}`,
  author: "lin-chen",
  authorAssociation: "CONTRIBUTOR",
  createdAt: timestamp,
  updatedAt: timestamp,
  isAnswer: false,
  isMinimized: index === 1,
  minimizedReason: index === 1 ? "off-topic" : undefined,
  deletedAt: index === 2 ? timestamp : undefined,
  upvoteCount: 4,
  viewerCanDelete: true,
  viewerCanMarkAsAnswer: true,
  viewerCanUnmarkAsAnswer: true,
  viewerCanUpdate: true,
  viewerCanUpvote: true,
  viewerCanMinimize: true,
  viewerCanUnminimize: true,
  viewerDidAuthor: false,
  viewerHasUpvoted: false,
  replies: [],
  repliesHaveMore: false,
}));
const poll: Data.GitHubDiscussionPoll = {
  id: "DP_preview",
  question: "Which workspace improvement should come next?",
  totalVoteCount: 20,
  viewerCanVote: true,
  viewerHasVoted: false,
  options: [
    "Faster review navigation",
    "More accessible keyboard controls",
    "Clearer refresh feedback",
  ].map((option, index) => ({
    id: `DPO_preview_${index}`,
    option,
    totalVoteCount: [9, 7, 4][index],
    viewerHasVoted: false,
  })),
};
const collaborator: Data.GitHubRepositoryAccessUser = {
  id: 21,
  login: "alex-morgan",
  avatarUrl: "",
  url: "https://github.com/alex-morgan",
};

export function administrationFixture(
  command: string,
  args: Record<string, unknown>,
  repositories: Data.GitHubRepository[],
  empty: boolean
): unknown {
  const repository = repositories[0];
  if (command === "github_list_repository_discussion_categories")
    return {
      enabled: true,
      repositoryId: "R_preview",
      categories: [category],
    } satisfies Data.GitHubDiscussionCategoryPage;
  if (command === "github_list_repository_discussions") {
    const filtered = empty
      ? []
      : discussions.filter(
          (item) =>
            (!args.discussionState ||
              args.discussionState === "all" ||
              item.state === args.discussionState) &&
            (!args.categoryId || item.category.id === args.categoryId) &&
            (args.answered === "answered"
              ? Boolean(item.answerId)
              : args.answered === "unanswered"
                ? !item.answerId
                : true)
        );
    return {
      enabled: true,
      discussions: filtered,
      totalCount: filtered.length,
      hasMore: false,
    } satisfies Data.GitHubDiscussionPage;
  }
  if (command === "github_get_repository_discussion") {
    const discussion =
      discussions.find((item) => item.number === args.discussionNumber) ?? discussions[0];
    return {
      discussion,
      poll: discussion.number === 2 ? poll : null,
      comments: empty
        ? []
        : comments.map((comment, index) => ({
            ...comment,
            isAnswer: discussion.number === 3 && index === 0,
          })),
      commentCount: empty ? 0 : comments.length,
      hasMore: false,
    } satisfies Data.GitHubDiscussionDetailPage;
  }
  if (command === "github_get_personal_repository_settings")
    return {
      repository,
      homepage: "https://example.com/harbor",
      visibility: "public",
      isTemplate: false,
      hasIssues: true,
      hasProjects: true,
      hasWiki: true,
      hasDiscussions: true,
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: false,
      allowAutoMerge: true,
      allowUpdateBranch: true,
      deleteBranchOnMerge: true,
    } satisfies Data.GitHubRepositorySettings;
  if (command === "github_get_personal_repository_topics")
    return {
      names: empty ? [] : ["desktop", "github", "workspace"],
    } satisfies Data.GitHubRepositoryTopics;
  if (command === "github_list_personal_repository_collaborators")
    return {
      ...pagination,
      collaborators: empty ? [] : [collaborator],
    } satisfies Data.GitHubRepositoryCollaboratorPage;
  if (command === "github_list_personal_repository_invitations")
    return {
      ...pagination,
      invitations: empty
        ? []
        : [
            {
              id: 31,
              invitee: { ...collaborator, id: 22, login: "lin-chen" },
              inviter: collaborator,
              createdAt: timestamp,
            },
          ],
    } satisfies Data.GitHubRepositoryInvitationPage;
  if (command === "github_get_repository_pages")
    return {
      ...pagination,
      isArchived: false,
      site: empty
        ? undefined
        : {
            status: "built",
            url: "https://example.com/harbor",
            buildType: "legacy",
            source: { branch: "main", path: "docs" },
            customDomain: "docs.example.com",
            custom404: false,
            public: true,
            httpsEnforced: true,
            certificate: {
              state: "approved",
              domains: ["docs.example.com"],
              expiresAt: "2026-12-01T10:00:00Z",
            },
          },
      builds: empty
        ? []
        : ["built", "errored"].map((status, index) => ({
            status,
            error: index ? "The documentation build could not resolve a relative link." : undefined,
            pusher: "harbor-preview",
            commit: "d291348a9f51a76fcbb3ad0e1c81a440378f280b",
            durationMilliseconds: 12800,
            createdAt: `2026-09-01T10:0${index}:00Z`,
            updatedAt: timestamp,
          })),
    } satisfies Data.GitHubPagesWorkspace;
  if (command === "github_get_repository_pages_health")
    return {
      pending: false,
      domain: {
        host: "docs.example.com",
        dnsResolves: true,
        proxied: false,
        valid: true,
        respondsToHttps: true,
        enforcesHttps: true,
        httpsEligible: true,
      },
    } satisfies Data.GitHubPagesHealth;
  return undefined;
}
