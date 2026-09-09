import type * as Data from "@/features/github/github-data";
import { administrationFixture } from "./administration-fixtures";

/** Stateful, opt-in discussion writes. All returned objects are isolated snapshots. */
export function createDiscussionActionFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean
) {
  const pages = new Map<string, Data.GitHubDiscussionDetailPage>();
  let sequence = 0;
  const timestamp = "2026-09-09T08:00:00Z";
  function pageFor(args: Record<string, unknown>) {
    const repository = repositories.find(
      (item) => item.owner === args.owner && item.name === args.repository
    );
    const number = Number(args.discussionNumber);
    if (!repository || !Number.isInteger(number) || number < 1 || number > 4) return;
    const key = `${repository.fullName}/${number}`;
    let page = pages.get(key);
    if (!page) {
      page = structuredClone(
        administrationFixture("github_get_repository_discussion", args, repositories, false)
      ) as Data.GitHubDiscussionDetailPage;
      page.discussion.id = `D_nested_${key}`;
      page.discussion.url = `${repository.url}/discussions/${number}`;
      const seed = page.comments[0];
      const comment = (suffix: string, body: string): Data.GitHubDiscussionComment => ({
        ...seed,
        id: `DC_nested_${key}/${suffix}`,
        url: `${page!.discussion.url}#discussioncomment-${suffix}`,
        body,
        replies: [],
        repliesHaveMore: false,
      });
      page.comments = [
        comment(
          "root",
          "Parent comment: preserve this thread and its nested replies when editing. 父评论与回复应保持连续。"
        ),
        { ...comment("removed", ""), deletedAt: timestamp, author: undefined },
      ];
      page.comments[0].replies = [
        comment(
          "reply",
          "Nested reply: keyboard focus and draft content must survive failed writes. 嵌套回复的草稿需要保留。"
        ),
        {
          ...comment("minimized", "A minimized nested reply remains readable when expanded."),
          isMinimized: true,
          minimizedReason: "off-topic",
        },
      ];
      page.comments[1].replies = [comment("survivor", "This reply survives the deleted parent.")];
      page.comments[0].repliesHaveMore = scenario === "more";
      page.commentCount = page.discussion.commentCount = page.comments.length;
      page.discussion.answerId = undefined;
      if (scenario === "closed") {
        page.discussion.state = "closed";
        page.discussion.locked = true;
      }
      if (scenario === "readonly") {
        Object.assign(page.discussion, {
          viewerCanClose: false,
          viewerCanDelete: false,
          viewerCanReopen: false,
          viewerCanUpdate: false,
          viewerCanUpvote: false,
        });
        const revoke = (comments: Data.GitHubDiscussionComment[]) =>
          comments.forEach((item) => {
            Object.assign(item, {
              viewerCanDelete: false,
              viewerCanUpdate: false,
              viewerCanUpvote: false,
              viewerCanMarkAsAnswer: false,
              viewerCanUnmarkAsAnswer: false,
              viewerCanMinimize: false,
              viewerCanUnminimize: false,
            });
            revoke(item.replies);
          });
        revoke(page.comments);
      }
      pages.set(key, page);
    }
    return page;
  }
  function findComment(
    comments: Data.GitHubDiscussionComment[],
    id: unknown
  ):
    | {
        comment: Data.GitHubDiscussionComment;
        siblings: Data.GitHubDiscussionComment[];
        parent?: Data.GitHubDiscussionComment;
      }
    | undefined {
    for (const comment of comments) {
      if (comment.id === id) return { comment, siblings: comments };
      const nested = findComment(comment.replies, id);
      if (nested) return { ...nested, parent: nested.parent ?? comment };
    }
  }
  return (command: string, args: Record<string, unknown>, empty = false): unknown => {
    if (!scenario) return undefined;
    if (command === "github_list_repository_discussions") {
      const result = structuredClone(
        administrationFixture(
          command,
          { ...args, discussionState: "all", answered: "all" },
          repositories,
          empty
        )
      ) as Data.GitHubDiscussionPage;
      result.discussions = result.discussions
        .map(
          (discussion) =>
            pageFor({ ...args, discussionNumber: discussion.number })?.discussion ?? discussion
        )
        .filter(
          (discussion) =>
            (!args.discussionState ||
              args.discussionState === "all" ||
              discussion.state === args.discussionState) &&
            (args.answered === "answered"
              ? Boolean(discussion.answerId)
              : args.answered === "unanswered"
                ? !discussion.answerId
                : true)
        );
      result.totalCount = result.discussions.length;
      return structuredClone(result);
    }
    if (command === "github_get_repository_discussion") {
      const page = pageFor(args);
      if (!page) return undefined;
      const snapshot = structuredClone(page);
      if (empty) {
        snapshot.comments = [];
        snapshot.commentCount = snapshot.discussion.commentCount = 0;
      }
      return snapshot;
    }
    const supported = [
      "github_create_repository_discussion_comment",
      "github_update_repository_discussion_comment",
      "github_delete_repository_discussion_comment",
      "github_mutate_repository_discussion_comment",
      "github_update_repository_discussion_upvote",
      "github_update_repository_discussion_answer",
    ];
    if (!supported.includes(command) || !acceptWrites) return undefined;
    const mutation = args.mutation as Record<string, unknown> | undefined;
    const id = args.commentId ?? args.subjectId ?? mutation?.commentId;
    const page = args.owner
      ? pageFor(args)
      : [...pages.values()].find(
          (item) => item.discussion.id === id || findComment(item.comments, id)
        );
    if (!page) throw new Error("Unknown preview discussion target");
    if (scenario === "readonly") throw new Error("Preview discussion is read-only");
    const found = findComment(page.comments, id);
    if (command === "github_create_repository_discussion_comment") {
      const parent = args.replyToId
        ? findComment(page.comments, args.replyToId)?.comment
        : undefined;
      if (page.discussion.locked || (args.replyToId && !parent))
        throw new Error("Preview reply target is unavailable");
      const comment: Data.GitHubDiscussionComment = {
        ...page.comments[0],
        id: `DC_nested_created_${++sequence}`,
        body: String(args.body),
        author: "harbor-preview",
        createdAt: timestamp,
        updatedAt: timestamp,
        url: `${page.discussion.url}#discussioncomment-created-${sequence}`,
        replies: [],
        repliesHaveMore: false,
        deletedAt: undefined,
        isMinimized: false,
        minimizedReason: undefined,
        isAnswer: false,
        upvoteCount: 0,
        viewerHasUpvoted: false,
      };
      (parent?.replies ?? page.comments).push(comment);
      if (!parent) page.discussion.commentCount = ++page.commentCount;
      return structuredClone(comment);
    }
    if (command === "github_update_repository_discussion_upvote") {
      const subject = page.discussion.id === id ? page.discussion : found?.comment;
      if (!subject) throw new Error("Unknown preview vote target");
      const upvoted = args.upvoted === true;
      subject.upvoteCount += Number(upvoted) - Number(subject.viewerHasUpvoted);
      subject.viewerHasUpvoted = upvoted;
      return {
        subjectId: String(id),
        upvoteCount: subject.upvoteCount,
        viewerCanUpvote: subject.viewerCanUpvote,
        viewerHasUpvoted: upvoted,
      } satisfies Data.GitHubDiscussionVote;
    }
    if (!found || found.comment.deletedAt) throw new Error("Unknown preview comment target");
    const { comment, siblings, parent } = found;
    if (command === "github_update_repository_discussion_comment") {
      comment.body = String(args.body);
      comment.updatedAt = timestamp;
      return structuredClone(comment);
    }
    if (command === "github_update_repository_discussion_answer") {
      page.discussion.answerId = args.answered ? comment.id : undefined;
      const mark = (items: Data.GitHubDiscussionComment[]) =>
        items.forEach((item) => {
          item.isAnswer = item.id === page.discussion.answerId;
          mark(item.replies);
        });
      mark(page.comments);
      return structuredClone(page.discussion);
    }
    if (command === "github_mutate_repository_discussion_comment") {
      if (
        mutation?.expectedUpdatedAt !== comment.updatedAt ||
        mutation.expectedMinimized !== comment.isMinimized
      )
        throw { code: "githubCommentConflict", message: "Preview comment changed" };
      comment.isMinimized = mutation.action === "minimize";
      comment.minimizedReason = comment.isMinimized
        ? String(mutation.classifier).replace("offTopic", "off-topic")
        : undefined;
      comment.updatedAt = timestamp;
      return null;
    }
    const preserved = comment.replies.length > 0 || comment.repliesHaveMore;
    if (preserved)
      Object.assign(comment, {
        body: "",
        author: undefined,
        deletedAt: timestamp,
        isAnswer: false,
        isMinimized: false,
      });
    else {
      siblings.splice(siblings.indexOf(comment), 1);
      if (!parent) page.discussion.commentCount = --page.commentCount;
    }
    if (page.discussion.answerId === comment.id) page.discussion.answerId = undefined;
    return {
      commentId: comment.id,
      replyToId: parent?.id,
      preserved,
      deletedAt: preserved ? timestamp : undefined,
    } satisfies Data.GitHubDiscussionCommentDeletion;
  };
}
