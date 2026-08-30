import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubReactionSubject } from "./github-data";
import { githubQueryKeys, repositoryReactionsQueryOptions } from "./github-queries";
import {
  chunkReactionSubjects,
  normalizeReactionSubjects,
  optimisticallyUpdateReaction,
  restoreReactionQueries,
  snapshotReactionQueries,
  syncReactionSubject,
  updateRepositoryReaction,
} from "./github-reactions";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const repository = { owner: "octocat", repository: "hello-world" };
const issueRef = { id: "I_kwDOA", kind: "issue" } as const;
const commitCommentRef = { id: "CC_kwDOA", kind: "commitComment" } as const;
const issue: GitHubReactionSubject = {
  ...issueRef,
  viewerCanReact: true,
  groups: [
    { content: "thumbsUp", count: 3, viewerHasReacted: false },
    { content: "heart", count: 1, viewerHasReacted: true },
  ],
};

describe("GitHub reactions", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("normalizes stable subjects and batches at GitHub's nodes limit", () => {
    const subjects = Array.from({ length: 101 }, (_, index) => ({
      id: ` I_${String(index).padStart(3, "0")} `,
      kind: "issueComment" as const,
    }));
    subjects.push({ id: " I_000 ", kind: "issueComment" });

    expect(normalizeReactionSubjects(subjects)).toHaveLength(101);
    expect(chunkReactionSubjects(subjects).map((batch) => batch.length)).toEqual([100, 1]);
    expect(chunkReactionSubjects(subjects)[0][0]).toEqual({
      id: "I_000",
      kind: "issueComment",
    });
    expect(normalizeReactionSubjects([commitCommentRef])).toEqual([commitCommentRef]);
  });

  it("invokes native reads and desired-state writes with opaque subject references", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([issue]).mockResolvedValueOnce(issue);
    const query = repositoryReactionsQueryOptions({ ...repository, subjects: [issueRef] });

    await query.queryFn?.({} as never);
    await updateRepositoryReaction(repository, issueRef, "rocket", true);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_reactions", {
      ...repository,
      subjects: [issueRef],
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_repository_reaction", {
      ...repository,
      subject: issueRef,
      content: "rocket",
      reacted: true,
    });
  });

  it("applies optimistic add and remove states without negative or empty groups", () => {
    expect(optimisticallyUpdateReaction(issue, "thumbsUp", true).groups[0]).toEqual({
      content: "thumbsUp",
      count: 4,
      viewerHasReacted: true,
    });
    expect(optimisticallyUpdateReaction(issue, "heart", false).groups).toEqual([
      { content: "thumbsUp", count: 3, viewerHasReacted: false },
    ]);
    expect(optimisticallyUpdateReaction(issue, "eyes", false)).toBe(issue);
  });

  it("replaces canonical and batch caches only inside the selected repository", () => {
    const queryClient = new QueryClient();
    const batchKey = githubQueryKeys.reactions({ ...repository, subjects: [issueRef] });
    const otherRepository = { owner: "octocat", repository: "other" };
    const otherKey = githubQueryKeys.reactions({ ...otherRepository, subjects: [issueRef] });
    queryClient.setQueryData(batchKey, [issue]);
    queryClient.setQueryData(otherKey, [issue]);

    const updated = optimisticallyUpdateReaction(issue, "rocket", true);
    syncReactionSubject(queryClient, repository, updated);

    expect(
      queryClient.getQueryData(githubQueryKeys.reaction({ ...repository, subject: issueRef }))
    ).toEqual(updated);
    expect(queryClient.getQueryData<GitHubReactionSubject[]>(batchKey)).toEqual([updated]);
    expect(queryClient.getQueryData<GitHubReactionSubject[]>(otherKey)).toEqual([issue]);
  });

  it("restores every repository reaction cache after an optimistic write fails", () => {
    const queryClient = new QueryClient();
    const batchKey = githubQueryKeys.reactions({ ...repository, subjects: [issueRef] });
    const canonicalKey = githubQueryKeys.reaction({ ...repository, subject: issueRef });
    queryClient.setQueryData(batchKey, [issue]);
    queryClient.setQueryData(canonicalKey, issue);
    const snapshots = snapshotReactionQueries(queryClient, repository);

    syncReactionSubject(
      queryClient,
      repository,
      optimisticallyUpdateReaction(issue, "rocket", true)
    );
    restoreReactionQueries(queryClient, snapshots);

    expect(queryClient.getQueryData<GitHubReactionSubject[]>(batchKey)).toEqual([issue]);
    expect(queryClient.getQueryData<GitHubReactionSubject>(canonicalKey)).toEqual(issue);
  });

  it("serializes desired-state writes and continues after a failed request", async () => {
    let rejectFirst: (reason: Error) => void = () => undefined;
    const firstRequest = new Promise<GitHubReactionSubject>((_resolve, reject) => {
      rejectFirst = reject;
    });
    vi.mocked(invoke)
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce(issue);

    const firstUpdate = updateRepositoryReaction(repository, issueRef, "rocket", true);
    const secondUpdate = updateRepositoryReaction(repository, issueRef, "rocket", false);
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledTimes(1);
    rejectFirst(new Error("network unavailable"));
    await expect(firstUpdate).rejects.toThrow("network unavailable");
    await expect(secondUpdate).resolves.toEqual(issue);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
