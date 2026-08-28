import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubDiscussionComment,
  GitHubDiscussionDetailPage,
  GitHubDiscussionPage,
  GitHubDiscussionSummary,
} from "./github-data";
import {
  addRepositoryDiscussionPollVote,
  createRepositoryDiscussion,
  createRepositoryDiscussionComment,
  deleteRepositoryDiscussion,
  deleteRepositoryDiscussionComment,
  syncCreatedDiscussion,
  syncCreatedDiscussionComment,
  syncDiscussionAnswer,
  syncDeletedDiscussion,
  syncDeletedDiscussionComment,
  syncDiscussionPoll,
  syncDiscussionVote,
  syncUpdatedDiscussion,
  syncUpdatedDiscussionComment,
  updateRepositoryDiscussion,
  updateRepositoryDiscussionAnswer,
  updateRepositoryDiscussionComment,
  updateRepositoryDiscussionState,
  updateRepositoryDiscussionUpvote,
} from "./github-discussion-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = {
  owner: "octocat",
  repository: "hello-world",
  discussionNumber: 42,
};

const category = {
  id: "DC_kwDOA",
  name: "Q&A",
  slug: "q-a",
  emoji: ":pray:",
  isAnswerable: true,
};

const discussion: GitHubDiscussionSummary = {
  id: "D_kwDOB",
  number: 42,
  title: "How should Harbor present Discussions?",
  body: "Keep the complete workflow in the desktop app.",
  url: "https://github.com/octocat/hello-world/discussions/42",
  state: "open",
  locked: false,
  author: "octocat",
  authorAssociation: "OWNER",
  category,
  commentCount: 1,
  upvoteCount: 3,
  createdAt: "2026-08-28T08:00:00Z",
  updatedAt: "2026-08-28T09:00:00Z",
  viewerCanClose: true,
  viewerCanDelete: true,
  viewerCanReopen: false,
  viewerCanUpdate: true,
  viewerCanUpvote: true,
  viewerDidAuthor: true,
  viewerHasUpvoted: false,
};

const comment: GitHubDiscussionComment = {
  id: "DC_1",
  body: "A focused answer.",
  url: "https://github.com/octocat/hello-world/discussions/42#discussioncomment-1",
  author: "hubot",
  authorAssociation: "COLLABORATOR",
  createdAt: "2026-08-28T10:00:00Z",
  updatedAt: "2026-08-28T10:00:00Z",
  isAnswer: false,
  isMinimized: false,
  upvoteCount: 2,
  viewerCanDelete: true,
  viewerCanMarkAsAnswer: true,
  viewerCanUnmarkAsAnswer: false,
  viewerCanUpdate: true,
  viewerCanUpvote: true,
  viewerDidAuthor: false,
  viewerHasUpvoted: false,
  replies: [],
  repliesHaveMore: false,
};

function detailData(
  value: GitHubDiscussionSummary = discussion
): InfiniteData<GitHubDiscussionDetailPage, string | null> {
  return {
    pages: [
      {
        discussion: value,
        comments: [comment],
        commentCount: 1,
        hasMore: false,
      },
    ],
    pageParams: [null],
  };
}

function listData(
  value: GitHubDiscussionSummary = discussion
): InfiniteData<GitHubDiscussionPage, string | null> {
  return {
    pages: [
      {
        enabled: true,
        discussions: [value],
        totalCount: 1,
        hasMore: false,
      },
    ],
    pageParams: [null],
  };
}

