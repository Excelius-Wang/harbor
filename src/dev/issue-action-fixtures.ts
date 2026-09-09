import type * as Data from "@/features/github/github-data";
import type { GitHubIssueStateMutationInput } from "@/features/github/github-issue-mutations";
import { workspaceFixture } from "./workspace-fixtures";

export function createIssueActionFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean
) {
  const details = new Map<string, Data.GitHubIssueDetailPage>();
  const deleted = new Set<string>();
  const duplicates = new Map<string, Data.GitHubIssueDuplicateReference>();
  let nextIssueNumber = 40;
  let revision = 1;
  const timestamp = () => new Date(Date.UTC(2026, 8, 9, 0, 0, revision++)).toISOString();
  const permission = () => ({
    code: "githubPermission",
    message: "This preview Issue is read-only.",
  });
  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (!scenario) return undefined;
    const input = (args.input ?? args) as Record<string, unknown>;
    const repository =
      command === "github_list_issue_inbox"
        ? repositories[0]
        : repositories.find(
            (item) =>
              item.owner === (input.owner ?? input.sourceOwner) &&
              item.name === (input.repository ?? input.sourceRepository)
          );
    if (!repository) return undefined;
    const number = Number(input.issueNumber ?? 1);
    const key = `${repository.fullName}#${number}`;
    const writable = scenario !== "readonly";
    if (!details.has(key)) {
      const detail = structuredClone(
        workspaceFixture(
          "github_get_repository_issue",
          {
            owner: repository.owner,
            repository: repository.name,
            issueNumber: number,
          },
          repositories,
          false
        )
      ) as Data.GitHubIssueDetailPage;
      if (scenario === "closed") {
        detail.issue.state = "closed";
        detail.issue.stateReason = "completed";
      }
      detail.timeline = detail.timeline.map((item) => ({
        ...item,
        viewerCanUpdate: writable,
        viewerCanDelete: writable,
        isPinned: false,
        viewerCanPin: writable,
        viewerCanUnpin: writable,
        viewerCanMinimize: writable,
        viewerCanUnminimize: writable,
      }));
      details.set(key, detail);
    }
    const detail = details.get(key)!;
    const identity = {
      repositoryId: "R_preview",
      repositoryFullName: repository.fullName,
      issueNodeId: detail.issue.reactionSubject.id,
      number,
    };
    if (command === "github_get_repository_issue_transfer_status") {
      const destination = repositories.find(
        (item) => item.owner === input.targetOwner && item.name === input.targetRepository
      );
      if (!destination)
        throw { code: "githubNotFound", message: "Preview target repository not found." };
      const status = workspaceFixture(
        command,
        { owner: repository.owner, repository: repository.name, issueNumber: number },
        repositories,
        false
      ) as Data.GitHubIssueTransferStatus;
      return {
        ...status,
        sourceIssueOpen: detail.issue.state === "open",
        sourceViewerCanTransfer: writable,
        targetRepositoryFullName: destination.fullName,
        targetRepositoryUrl: destination.url,
        targetDefaultBranch: destination.defaultBranch,
        viewerCanTransfer: writable && detail.issue.state === "open",
      } satisfies Data.GitHubIssueTransferStatus;
    }
    if (command === "github_get_repository_issue" && number === 2) {
      if (scenario === "candidate-loading") return new Promise(() => {});
      if (scenario === "candidate-error")
        throw { code: "githubNotFound", message: "Preview candidate unavailable." };
      if (scenario === "candidate-duplicate")
        return structuredClone({
          ...detail,
          issue: { ...detail.issue, state: "closed", stateReason: "duplicate" },
        });
    }
    if (command === "github_get_repository_issue") {
      if (deleted.has(key))
        throw { code: "githubNotFound", message: "The preview Issue was deleted." };
      return structuredClone({ ...detail, timeline: empty ? [] : detail.timeline });
    }
    if (command === "github_get_repository_issue_duplicate") return duplicates.get(key) ?? null;
    if (command === "github_get_repository_issue_state_capabilities") {
      return {
        ...identity,
        state: detail.issue.state,
        stateReason: detail.issue.stateReason,
        updatedAt: detail.issue.updatedAt,
        viewerCanClose: writable && detail.issue.state === "open",
        viewerCanReopen: writable && detail.issue.state === "closed",
      } satisfies Data.GitHubIssueStateCapabilities;
    }
    if (command === "github_get_repository_issue_delete_status") {
      return { ...identity, viewerCanDelete: writable } satisfies Data.GitHubIssueDeleteStatus;
    }
    if (command === "github_list_repository_issues" || command === "github_list_issue_inbox") {
      const read = structuredClone(workspaceFixture(command, args, repositories, empty));
      const state = args.state ?? args.issueState ?? "open";
      const currentIssue = (issue: Data.GitHubIssue) =>
        details.get(`${repository.fullName}#${issue.number}`)?.issue ?? issue;
      const retained = (issue: Data.GitHubIssue) =>
        !deleted.has(`${repository.fullName}#${issue.number}`) && issue.state === state;
      if (command === "github_list_issue_inbox") {
        const page = read as Data.GitHubIssueInboxPage;
        const issues = page.issues
          .map((entry) => ({ ...entry, issue: currentIssue(entry.issue) }))
          .filter((entry) => retained(entry.issue));
        return structuredClone({ ...page, issues, totalCount: issues.length });
      }
      const page = read as Data.GitHubIssuePage;
      const issues = page.issues.map(currentIssue).filter(retained);
      return structuredClone({ ...page, issues, totalCount: issues.length });
    }
    if (command === "github_get_repository_issue_clone_status") {
      const status = workspaceFixture(
        command,
        args,
        repositories,
        empty
      ) as Data.GitHubIssueCloneStatus;
      return {
        ...status,
        issueNodeId: identity.issueNodeId,
        title: detail.issue.title,
        body: detail.issue.body,
        sourceOpen: detail.issue.state === "open",
        viewerCanClone: writable && detail.issue.state === "open",
      } satisfies Data.GitHubIssueCloneStatus;
    }
    if (
      command === "github_get_repository_issue_type_status" ||
      command === "github_get_repository_issue_linked_branches"
    ) {
      const status = workspaceFixture(command, args, repositories, empty) as Record<
        string,
        unknown
      >;
      return { ...status, issueNodeId: identity.issueNodeId };
    }
    if (!acceptWrites) return undefined;
    if (
      command === "github_clone_repository_issue" ||
      command === "github_transfer_repository_issue"
    ) {
      if (!writable) throw permission();
      if (
        input.expectedIssueNodeId !== detail.issue.reactionSubject.id ||
        detail.issue.state !== "open"
      )
        throw { code: "githubIssueStateConflict", message: "The preview source Issue changed." };
      const destination =
        command === "github_clone_repository_issue"
          ? repository
          : repositories.find(
              (item) => item.owner === input.targetOwner && item.name === input.targetRepository
            );
      if (!destination)
        throw { code: "githubNotFound", message: "Preview target repository not found." };
      const cloning = command === "github_clone_repository_issue";
      const nextNumber = nextIssueNumber++;
      const nextIssue = {
        ...detail.issue,
        id: nextNumber,
        number: nextNumber,
        reactionSubject: cloning
          ? { kind: "issue" as const, id: `I_preview_${nextNumber}` }
          : detail.issue.reactionSubject,
        ...(cloning
          ? {
              comments: 0,
              assignees: [],
              labels: [],
              locked: false,
              author: "harbor-preview",
              createdAt: timestamp(),
            }
          : {}),
        title: String(input.title ?? detail.issue.title),
        body: String(input.body ?? detail.issue.body ?? ""),
        url: `${destination.url}/issues/${nextNumber}`,
        updatedAt: timestamp(),
      };
      details.set(`${destination.fullName}#${nextNumber}`, {
        ...structuredClone(detail),
        issue: nextIssue,
        ...(cloning ? { timeline: [] } : {}),
      });
      if (command === "github_clone_repository_issue")
        return {
          repositoryId: identity.repositoryId,
          repositoryFullName: repository.fullName,
          sourceIssueNodeId: identity.issueNodeId,
          sourceIssueNumber: number,
          targetIssueNodeId: nextIssue.reactionSubject.id,
          targetIssueNumber: nextNumber,
          targetIssueUrl: nextIssue.url,
        } satisfies Data.GitHubIssueClone;
      deleted.add(key);
      return {
        sourceRepositoryId: identity.repositoryId,
        sourceRepositoryFullName: repository.fullName,
        sourceIssueNodeId: identity.issueNodeId,
        sourceIssueNumber: number,
        targetRepositoryId: "R_preview_target",
        targetRepositoryFullName: destination.fullName,
        targetRepositoryUrl: destination.url,
        targetDefaultBranch: destination.defaultBranch,
        targetIssueNodeId: nextIssue.reactionSubject.id,
        targetIssueNumber: nextNumber,
        targetIssueUrl: nextIssue.url,
      } satisfies Data.GitHubIssueTransfer;
    }
    if (
      command === "github_mark_repository_issue_duplicate" ||
      command === "github_unmark_repository_issue_duplicate"
    ) {
      if (!writable) throw permission();
      if (input.expectedIssueNodeId !== detail.issue.reactionSubject.id)
        throw { code: "githubIssueStateConflict", message: "The preview Issue changed." };
      if (command === "github_mark_repository_issue_duplicate") {
        const canonicalRepository = repositories.find(
          (item) => item.owner === input.canonicalOwner && item.name === input.canonicalRepository
        );
        if (!canonicalRepository)
          throw { code: "githubNotFound", message: "Preview original Issue not found." };
        const canonicalNumber = Number(input.canonicalIssueNumber);
        if (canonicalNumber === number && canonicalRepository.fullName === repository.fullName)
          throw { code: "githubIssueStateConflict", message: "An Issue cannot duplicate itself." };
        duplicates.set(key, {
          owner: canonicalRepository.owner,
          repository: canonicalRepository.name,
          fullName: canonicalRepository.fullName,
          repositoryUrl: canonicalRepository.url,
          issueNumber: canonicalNumber,
          title: "Original preview Issue",
          url: `${canonicalRepository.url}/issues/${canonicalNumber}`,
          viewerCanUnmark: true,
        });
        detail.issue = {
          ...detail.issue,
          state: "closed",
          stateReason: "duplicate",
          updatedAt: timestamp(),
        };
      } else {
        duplicates.delete(key);
        detail.issue = { ...detail.issue, stateReason: "completed", updatedAt: timestamp() };
      }
      return structuredClone(detail.issue);
    }
    if (command === "github_update_repository_issue_state") {
      if (!writable) throw permission();
      const mutation = args.mutation as GitHubIssueStateMutationInput;
      if (
        mutation.expected.issueNodeId !== detail.issue.reactionSubject.id ||
        mutation.expected.updatedAt !== detail.issue.updatedAt ||
        mutation.expected.state !== detail.issue.state
      ) {
        throw { code: "githubIssueStateConflict", message: "The preview Issue changed." };
      }
      detail.issue = {
        ...detail.issue,
        state: mutation.desiredState,
        stateReason: mutation.closeReason ?? undefined,
        updatedAt: timestamp(),
      };
      return structuredClone(detail.issue);
    }
    if (command === "github_delete_repository_issue") {
      if (!writable) throw permission();
      if (input.expectedIssueNodeId !== identity.issueNodeId)
        throw { code: "githubIssueStateConflict", message: "The preview Issue changed." };
      deleted.add(key);
      return identity satisfies Data.GitHubIssueDeletion;
    }
    if (command === "github_create_repository_issue_comment") {
      if (!writable) throw permission();
      const comment: Data.GitHubIssueTimelineItem = {
        id: `preview-comment-${revision}`,
        kind: "comment",
        event: "commented",
        actor: "harbor-preview",
        body: String(args.body),
        updatedAt: timestamp(),
        createdAt: timestamp(),
        viewerCanUpdate: true,
        viewerCanDelete: true,
        isMinimized: false,
      };
      detail.timeline.push(comment);
      detail.issue.comments++;
      return structuredClone(comment);
    }
    if (command === "github_mutate_repository_issue_comment") {
      if (!writable) throw permission();
      const mutation = args.mutation as Data.GitHubCommentMutation;
      const comment = detail.timeline.find((item) => item.id === mutation.commentId);
      if (!comment || comment.updatedAt !== mutation.expectedUpdatedAt)
        throw { code: "githubCommentConflict", message: "The preview comment changed." };
      if (mutation.action === "delete") {
        detail.timeline = detail.timeline.filter((item) => item !== comment);
        detail.issue.comments = Math.max(0, detail.issue.comments - 1);
        return null;
      }
      if (mutation.action === "update") comment.body = mutation.body;
      if (mutation.action === "pin" || mutation.action === "unpin")
        comment.isPinned = mutation.action === "pin";
      if (mutation.action === "minimize" || mutation.action === "unminimize") {
        comment.isMinimized = mutation.action === "minimize";
        comment.minimizedReason = mutation.action === "minimize" ? mutation.classifier : undefined;
      }
      comment.updatedAt = timestamp();
      return structuredClone(comment);
    }
    return undefined;
  };
}
