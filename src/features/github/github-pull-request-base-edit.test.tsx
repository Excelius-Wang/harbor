import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";
import type { GitHubPullRequest, GitHubPullRequestBaseBranchPage } from "./github-data";
import {
  GitHubPullRequestBaseEdit,
  canChangePullRequestBase,
  collectPullRequestBaseBranches,
} from "./github-pull-request-base-edit";

vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const pullRequest: GitHubPullRequest = {
  id: 3,
  number: 12,
  title: "Ship the PR workspace",
  body: "Pull request body",
  url: "https://github.com/octocat/hello-world/pull/12",
  state: "open",
  draft: false,
  merged: false,
  mergeable: true,
  mergeableState: "clean",
  author: "octocat",
  assignees: [],
  requestedReviewers: [],
  requestedTeams: [],
  labels: [],
  locked: false,
  headRef: "feature/pr-workspace",
  headSha: "abc1234",
  baseRef: "main",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  commits: 1,
  comments: 0,
  reviewComments: 0,
};

const page = (
  value: Partial<GitHubPullRequestBaseBranchPage> = {}
): GitHubPullRequestBaseBranchPage => ({
  pullRequestNumber: 12,
  currentBase: "main",
  currentBaseSha: "base1234",
  headSha: "abc1234",
  branches: [],
  page: 1,
  hasPrevious: false,
  hasMore: false,
  ...value,
});

describe("pull request base edit", () => {
  it("allows open and draft PRs but not closed or merged PRs", () => {
    expect(canChangePullRequestBase(pullRequest)).toBe(true);
    expect(canChangePullRequestBase({ ...pullRequest, draft: true })).toBe(true);
    expect(canChangePullRequestBase({ ...pullRequest, state: "closed" })).toBe(false);
    expect(canChangePullRequestBase({ ...pullRequest, merged: true })).toBe(false);
  });

  it("deduplicates and sorts consistent pages while preserving the current base", () => {
    expect(
      collectPullRequestBaseBranches([
        page({
          branches: [{ name: "release", sha: "release123", protected: true }],
          hasMore: true,
        }),
        page({
          page: 2,
          hasPrevious: true,
          branches: [
            { name: "develop", sha: "develop123", protected: false },
            { name: "release", sha: "release123", protected: true },
          ],
        }),
      ])?.branches.map((branch) => branch.name)
    ).toEqual(["develop", "main", "release"]);
    expect(
      collectPullRequestBaseBranches([page(), page({ page: 2, currentBaseSha: "moved" })])
    ).toBeNull();
  });

  it("renders the action only for eligible pull requests", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const render = (value: GitHubPullRequest) =>
      renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <GitHubPullRequestBaseEdit
            repository={{
              owner: "octocat",
              name: "hello-world",
              fullName: "octocat/hello-world",
              url: "https://github.com/octocat/hello-world",
            }}
            pullRequest={value}
          />
        </QueryClientProvider>
      );
    expect(render(pullRequest)).toContain("workspace.repositories.changePullRequestBase");
    expect(render({ ...pullRequest, state: "closed" })).toBe("");
  });

  it("keeps the official impact warning precise in English and Chinese", () => {
    expect(en.workspace.repositories.changePullRequestBaseWarning).toContain("may be removed");
    expect(en.workspace.repositories.changePullRequestBaseWarning).toContain("may become outdated");
    expect(en.workspace.repositories.changePullRequestBaseWarning).not.toContain("deleted");
    expect(zh.workspace.repositories.changePullRequestBaseWarning).toContain(
      "可能会从时间线中移除"
    );
    expect(zh.workspace.repositories.changePullRequestBaseWarning).toContain("可能变为已过期");
  });
});