describe("GitHub Discussion mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("invokes focused Tauri commands with official node IDs", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(discussion)
      .mockResolvedValueOnce(discussion)
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce({ ...discussion, state: "closed" })
      .mockResolvedValueOnce({
        subjectId: discussion.id,
        upvoteCount: 4,
        viewerCanUpvote: true,
        viewerHasUpvoted: true,
      })
      .mockResolvedValueOnce({ ...discussion, answerId: comment.id })
      .mockResolvedValueOnce({
        id: "DP_1",
        question: "Which workflow?",
        totalVoteCount: 4,
        viewerCanVote: true,
        viewerHasVoted: true,
        options: [
          {
            id: "DPO_1",
            option: "Discussions",
            totalVoteCount: 4,
            viewerHasVoted: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        discussionId: discussion.id,
        discussionNumber: discussion.number,
      })
      .mockResolvedValueOnce({
        commentId: comment.id,
        preserved: false,
      });

    await createRepositoryDiscussion(target, {
      categoryId: category.id,
      title: discussion.title,
      body: discussion.body,
    });
    await updateRepositoryDiscussion(target, {
      categoryId: category.id,
      title: "Updated",
      body: "Updated body",
    });
    await createRepositoryDiscussionComment(target, "Reply", comment.id);
    await updateRepositoryDiscussionComment(comment.id, "Edited reply");
    await updateRepositoryDiscussionState(target, "closed", "resolved");
    await updateRepositoryDiscussionUpvote(discussion.id, true);
    await updateRepositoryDiscussionAnswer(comment.id, true);
    await addRepositoryDiscussionPollVote(target, "DPO_1");
    await deleteRepositoryDiscussion(target);
    await deleteRepositoryDiscussionComment(target, comment.id);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_create_repository_discussion", {
      owner: target.owner,
      repository: target.repository,
      categoryId: category.id,
      title: discussion.title,
      body: discussion.body,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_repository_discussion", {
      ...target,
      categoryId: category.id,
      title: "Updated",
      body: "Updated body",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_create_repository_discussion_comment", {
      ...target,
      replyToId: comment.id,
      body: "Reply",
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "github_update_repository_discussion_comment", {
      commentId: comment.id,
      body: "Edited reply",
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "github_update_repository_discussion_state", {
      ...target,
      discussionState: "closed",
      closeReason: "resolved",
    });
    expect(invoke).toHaveBeenNthCalledWith(6, "github_update_repository_discussion_upvote", {
      subjectId: discussion.id,
      upvoted: true,
    });
    expect(invoke).toHaveBeenNthCalledWith(7, "github_update_repository_discussion_answer", {
      commentId: comment.id,
      answered: true,
    });
    expect(invoke).toHaveBeenNthCalledWith(8, "github_add_repository_discussion_poll_vote", {
      ...target,
      pollOptionId: "DPO_1",
    });
    expect(invoke).toHaveBeenNthCalledWith(9, "github_delete_repository_discussion", target);
    expect(invoke).toHaveBeenNthCalledWith(10, "github_delete_repository_discussion_comment", {
      ...target,
      commentId: comment.id,
    });
  });

  it("primes a newly created Discussion conversation", () => {
    const queryClient = new QueryClient();

    syncCreatedDiscussion(queryClient, target, discussion);

    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(
        githubQueryKeys.discussionDetail(target)
      )?.pages[0]
    ).toEqual({ discussion, comments: [], commentCount: 0, hasMore: false });
  });

  it("adds root comments and replies without duplicating list counts", () => {
    const queryClient = new QueryClient();
    const detailKey = githubQueryKeys.discussionDetail(target);
    const listKey = githubQueryKeys.discussions({
      ...target,
      categoryId: null,
      state: "open",
      answered: "all",
      sort: "updated",
    });
    queryClient.setQueryData(detailKey, detailData());
    queryClient.setQueryData(listKey, listData());
    const rootComment = { ...comment, id: "DC_2", body: "Root comment" };
    const reply = { ...comment, id: "DC_3", body: "Threaded reply" };

    syncCreatedDiscussionComment(queryClient, target, rootComment);
    syncCreatedDiscussionComment(queryClient, target, reply, comment.id);

    const detail =
      queryClient.getQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(detailKey)
        ?.pages[0];
    expect(detail?.comments.map((item) => item.id)).toEqual([comment.id, rootComment.id]);
    expect(detail?.comments[0].replies[0]).toEqual(reply);
    expect(detail?.commentCount).toBe(2);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(listKey)?.pages[0]
        .discussions[0].commentCount
    ).toBe(2);
  });

  it("removes a closed Discussion from open caches and updates closed caches", () => {
    const queryClient = new QueryClient();
    const openKey = githubQueryKeys.discussions({
      ...target,
      categoryId: null,
      state: "open",
      answered: "all",
      sort: "updated",
    });
    const closedKey = githubQueryKeys.discussions({
      ...target,
      categoryId: null,
      state: "closed",
      answered: "all",
      sort: "updated",
    });
    queryClient.setQueryData(openKey, listData());
    queryClient.setQueryData(closedKey, listData({ ...discussion, state: "closed" }));
    queryClient.setQueryData(githubQueryKeys.discussionDetail(target), detailData());
    const closed = {
      ...discussion,
      state: "closed" as const,
      stateReason: "RESOLVED",
      viewerCanClose: false,
      viewerCanReopen: true,
    };

    syncUpdatedDiscussion(queryClient, target, closed);

    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(openKey)?.pages[0]
    ).toMatchObject({ discussions: [], totalCount: 0 });
    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(closedKey)
        ?.pages[0].discussions[0]
    ).toEqual(closed);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(
        githubQueryKeys.discussionDetail(target)
      )?.pages[0].discussion
    ).toEqual(closed);
  });

  it("synchronizes comment edits, votes, and the single chosen answer", () => {
    const queryClient = new QueryClient();
    const detailKey = githubQueryKeys.discussionDetail(target);
    const second = { ...comment, id: "DC_2", body: "Second answer" };
    const data = detailData();
    data.pages[0].comments.push(second);
    queryClient.setQueryData(detailKey, data);
    const edited = { ...comment, body: "Edited answer" };

    syncUpdatedDiscussionComment(queryClient, target, edited);
    syncDiscussionVote(queryClient, target, {
      subjectId: comment.id,
      upvoteCount: 3,
      viewerCanUpvote: true,
      viewerHasUpvoted: true,
    });
    syncDiscussionAnswer(queryClient, target, { ...discussion, answerId: second.id });

    const comments =
      queryClient.getQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(detailKey)
        ?.pages[0].comments;
    expect(comments?.[0]).toMatchObject({
      body: "Edited answer",
      upvoteCount: 3,
      viewerHasUpvoted: true,
      isAnswer: false,
    });
    expect(comments?.[1].isAnswer).toBe(true);
  });

  it("synchronizes poll votes and removes a deleted Discussion from every cached page", () => {
    const queryClient = new QueryClient();
    const detailKey = githubQueryKeys.discussionDetail(target);
    const listKey = githubQueryKeys.discussions({
      ...target,
      categoryId: null,
      state: "all",
      answered: "all",
      sort: "updated",
    });
    queryClient.setQueryData(detailKey, detailData());
    queryClient.setQueryData(listKey, listData());
    const poll = {
      id: "DP_1",
      question: "Which workflow?",
      totalVoteCount: 4,
      viewerCanVote: true,
      viewerHasVoted: true,
      options: [
        {
          id: "DPO_1",
          option: "Discussions",
          totalVoteCount: 4,
          viewerHasVoted: true,
        },
      ],
    };

    syncDiscussionPoll(queryClient, target, poll);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(detailKey)
        ?.pages[0].poll
    ).toEqual(poll);

    syncDeletedDiscussion(queryClient, target, {
      discussionId: discussion.id,
      discussionNumber: discussion.number,
    });
    expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(listKey)?.pages[0]
    ).toMatchObject({ discussions: [], totalCount: 0 });
  });

  it("removes leaf comments while preserving deleted parents that still own replies", () => {
    const queryClient = new QueryClient();
    const detailKey = githubQueryKeys.discussionDetail(target);
    const listKey = githubQueryKeys.discussions({
      ...target,
      categoryId: null,
      state: "open",
      answered: "all",
      sort: "updated",
    });
    const reply = { ...comment, id: "DC_reply", body: "Reply" };
    const parent = { ...comment, replies: [reply] };
    const data = detailData({ ...discussion, answerId: comment.id });
    data.pages[0].comments = [parent];
    queryClient.setQueryData(detailKey, data);
    queryClient.setQueryData(listKey, listData({ ...discussion, answerId: comment.id }));

    syncDeletedDiscussionComment(queryClient, target, {
      commentId: reply.id,
      replyToId: parent.id,
      preserved: false,
    });
    syncDeletedDiscussionComment(queryClient, target, {
      commentId: parent.id,
      deletedAt: "2026-08-28T11:00:00Z",
      preserved: true,
    });

    const detail =
      queryClient.getQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(detailKey)
        ?.pages[0];
    expect(detail?.comments).toHaveLength(1);
    expect(detail?.comments[0]).toMatchObject({
      id: parent.id,
      body: "",
      deletedAt: "2026-08-28T11:00:00Z",
      replies: [],
      viewerCanDelete: false,
    });
    expect(detail?.discussion.answerId).toBeUndefined();
    expect(detail?.commentCount).toBe(1);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(listKey)?.pages[0]
        .discussions[0]
    ).toMatchObject({ commentCount: 1, answerId: undefined });
  });

  it("decrements conversation and list counts when a root comment is fully deleted", () => {
    const queryClient = new QueryClient();
    const detailKey = githubQueryKeys.discussionDetail(target);
    const listKey = githubQueryKeys.discussions({
      ...target,
      categoryId: null,
      state: "open",
      answered: "all",
      sort: "updated",
    });
    queryClient.setQueryData(detailKey, detailData());
    queryClient.setQueryData(listKey, listData());

    syncDeletedDiscussionComment(queryClient, target, {
      commentId: comment.id,
      preserved: false,
    });

    const detail =
      queryClient.getQueryData<InfiniteData<GitHubDiscussionDetailPage, string | null>>(detailKey)
        ?.pages[0];
    expect(detail).toMatchObject({ comments: [], commentCount: 0 });
    expect(detail?.discussion.commentCount).toBe(0);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubDiscussionPage, string | null>>(listKey)?.pages[0]
        .discussions[0].commentCount
    ).toBe(0);
  });
});
