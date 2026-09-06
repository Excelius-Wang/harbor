import type * as Data from "@/features/github/github-data";
import { previewIssue, workspaceFixture } from "./workspace-fixtures";

type Scenarios = {
  conversation: string | null;
  reactions: string | null;
  pins: string | null;
  acceptWrites: boolean;
  pullRequest: string | null;
};

const reactionContents: Data.GitHubReactionContent[] = [
  "thumbsUp",
  "thumbsDown",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
];
const permissionError = () => ({
  code: "githubPermission",
  message: "This preview account cannot perform that action.",
});
const identityError = () => ({
  code: "githubIssueStateConflict",
  message: "The preview Issue identity or pin state changed.",
});

export function createConversationActionFixtures(
  repositories: Data.GitHubRepository[],
  scenarios: Scenarios
) {
  const conversations = new Map<string, Data.GitHubConversationControls>();
  const reactions = new Map<string, Data.GitHubReactionSubject>();
  const pinnedPages = new Map<string, Data.GitHubPinnedIssuePage>();

  function conversationFor(
    repository: Data.GitHubRepository,
    kind: Data.GitHubConversationKind,
    number: number
  ) {
    const key = `${repository.fullName}:${kind}:${number}`;
    if (!conversations.has(key))
      conversations.set(key, {
        kind,
        number,
        locked: scenarios.conversation === "locked",
        lockReason: scenarios.conversation === "locked" ? "resolved" : null,
        viewerCanLock: scenarios.conversation !== "readonly",
        viewerCanSubscribe: scenarios.conversation !== "readonly",
        viewerSubscription:
          scenarios.conversation === "unknown"
            ? "unknown"
            : scenarios.conversation === "unsubscribed"
              ? "unsubscribed"
              : "subscribed",
      });
    return { key, controls: conversations.get(key)! };
  }

  function reactionFor(
    repository: Data.GitHubRepository,
    subject: Data.GitHubReactionSubjectRef,
    empty: boolean
  ) {
    const key = `${repository.fullName}:${subject.kind}:${subject.id}`;
    if (!reactions.has(key))
      reactions.set(key, {
        ...subject,
        viewerCanReact: scenarios.reactions !== "readonly",
        groups:
          empty || scenarios.reactions === "empty"
            ? []
            : [
                { content: "thumbsUp", count: 2, viewerHasReacted: false },
                { content: "heart", count: 1, viewerHasReacted: true },
              ],
      });
    return { key, subject: reactions.get(key)! };
  }

  function pinsFor(repository: Data.GitHubRepository, empty: boolean) {
    const key = repository.fullName;
    if (!pinnedPages.has(key)) {
      const numbers = empty
        ? []
        : scenarios.pins === "limit"
          ? [2, 3, 4]
          : ["pinned", "identity-mismatch"].includes(scenarios.pins ?? "")
            ? [1, 2]
            : [2, 3];
      pinnedPages.set(key, {
        repositoryId: `R_preview_${repository.id}`,
        repositoryFullName: scenarios.pins === "repository-mismatch" ? "other/repository" : key,
        viewerCanManage: scenarios.pins !== "readonly",
        issues: numbers.map((number) => {
          const issue = previewIssue(number, repository);
          return {
            nodeId:
              number === 1 && scenarios.pins === "identity-mismatch"
                ? "I_replaced"
                : issue.reactionSubject.id,
            number,
            title: issue.title,
            url: issue.url,
            state: issue.state,
            pinnedBy: "harbor-preview",
          };
        }),
      });
    }
    return { key, page: pinnedPages.get(key)! };
  }

  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    const target =
      command === "github_update_repository_issue_pin"
        ? (args.input as Record<string, unknown>)
        : args;
    const repository = repositories.find(
      (item) => item.owner === target?.owner && item.name === target.repository
    );
    if (!repository) return undefined;

    if (scenarios.conversation) {
      const kind: Data.GitHubConversationKind =
        args.conversationKind === "pullRequest" || command === "github_get_repository_pull_request"
          ? "pullRequest"
          : "issue";
      const number = Number(
        args.conversationNumber ?? args.issueNumber ?? args.pullRequestNumber ?? 1
      );
      const { key, controls } = conversationFor(repository, kind, number);
      if (command === "github_get_repository_conversation_controls") return { ...controls };
      if (command === "github_get_repository_issue") {
        const result = workspaceFixture(
          command,
          args,
          repositories,
          empty,
          scenarios.pullRequest
        ) as Data.GitHubIssueDetailPage;
        return { ...result, issue: { ...result.issue, locked: controls.locked } };
      }
      if (command === "github_get_repository_pull_request") {
        const result = workspaceFixture(
          command,
          args,
          repositories,
          empty,
          scenarios.pullRequest
        ) as Data.GitHubPullRequestDetailPage;
        return { ...result, pullRequest: { ...result.pullRequest, locked: controls.locked } };
      }
      if (scenarios.acceptWrites && command === "github_update_repository_conversation_lock") {
        if (!controls.viewerCanLock) throw permissionError();
        if (args.action !== "lock" && args.action !== "unlock") return undefined;
        if (
          args.reason &&
          !["offTopic", "tooHeated", "resolved", "spam"].includes(String(args.reason))
        )
          return undefined;
        const next = {
          ...controls,
          locked: args.action === "lock",
          lockReason:
            args.action === "lock"
              ? ((args.reason as Data.GitHubConversationLockReason) ?? null)
              : null,
        };
        conversations.set(key, next);
        return { ...next };
      }
      if (
        scenarios.acceptWrites &&
        command === "github_update_repository_conversation_subscription"
      ) {
        if (!controls.viewerCanSubscribe) throw permissionError();
        if (args.action !== "subscribe" && args.action !== "unsubscribe") return undefined;
        const next: Data.GitHubConversationControls = {
          ...controls,
          viewerSubscription: args.action === "subscribe" ? "subscribed" : "unsubscribed",
        };
        conversations.set(key, next);
        return { ...next };
      }
    }

    if (scenarios.reactions && command === "github_get_repository_reactions")
      return ((args.subjects ?? []) as Data.GitHubReactionSubjectRef[]).map((subject) =>
        structuredClone(reactionFor(repository, subject, empty).subject)
      );
    if (
      scenarios.reactions &&
      scenarios.acceptWrites &&
      command === "github_update_repository_reaction"
    ) {
      const reference = args.subject as Data.GitHubReactionSubjectRef;
      const content = args.content as Data.GitHubReactionContent;
      if (
        !reactionContents.includes(content) ||
        (reference.kind === "release" && ["thumbsDown", "confused"].includes(content))
      )
        return undefined;
      const { key, subject } = reactionFor(repository, reference, empty);
      const reacted = args.reacted === true;
      if (reacted && !subject.viewerCanReact) throw permissionError();
      const current = subject.groups.find((group) => group.content === content);
      const count = Math.max(
        0,
        (current?.count ?? 0) + Number(reacted) - Number(current?.viewerHasReacted ?? false)
      );
      const groups = subject.groups.filter((group) => group.content !== content);
      if (count) groups.push({ content, count, viewerHasReacted: reacted });
      const next = { ...subject, groups };
      reactions.set(key, next);
      return structuredClone(next);
    }

    if (scenarios.pins && command === "github_get_repository_pinned_issues")
      return structuredClone(pinsFor(repository, empty).page);
    if (
      scenarios.pins &&
      scenarios.acceptWrites &&
      command === "github_update_repository_issue_pin"
    ) {
      const { key, page } = pinsFor(repository, empty);
      if (!page.viewerCanManage) throw permissionError();
      const issue = previewIssue(Number(target.issueNumber), repository);
      const pinned = page.issues.find((item) => item.number === issue.number);
      if (
        page.repositoryFullName !== repository.fullName ||
        target.expectedIssueNodeId !== issue.reactionSubject.id ||
        (pinned && pinned.nodeId !== issue.reactionSubject.id)
      )
        throw identityError();
      if (target.action !== "pin" && target.action !== "unpin") return undefined;
      if (target.action === "pin" && !pinned && page.issues.length >= 3) throw identityError();
      const issues = page.issues.filter((item) => item.number !== issue.number);
      if (target.action === "pin")
        issues.push({
          nodeId: issue.reactionSubject.id,
          number: issue.number,
          title: issue.title,
          url: issue.url,
          state: issue.state,
          pinnedBy: "harbor-preview",
        });
      const next = { ...page, issues };
      pinnedPages.set(key, next);
      return structuredClone(next);
    }
    return undefined;
  };
}
