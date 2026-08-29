import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubCodeOverview, GitHubFilePreview } from "./github-data";
import {
  discussionCategoriesQueryOptions,
  developerFeedQueryOptions,
  discoverySearchQueryOptions,
  discussionDetailQueryOptions,
  discussionsQueryOptions,
  gistCommentsQueryOptions,
  gistQueryOptions,
  gistRevisionQueryOptions,
  gistRevisionsQueryOptions,
  gistsQueryOptions,
  repositoryBlameQueryOptions,
  repositoryCodeSearchQueryOptions,
  repositoryCodeQueryOptions,
  repositoryCommitsQueryOptions,
  repositoryFileQueryOptions,
  repositoryIssueDetailQueryOptions,
  repositoryIssueAssigneesQueryOptions,
  repositoryIssueLabelsQueryOptions,
  repositoryIssueMilestonesQueryOptions,
  repositoryIssuesQueryOptions,
  issueInboxQueryOptions,
  repositoriesQueryOptions,
  repositoryRelationshipQueryOptions,
  repositoryCreationOptionsQueryOptions,
  personalRepositorySettingsQueryOptions,
  repositoryPagesHealthQueryOptions,
  repositoryPagesQueryOptions,
  profileActivityQueryOptions,
  profileConnectionsQueryOptions,
  starredRepositoriesQueryOptions,
  userContributionsQueryOptions,
  userProfileQueryOptions,
  notificationsQueryOptions,
  pendingPullRequestReviewQueryOptions,
  pullRequestAutoMergeStatusQueryOptions,
  pullRequestBranchUpdateStatusQueryOptions,
  pullRequestComparisonQueryOptions,
  pullRequestMergeQueueStatusQueryOptions,
  repositoryPullRequestDetailQueryOptions,
  repositoryPullRequestReviewTeamsQueryOptions,
  repositoryPullRequestsQueryOptions,
  repositoryReleaseQueryOptions,
  repositoryReleasesQueryOptions,
  repositoryTagsQueryOptions,
  pullRequestCommitsQueryOptions,
  pullRequestFilesQueryOptions,
  pullRequestReviewThreadsQueryOptions,
  pullRequestInboxQueryOptions,
  repositoryCheckSuiteRunsQueryOptions,
  repositoryCheckSuiteQueryOptions,
  repositoryChecksQueryOptions,
  repositoryWorkflowRunQueryOptions,
  repositoryWorkflowRunFilterOptionsQueryOptions,
  repositoryWorkflowRunsQueryOptions,
  repositoryWorkflowsQueryOptions,
  resetGitHubQueryCache,
  workflowDispatchConfigQueryOptions,
  workflowDispatchOptionsQueryOptions,
  workflowJobLogQueryOptions,
  workflowRunArtifactsQueryOptions,
  workflowRunJobsQueryOptions,
} from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const overview: GitHubCodeOverview = {
  branches: [{ name: "main", sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", protected: true }],
  tags: [],
  tagsHaveMore: false,
  commits: [],
  commitsHaveMore: false,
  canWrite: true,
  isArchived: false,
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

describe("GitHub repository queries", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(overview);
  });

  it("loads authenticated repositories through one paginated cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ repositories: [{ id: 1 }], page: 1, hasMore: true })
      .mockResolvedValueOnce({ repositories: [{ id: 2 }], page: 2, hasMore: false });
    const options = repositoriesQueryOptions();

    await client.fetchInfiniteQuery(options);
    const observer = new InfiniteQueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.fetchNextPage();
    unsubscribe();

    expect(options.queryKey).toEqual(["github", "repositories"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repositories", { page: 1 });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repositories", { page: 2 });
    expect(observer.getCurrentResult().data?.pages.map((page) => page.page)).toEqual([1, 2]);
  });

  it("loads the signed-in user's starred workspace and repository relationship state", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ repositories: [], page: 1, hasMore: false })
      .mockResolvedValueOnce({
        starred: true,
        watchLevel: "allActivity",
        viewerLogin: "octocat",
        viewerOwnsRepository: false,
      });
    const starred = starredRepositoriesQueryOptions({ sort: "starred" });
    const relationship = repositoryRelationshipQueryOptions({
      owner: "hubot",
      repository: "hello-world",
    });

    await client.fetchInfiniteQuery(starred);
    await client.fetchQuery(relationship);

    expect(starred.queryKey).toEqual(["github", "starred-repositories", "starred"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_starred_repositories", {
      sort: "starred",
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_repository_relationship", {
      owner: "hubot",
      repository: "hello-world",
    });
  });

  it("keeps repository creation options and owner settings in focused caches", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ gitignoreTemplates: ["Rust"], licenses: [] })
      .mockResolvedValueOnce({ repository: { id: 42 }, visibility: "private" });
    const creation = repositoryCreationOptionsQueryOptions();
    const settings = personalRepositorySettingsQueryOptions({
      owner: "octocat",
      repository: "harbor",
    });

    await client.fetchQuery(creation);
    await client.fetchQuery(settings);

    expect(creation.queryKey).toEqual(["github", "repository-creation-options"]);
    expect(settings.queryKey).toEqual(["github", "repository", "octocat", "harbor", "settings"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_creation_options");
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_personal_repository_settings", {
      owner: "octocat",
      repository: "harbor",
    });
  });

  it("keeps Pages history pages and domain health in focused caches", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ site: { status: "built" }, builds: [], page: 2 })
      .mockResolvedValueOnce({ pending: false, domain: { valid: true } });
    const pages = repositoryPagesQueryOptions({
      owner: "octocat",
      repository: "harbor",
      page: 2,
    });
    const health = repositoryPagesHealthQueryOptions({
      owner: "octocat",
      repository: "harbor",
    });

    await client.fetchQuery(pages);
    await client.fetchQuery(health);

    expect(pages.queryKey).toEqual(["github", "repository", "octocat", "harbor", "pages", 2]);
    expect(health.queryKey).toEqual(["github", "repository", "octocat", "harbor", "pages-health"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_pages", {
      owner: "octocat",
      repository: "harbor",
      page: 2,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_repository_pages_health", {
      owner: "octocat",
      repository: "harbor",
    });
  });

  it("keeps Gist lists, details, revisions, and comments in focused caches", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ gists: [{ id: "abc123" }], page: 1, hasMore: false })
      .mockResolvedValueOnce({ id: "abc123", files: [] })
      .mockResolvedValueOnce({ revisions: [], page: 1, hasMore: false })
      .mockResolvedValueOnce({ gistId: "abc123", version: "a".repeat(40), files: [] })
      .mockResolvedValueOnce({ comments: [], page: 1, hasMore: false });
    const list = gistsQueryOptions({ source: "starred" });
    const detail = gistQueryOptions({ gistId: "abc123" });
    const revisions = gistRevisionsQueryOptions({ gistId: "abc123" });
    const revision = gistRevisionQueryOptions({ gistId: "abc123", version: "a".repeat(40) });
    const comments = gistCommentsQueryOptions({ gistId: "abc123" });

    await client.fetchInfiniteQuery(list);
    await client.fetchQuery(detail);
    await client.fetchInfiniteQuery(revisions);
    await client.fetchQuery(revision);
    await client.fetchInfiniteQuery(comments);

    expect(list.queryKey).toEqual(["github", "gists", "starred"]);
    expect(detail.queryKey).toEqual(["github", "gist", "abc123"]);
    expect(revisions.queryKey).toEqual(["github", "gist", "abc123", "revisions"]);
    expect(revision.queryKey).toEqual(["github", "gist", "abc123", "revision", "a".repeat(40)]);
    expect(comments.queryKey).toEqual(["github", "gist", "abc123", "comments"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_gists", {
      source: "starred",
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_gist", { gistId: "abc123" });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_gist_revisions", {
      gistId: "abc123",
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_get_gist_revision", {
      gistId: "abc123",
      version: "a".repeat(40),
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "github_list_gist_comments", {
      gistId: "abc123",
      page: 1,
    });
  });

  it("loads profiles, contributions, social pages, and public activity through focused keys", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ login: "octocat" })
      .mockResolvedValueOnce({ login: "octocat", weeks: [] })
      .mockResolvedValueOnce({ users: [], page: 1, hasMore: false })
      .mockResolvedValueOnce({ activities: [], page: 1, hasMore: false });
    const profile = userProfileQueryOptions({ username: null });
    const contributions = userContributionsQueryOptions({ username: "octocat" });
    const followers = profileConnectionsQueryOptions({
      username: "octocat",
      kind: "followers",
    });
    const activity = profileActivityQueryOptions({ username: "octocat" });

    await client.fetchQuery(profile);
    await client.fetchQuery(contributions);
    await client.fetchInfiniteQuery(followers);
    await client.fetchInfiniteQuery(activity);

    expect(profile.queryKey).toEqual(["github", "profile", "viewer"]);
    expect(contributions.queryKey).toEqual(["github", "profile", "octocat", "contributions"]);
    expect(followers.queryKey).toEqual(["github", "profile", "octocat", "followers"]);
    expect(activity.queryKey).toEqual(["github", "profile", "octocat", "activity"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_user_profile", { username: null });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_user_contributions", {
      username: "octocat",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_profile_connections", {
      username: "octocat",
      kind: "followers",
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_list_profile_activity", {
      username: "octocat",
      page: 1,
    });
  });

  it("keeps global search types and the developer feed in focused paginated caches", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        kind: "code",
        results: [],
        totalCount: 0,
        incompleteResults: false,
        page: 2,
        hasPrevious: true,
        hasMore: false,
      })
      .mockResolvedValueOnce({ events: [], page: 1, hasMore: true })
      .mockResolvedValueOnce({ events: [], page: 2, hasMore: false });
    const search = discoverySearchQueryOptions({
      kind: "code",
      query: "language:rust harbor",
      sort: "indexed",
      page: 2,
    });
    const feed = developerFeedQueryOptions();

    await client.fetchQuery(search);
    await client.fetchInfiniteQuery(feed);
    const observer = new InfiniteQueryObserver(client, feed);
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.fetchNextPage();
    unsubscribe();

    expect(search.queryKey).toEqual([
      "github",
      "discovery",
      "search",
      "code",
      "language:rust harbor",
      "indexed",
      2,
    ]);
    expect(feed.queryKey).toEqual(["github", "discovery", "feed"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_search_discovery", {
      kind: "code",
      query: "language:rust harbor",
      sort: "indexed",
      page: 2,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_developer_feed", { page: 1 });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_developer_feed", { page: 2 });
  });

  it("keys notification pages by participation scope and invokes the focused command", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      notifications: [],
      page: 3,
      hasPrevious: true,
      hasMore: false,
    });
    const options = notificationsQueryOptions({ participating: true, page: 3 });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual(["github", "notifications", "participating", 3]);
    expect(invoke).toHaveBeenCalledWith("github_list_notifications", {
      participating: true,
      page: 3,
    });
  });

  it("keeps Discussion categories in a repository-scoped cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      enabled: true,
      repositoryId: "R_kwDOA",
      categories: [],
    });
    const options = discussionCategoriesQueryOptions({
      owner: "octocat",
      repository: "hello-world",
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "discussion-categories",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_repository_discussion_categories", {
      owner: "octocat",
      repository: "hello-world",
    });
  });

  it("keeps paginated Releases separate from stable release details", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ releases: [{ id: 88 }], page: 2, hasPrevious: true, hasMore: true })
      .mockResolvedValueOnce({ id: 88, tagName: "v1.0.0" });
    const list = repositoryReleasesQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      page: 2,
    });
    const detail = repositoryReleaseQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      releaseId: 88,
    });

    await client.fetchQuery(list);
    await client.fetchQuery(detail);

    expect(list.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "releases",
      2,
    ]);
    expect(detail.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "release",
      88,
    ]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repository_releases", {
      owner: "octocat",
      repository: "hello-world",
      page: 2,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_repository_release", {
      owner: "octocat",
      repository: "hello-world",
      releaseId: 88,
    });
  });

  it("loads cursor-paginated Discussion filters through one cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        enabled: true,
        discussions: [],
        totalCount: 31,
        endCursor: "cursor-1",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        enabled: true,
        discussions: [],
        totalCount: 31,
        hasMore: false,
      });
    const options = discussionsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      categoryId: "DC_kwDOA",
      state: "open",
      answered: "unanswered",
      sort: "updated",
    });

    await client.fetchInfiniteQuery(options);
    const observer = new InfiniteQueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.fetchNextPage();
    unsubscribe();

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "discussions",
      "DC_kwDOA",
      "open",
      "unanswered",
      "updated",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repository_discussions", {
      owner: "octocat",
      repository: "hello-world",
      categoryId: "DC_kwDOA",
      discussionState: "open",
      answered: "unanswered",
      sort: "updated",
      after: null,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repository_discussions", {
      owner: "octocat",
      repository: "hello-world",
      categoryId: "DC_kwDOA",
      discussionState: "open",
      answered: "unanswered",
      sort: "updated",
      after: "cursor-1",
    });
  });

  it("paginates a Discussion conversation by its stable number", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        discussion: { number: 42 },
        comments: [],
        commentCount: 31,
        endCursor: "comment-cursor-1",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        discussion: { number: 42 },
        comments: [],
        commentCount: 31,
        hasMore: false,
      });
    const options = discussionDetailQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      discussionNumber: 42,
    });

    await client.fetchInfiniteQuery(options);
    const observer = new InfiniteQueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.fetchNextPage();
    unsubscribe();

    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_discussion", {
      owner: "octocat",
      repository: "hello-world",
      discussionNumber: 42,
      after: null,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_repository_discussion", {
      owner: "octocat",
      repository: "hello-world",
      discussionNumber: 42,
      after: "comment-cursor-1",
    });
  });

  it("deduplicates matching in-flight reads and reuses fresh Code data", async () => {
    const client = createTestQueryClient();
    const options = repositoryCodeQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });

    const [first, second] = await Promise.all([
      client.fetchQuery(options),
      client.fetchQuery(options),
    ]);
    const cached = await client.fetchQuery(options);

    expect(first).toEqual(overview);
    expect(second).toEqual(overview);
    expect(cached).toEqual(overview);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_code_overview", {
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });
  });

  it("refetches Code data after explicit invalidation", async () => {
    const client = createTestQueryClient();
    const options = repositoryCodeQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });

    await client.fetchQuery(options);
    await client.invalidateQueries({ queryKey: options.queryKey, exact: true });
    await client.fetchQuery(options);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("loads and caches a repository file by revision and path", async () => {
    const client = createTestQueryClient();
    const preview: GitHubFilePreview = {
      kind: "text",
      name: "main.rs",
      path: "src/main.rs",
      sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      size: 13,
      url: "https://github.com/octocat/hello-world/blob/main/src/main.rs",
      content: "fn main() {}\n",
    };
    vi.mocked(invoke).mockResolvedValueOnce(preview);
    const options = repositoryFileQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
      path: "src/main.rs",
    });

    const first = await client.fetchQuery(options);
    const cached = await client.fetchQuery(options);

    expect(first).toEqual(preview);
    expect(cached).toEqual(preview);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_file", {
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
      path: "src/main.rs",
    });
  });

  it("keeps history, tags, blame, and code search in separate repository caches", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ commits: [], page: 2 })
      .mockResolvedValueOnce({ tags: [], page: 3 })
      .mockResolvedValueOnce({ ranges: [] })
      .mockResolvedValueOnce({ results: [], totalCount: 0, page: 1 });
    const commits = repositoryCommitsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
      path: "src/main.rs",
      page: 2,
    });
    const tags = repositoryTagsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      page: 3,
    });
    const blame = repositoryBlameQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
      path: "src/main.rs",
    });
    const search = repositoryCodeSearchQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      query: "render path:src",
      page: 1,
    });

    await client.fetchQuery(commits);
    await client.fetchQuery(tags);
    await client.fetchQuery(blame);
    await client.fetchQuery(search);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repository_commits", {
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
      path: "src/main.rs",
      page: 2,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repository_tags", {
      owner: "octocat",
      repository: "hello-world",
      page: 3,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_get_repository_blame", {
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
      path: "src/main.rs",
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_search_repository_code", {
      owner: "octocat",
      repository: "hello-world",
      query: "render path:src",
      page: 1,
    });
    expect(new Set([commits.queryKey, tags.queryKey, blame.queryKey, search.queryKey]).size).toBe(
      4
    );
  });

  it("keys and invokes Issue pages with their complete server-side filters", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      issues: [],
      totalCount: 61,
      page: 3,
      hasPrevious: true,
      hasMore: false,
    });
    const options = repositoryIssuesQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      state: "closed",
      assignment: "unassigned",
      query: "render crash",
      label: "bug",
      sort: "comments",
      page: 3,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "issues",
      "closed",
      "unassigned",
      "render crash",
      "bug",
      "comments",
      3,
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
      owner: "octocat",
      repository: "hello-world",
      issueState: "closed",
      assignment: "unassigned",
      query: "render crash",
      label: "bug",
      sort: "comments",
      page: 3,
    });
  });

  it("loads and caches an Issue conversation by timeline page", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      issue: { id: 2, number: 7, title: "Keep the example focused" },
      timeline: [],
      timelinePage: 2,
      timelineHasPrevious: true,
      timelineHasMore: false,
    });
    const options = repositoryIssueDetailQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      timelinePage: 2,
    });

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      timelinePage: 2,
    });
  });

  it("keys and invokes account Issue pages with their complete scope", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      issues: [],
      totalCount: 61,
      page: 3,
      hasPrevious: true,
      hasMore: false,
    });
    const options = issueInboxQueryOptions({
      scope: "mentioned",
      state: "closed",
      query: "repo:octocat/hello-world crash",
      sort: "comments",
      page: 3,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "issue-inbox",
      "mentioned",
      "closed",
      "repo:octocat/hello-world crash",
      "comments",
      3,
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_issue_inbox", {
      scope: "mentioned",
      issueState: "closed",
      query: "repo:octocat/hello-world crash",
      sort: "comments",
      page: 3,
    });
  });

  it("keeps Issue metadata options in separate repository caches", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ labels: [] })
      .mockResolvedValueOnce({ assignees: [] })
      .mockResolvedValueOnce({ milestones: [] });
    const target = { owner: "octocat", repository: "hello-world" };
    const labels = repositoryIssueLabelsQueryOptions(target);
    const assignees = repositoryIssueAssigneesQueryOptions(target);
    const milestones = repositoryIssueMilestonesQueryOptions(target);

    await client.fetchQuery(labels);
    await client.fetchQuery(assignees);
    await client.fetchQuery(milestones);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repository_issue_labels", target);
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repository_issue_assignees", target);
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_repository_issue_milestones", target);
    expect(new Set([labels.queryKey, assignees.queryKey, milestones.queryKey]).size).toBe(3);
  });

  it("keys and invokes pull request pages with repository filters", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      pullRequests: [],
      totalCount: 42,
      page: 2,
      hasPrevious: true,
      hasMore: true,
    });
    const options = repositoryPullRequestsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      state: "closed",
      query: "author:hubot crash",
      label: "bug",
      sort: "comments",
      page: 2,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-requests",
      "closed",
      "author:hubot crash",
      "bug",
      "comments",
      2,
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestState: "closed",
      query: "author:hubot crash",
      label: "bug",
      sort: "comments",
      page: 2,
    });
  });

  it("keys and invokes account pull request inbox pages by scope", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      pullRequests: [],
      totalCount: 12,
      page: 3,
      hasPrevious: true,
      hasMore: false,
    });
    const options = pullRequestInboxQueryOptions({
      scope: "reviewRequested",
      state: "open",
      query: "label:bug render",
      sort: "updated",
      page: 3,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "pull-request-inbox",
      "reviewRequested",
      "open",
      "label:bug render",
      "updated",
      3,
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_pull_request_inbox", {
      scope: "reviewRequested",
      pullRequestState: "open",
      query: "label:bug render",
      sort: "updated",
      page: 3,
    });
  });

  it("keeps pull request conversation and heavy review sections in separate cache entries", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ pullRequest: { number: 12 }, timeline: [] })
      .mockResolvedValueOnce({ commits: [], page: 1 })
      .mockResolvedValueOnce({ files: [], page: 1 })
      .mockResolvedValueOnce({ checks: [], page: 1 });
    const detail = repositoryPullRequestDetailQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      timelinePage: 1,
    });
    const commits = pullRequestCommitsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 1,
    });
    const files = pullRequestFilesQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 1,
    });
    const checks = repositoryChecksQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "abc1234",
      page: 1,
    });

    await client.fetchQuery(detail);
    await client.fetchQuery(commits);
    await client.fetchQuery(files);
    await client.fetchQuery(checks);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_pull_request", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      timelinePage: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_pull_request_commits", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_pull_request_files", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_list_repository_checks", {
      owner: "octocat",
      repository: "hello-world",
      reference: "abc1234",
      page: 1,
    });
    expect(new Set([detail.queryKey, commits.queryKey, files.queryKey, checks.queryKey]).size).toBe(
      4
    );
  });

  it("checks pull request branch update eligibility in a focused cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      state: "available",
      headSha: "abc1234",
      behindBy: 3,
    });
    const options = pullRequestBranchUpdateStatusQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-request",
      12,
      "branch-update-status",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_pull_request_branch_update_status", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });
  });

  it("keeps pull request auto-merge capability in a focused cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      state: "available",
      headSha: "abc1234",
      mergeStateStatus: "BLOCKED",
      allowedMergeMethods: ["merge", "squash"],
      mergeMethod: null,
      enabledAt: null,
      enabledBy: null,
      viewerCanEnable: true,
      viewerCanDisable: false,
    });
    const options = pullRequestAutoMergeStatusQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-request",
      12,
      "auto-merge-status",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_pull_request_auto_merge_status", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });
  });

  it("keeps pull request merge queue state in a focused polling cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      state: "queued",
      headSha: "abc1234",
      baseRef: "main",
      mergeStateStatus: "CLEAN",
      queueUrl: "https://github.com/octocat/hello-world/queue/main",
      entry: {
        id: "MQE_example",
        position: 3,
        state: "awaitingChecks",
        enqueuedAt: "2026-08-27T15:00:00Z",
        enqueuedBy: "octocat",
        estimatedTimeToMergeSeconds: 420,
        headSha: "queue123",
        jump: false,
      },
      viewerCanEnqueue: false,
      viewerCanDequeue: true,
    });
    const options = pullRequestMergeQueueStatusQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-request",
      12,
      "merge-queue-status",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_pull_request_merge_queue_status", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });
  });

  it("compares pull request branches in an exact repository cache", async () => {
    const client = createTestQueryClient();
    const comparison = {
      base: "main",
      head: "feature/create",
      status: "ahead",
      aheadBy: 2,
      behindBy: 0,
      totalCommits: 2,
      changedFiles: 3,
      additions: 42,
      deletions: 7,
      commits: [],
      suggestedTitle: "feature/create",
    } as const;
    vi.mocked(invoke).mockResolvedValueOnce(comparison);
    const options = pullRequestComparisonQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      base: "main",
      head: "feature/create",
    });

    const result = await client.fetchQuery(options);

    expect(result).toEqual(comparison);
    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-request-comparison",
      "main",
      "feature/create",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_compare_repository_pull_request_branches", {
      owner: "octocat",
      repository: "hello-world",
      base: "main",
      head: "feature/create",
    });
  });

  it("keeps repository review teams in a shared pull request option cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      teams: [{ name: "Core maintainers", slug: "core-maintainers" }],
    });
    const options = repositoryPullRequestReviewTeamsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
    });

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-request-review-teams",
    ]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_request_review_teams", {
      owner: "octocat",
      repository: "hello-world",
    });
  });

  it("loads pull request review threads through a cursor-paginated cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      threads: [],
      endCursor: "cursor-2",
      hasMore: true,
    });
    const options = pullRequestReviewThreadsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });

    await client.fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-request",
      12,
      "review-threads",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_pull_request_review_threads", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      after: null,
    });
  });

  it("loads the viewer pending review in a pull-request-scoped cache", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 87,
      nodeId: "PRR_87",
      body: "Please cover the edge case.",
      comments: [],
      uneditableCommentCount: 0,
    });
    const options = pendingPullRequestReviewQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "pull-request",
      12,
      "pending-review",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_get_pending_repository_pull_request_review", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
    });
  });

  it("keeps workflow filters, runs, jobs, artifacts, and on-demand logs in separate cache entries", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ branches: ["main"], events: ["push"], actors: ["octocat"] })
      .mockResolvedValueOnce({ runs: [], totalCount: 0, page: 2 })
      .mockResolvedValueOnce({ jobs: [], totalCount: 0, page: 1 })
      .mockResolvedValueOnce({ artifacts: [], totalCount: 0, page: 3 })
      .mockResolvedValueOnce({ jobId: 84, content: "Finished", truncated: false });
    const filters = repositoryWorkflowRunFilterOptionsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      workflowId: 7,
    });
    const runs = repositoryWorkflowRunsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      workflowId: 7,
      status: "failure",
      branch: "release/v1",
      event: "workflow_dispatch",
      actor: "octocat",
      page: 2,
    });
    const jobs = workflowRunJobsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      runId: 42,
      page: 1,
    });
    const log = workflowJobLogQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      jobId: 84,
    });
    const artifacts = workflowRunArtifactsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      runId: 42,
      page: 3,
    });

    await client.fetchQuery(filters);
    await client.fetchQuery(runs);
    await client.fetchQuery(jobs);
    await client.fetchQuery(artifacts);
    await client.fetchQuery(log);

    expect(filters.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "workflow-runs",
      "filters",
      7,
    ]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_workflow_run_filter_options", {
      owner: "octocat",
      repository: "hello-world",
      workflowId: 7,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repository_workflow_runs", {
      owner: "octocat",
      repository: "hello-world",
      workflowId: 7,
      status: "failure",
      branch: "release/v1",
      event: "workflow_dispatch",
      actor: "octocat",
      page: 2,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_workflow_run_jobs", {
      owner: "octocat",
      repository: "hello-world",
      runId: 42,
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_list_workflow_run_artifacts", {
      owner: "octocat",
      repository: "hello-world",
      runId: 42,
      page: 3,
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "github_get_workflow_job_log", {
      owner: "octocat",
      repository: "hello-world",
      jobId: 84,
    });
    expect(
      new Set([filters.queryKey, runs.queryKey, jobs.queryKey, artifacts.queryKey, log.queryKey])
        .size
    ).toBe(5);
  });

  it("loads notification workflow runs and check suites from stable IDs", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ id: 42, title: "CI" })
      .mockResolvedValueOnce({ id: 66, headSha: "abc1234" })
      .mockResolvedValueOnce({ checks: [], totalCount: 0, page: 2 });
    const run = repositoryWorkflowRunQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      runId: 42,
    });
    const suite = repositoryCheckSuiteQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      checkSuiteId: 66,
    });
    const suiteRuns = repositoryCheckSuiteRunsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      checkSuiteId: 66,
      page: 2,
    });

    await client.fetchQuery(run);
    await client.fetchQuery(suite);
    await client.fetchQuery(suiteRuns);

    expect(run.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "workflow-run",
      42,
    ]);
    expect(suite.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "check-suite",
      66,
    ]);
    expect(suiteRuns.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "check-suite",
      66,
      "runs",
      2,
    ]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_workflow_run", {
      owner: "octocat",
      repository: "hello-world",
      runId: 42,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_repository_check_suite", {
      owner: "octocat",
      repository: "hello-world",
      checkSuiteId: 66,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_repository_check_suite_runs", {
      owner: "octocat",
      repository: "hello-world",
      checkSuiteId: 66,
      page: 2,
    });
  });

  it("loads repository workflows separately from filtered run pages", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke).mockResolvedValueOnce([
      {
        id: 7,
        name: "CI",
        path: ".github/workflows/ci.yml",
        state: "active",
        url: "https://github.com/octocat/hello-world/actions/workflows/ci.yml",
      },
    ]);
    const options = repositoryWorkflowsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "workflows",
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_repository_workflows", {
      owner: "octocat",
      repository: "hello-world",
    });
  });

  it("loads workflow dispatch choices separately from the selected ref definition", async () => {
    const client = createTestQueryClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ workflows: [], references: [] })
      .mockResolvedValueOnce({
        workflow: { id: 7, name: "Release" },
        reference: "main",
        dispatchable: true,
        inputs: [],
      });
    const options = workflowDispatchOptionsQueryOptions({
      owner: "octocat",
      repository: "hello-world",
    });
    const config = workflowDispatchConfigQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      workflowId: 7,
      reference: "main",
    });

    await client.fetchQuery(options);
    await client.fetchQuery(config);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "workflow-dispatch",
      "options",
    ]);
    expect(config.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "workflow-dispatch",
      7,
      "main",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_workflow_dispatch_options", {
      owner: "octocat",
      repository: "hello-world",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_get_workflow_dispatch_config", {
      owner: "octocat",
      repository: "hello-world",
      workflowId: 7,
      reference: "main",
    });
  });

  it("resets active GitHub data on an account change without clearing unrelated data", async () => {
    const client = createTestQueryClient();
    const options = repositoryCodeQueryOptions({
      owner: "octocat",
      repository: "hello-world",
      reference: "main",
    });
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.refetch();
    client.setQueryData(["settings", "theme"], "dark");
    client.setQueryData(["github", "repository", "old", "private", "issues"], {
      issues: [{ id: 1 }],
    });

    let resolveRefetch: ((value: GitHubCodeOverview) => void) | undefined;
    const nextOverview = { ...overview, commitsHaveMore: true };
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve as (value: GitHubCodeOverview) => void;
        })
    );

    const reset = resetGitHubQueryCache(client);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBeUndefined());
    resolveRefetch?.(nextOverview);
    await reset;

    expect(observer.getCurrentResult().data).toEqual(nextOverview);
    expect(
      client.getQueryData(["github", "repository", "old", "private", "issues"])
    ).toBeUndefined();
    expect(client.getQueryData(["settings", "theme"])).toBe("dark");
    unsubscribe();
  });
});
