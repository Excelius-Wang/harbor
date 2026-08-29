import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GitHubPullRequestFileViewStateSnapshot } from "./github-data";
import {
  GitHubPullRequestFilesErrorAlert,
  GitHubPullRequestFileViewCheckbox,
  getPullRequestFileViewPresentation,
  hasUnmatchedPullRequestFileViewStates,
} from "./github-pull-request-file-view-state";
import {
  markRepositoryPullRequestFileViewed,
  syncPullRequestFileViewedState,
  unmarkRepositoryPullRequestFileViewed,
  updatePullRequestFileViewedState,
} from "./github-pull-request-mutations";
import { githubQueryKeys } from "./github-queries";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const target = {
  owner: "octocat",
  repository: "hello-world",
  pullRequestNumber: 12,
};

function snapshot(): GitHubPullRequestFileViewStateSnapshot {
  return {
    pullRequestId: "PR_kwDOexample",
    files: [
      { path: "src/viewed.ts", state: "viewed" },
      { path: "src/fresh.ts", state: "unviewed" },
    ],
  };
}

describe("pull request file viewed state", () => {
  it("keeps dismissed files distinct from ordinary unviewed files", () => {
    expect(getPullRequestFileViewPresentation("viewed")).toEqual({
      checked: true,
      changedSinceViewed: false,
    });
    expect(getPullRequestFileViewPresentation("unviewed")).toEqual({
      checked: false,
      changedSinceViewed: false,
    });
    expect(getPullRequestFileViewPresentation("dismissed")).toEqual({
      checked: false,
      changedSinceViewed: true,
    });
  });

  it("does not report unmatched files until the state snapshot has loaded", () => {
    const files = [{ path: "src/app.ts" }];

    expect(hasUnmatchedPullRequestFileViewStates(files, undefined)).toBe(false);
    expect(hasUnmatchedPullRequestFileViewStates(files, snapshot())).toBe(true);
    expect(
      hasUnmatchedPullRequestFileViewStates(files, {
        pullRequestId: "PR_kwDOexample",
        files: [{ path: "src/app.ts", state: "unviewed" }],
      })
    ).toBe(false);
  });

  it("renders checked, dismissed, and pending states accessibly", () => {
    const viewed = renderToStaticMarkup(
      <GitHubPullRequestFileViewCheckbox state="viewed" pending={false} onChange={vi.fn()} />
    );
    const dismissed = renderToStaticMarkup(
      <GitHubPullRequestFileViewCheckbox state="dismissed" pending={false} onChange={vi.fn()} />
    );
    const pending = renderToStaticMarkup(
      <GitHubPullRequestFileViewCheckbox state="unviewed" pending onChange={vi.fn()} />
    );

    expect(viewed).toContain('data-state="checked"');
    expect(dismissed).toContain('data-file-view-state="dismissed"');
    expect(dismissed).toContain("workspace.repositories.fileChangedSinceViewed");
    expect(pending).toContain("disabled");
  });

  it("renders a retryable file-state error", () => {
    const html = renderToStaticMarkup(
      <GitHubPullRequestFilesErrorAlert
        title="File states failed"
        message="Refresh the pull request"
        actionLabel="Refresh"
        onAction={vi.fn()}
      />
    );

    expect(html).toContain("File states failed");
    expect(html).toContain("Refresh the pull request");
    expect(html).toContain("Refresh");
    expect(html).toContain("button");
  });

  it("invokes focused mark and unmark commands", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ path: "src/viewed.ts", state: "viewed" })
      .mockResolvedValueOnce({ path: "src/viewed.ts", state: "unviewed" });

    await markRepositoryPullRequestFileViewed("PR_kwDOexample", "src/viewed.ts");
    await unmarkRepositoryPullRequestFileViewed("PR_kwDOexample", "src/viewed.ts");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_mark_repository_pull_request_file_viewed", {
      pullRequestId: "PR_kwDOexample",
      path: "src/viewed.ts",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_unmark_repository_pull_request_file_viewed", {
      pullRequestId: "PR_kwDOexample",
      path: "src/viewed.ts",
    });
  });

  it("reconciles one path without dropping other file states", () => {
    const queryClient = new QueryClient();
    const key = githubQueryKeys.pullRequestFileViewStates(target);
    queryClient.setQueryData(key, snapshot());

    syncPullRequestFileViewedState(queryClient, target, "src/fresh.ts", "viewed");

    expect(queryClient.getQueryData<GitHubPullRequestFileViewStateSnapshot>(key)).toEqual({
      pullRequestId: "PR_kwDOexample",
      files: [
        { path: "src/viewed.ts", state: "viewed" },
        { path: "src/fresh.ts", state: "viewed" },
      ],
    });
  });

  it("keeps the cached state unchanged when a mutation fails", async () => {
    const queryClient = new QueryClient();
    const key = githubQueryKeys.pullRequestFileViewStates(target);
    const before = snapshot();
    queryClient.setQueryData(key, before);
    vi.mocked(invoke).mockRejectedValueOnce({ code: "github", message: "stale path" });

    await expect(
      updatePullRequestFileViewedState(queryClient, target, "PR_kwDOexample", "src/fresh.ts", true)
    ).rejects.toEqual({ code: "github", message: "stale path" });

    expect(queryClient.getQueryData(key)).toEqual(before);
  });
});
