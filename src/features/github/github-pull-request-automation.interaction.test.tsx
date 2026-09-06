// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitHubPullRequest } from "./github-data";
import { GitHubPullRequestAutoMerge } from "./github-pull-request-auto-merge";
import { GitHubPullRequestBranchUpdate } from "./github-pull-request-branch-update";
import { GitHubPullRequestMergeAutomation } from "./github-pull-request-merge-queue";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const repository = {
  owner: "octocat",
  name: "harbor",
  fullName: "octocat/harbor",
  url: "https://github.com/octocat/harbor",
};
const pullRequest: GitHubPullRequest = {
  id: 1,
  number: 1,
  title: "Keep review context",
  url: `${repository.url}/pull/1`,
  state: "open",
  draft: false,
  merged: false,
  mergeable: true,
  author: "octocat",
  assignees: [],
  requestedReviewers: [],
  requestedTeams: [],
  labels: [],
  locked: false,
  headRef: "feature",
  baseRef: "main",
  headSha: "abc1234",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  commits: 1,
  comments: 0,
  reviewComments: 0,
};
const autoMerge = {
  state: "available",
  headSha: pullRequest.headSha,
  allowedMergeMethods: ["merge"],
  viewerCanEnable: true,
  viewerCanDisable: false,
};
const cases = [
  {
    name: "available branch update",
    Component: GitHubPullRequestBranchUpdate,
    command: "github_get_repository_pull_request_branch_update_status",
    data: { state: "available", headSha: pullRequest.headSha, behindBy: 3 },
    label: "workspace.repositories.pullRequestBranchBehind",
  },
  {
    name: "previously up-to-date branch",
    Component: GitHubPullRequestBranchUpdate,
    command: "github_get_repository_pull_request_branch_update_status",
    data: { state: "upToDate", headSha: pullRequest.headSha, behindBy: 0 },
    label: null,
  },
  {
    name: "available auto-merge",
    Component: GitHubPullRequestAutoMerge,
    command: "github_get_repository_pull_request_auto_merge_status",
    data: autoMerge,
    label: "workspace.repositories.pullRequestAutoMergeStatuses.available.title",
  },
  {
    name: "previously unnecessary auto-merge",
    Component: GitHubPullRequestAutoMerge,
    command: "github_get_repository_pull_request_auto_merge_status",
    data: { ...autoMerge, state: "notNeeded" },
    label: null,
  },
  {
    name: "queued pull request",
    Component: GitHubPullRequestMergeAutomation,
    command: "github_get_repository_pull_request_merge_queue_status",
    data: {
      state: "queued",
      headSha: pullRequest.headSha,
      baseRef: "main",
      viewerCanEnqueue: false,
      viewerCanDequeue: true,
    },
    label: "workspace.repositories.pullRequestMergeQueueEntryStates.queued.title",
  },
  {
    name: "queue status while auto-merge is shown",
    Component: GitHubPullRequestMergeAutomation,
    command: "github_get_repository_pull_request_merge_queue_status",
    data: {
      state: "notConfigured",
      headSha: pullRequest.headSha,
      baseRef: "main",
      viewerCanEnqueue: false,
      viewerCanDequeue: false,
    },
    label: "workspace.repositories.pullRequestAutoMergeStatuses.available.title",
  },
];

describe("pull request automation refresh feedback", () => {
  it.each(cases)(
    "marks $name stale and recovers on retry",
    async ({ Component, command, data, label }) => {
      let fail = false;
      vi.mocked(invoke).mockReset();
      vi.mocked(invoke).mockImplementation((name) => {
        if (name === command)
          return fail
            ? Promise.reject({ code: "githubNetwork", message: "offline" })
            : Promise.resolve(data);
        if (name === "github_get_repository_pull_request_auto_merge_status")
          return Promise.resolve(autoMerge);
        return Promise.reject(new Error(`Unexpected command ${name}`));
      });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={queryClient}>
          <Component repository={repository} pullRequest={pullRequest} />
        </QueryClientProvider>
      );
      await waitFor(() =>
        expect(
          queryClient
            .getQueryCache()
            .getAll()
            .every((query) => query.state.status === "success")
        ).toBe(true)
      );
      if (label) await screen.findByText(label);
      fail = true;
      await act(() => queryClient.invalidateQueries());
      expect(await screen.findByText("common.staleResults")).toBeTruthy();
      expect(screen.getByText("offline")).toBeTruthy();
      if (label) expect(screen.getByText(label)).toBeTruthy();
      fail = false;
      await user.click(screen.getByRole("button", { name: "common.retry" }));
      await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
      if (label) expect(screen.getByText(label)).toBeTruthy();
    }
  );
});
