import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubReactionContent,
  GitHubReactionSubject,
  GitHubReactionSubjectRef,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubReactionRepositoryTarget = {
  owner: string;
  repository: string;
};

export const GITHUB_REACTION_BATCH_SIZE = 100;

let reactionMutationQueue: Promise<void> = Promise.resolve();

const REACTION_ORDER: GitHubReactionContent[] = [
  "thumbsUp",
  "thumbsDown",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
];

export function normalizeReactionSubjects(
  subjects: GitHubReactionSubjectRef[]
): GitHubReactionSubjectRef[] {
  const byKey = new Map<string, GitHubReactionSubjectRef>();
  for (const subject of subjects) {
    const id = subject.id.trim();
    const key = `${subject.kind}:${id}`;
    if (!id || byKey.has(key)) continue;
    byKey.set(key, { id, kind: subject.kind });
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)
  );
}

export function chunkReactionSubjects(
  subjects: GitHubReactionSubjectRef[]
): GitHubReactionSubjectRef[][] {
  const normalized = normalizeReactionSubjects(subjects);
  const chunks: GitHubReactionSubjectRef[][] = [];
  for (let index = 0; index < normalized.length; index += GITHUB_REACTION_BATCH_SIZE) {
    chunks.push(normalized.slice(index, index + GITHUB_REACTION_BATCH_SIZE));
  }
  return chunks;
}

export function updateRepositoryReaction(
  target: GitHubReactionRepositoryTarget,
  subject: GitHubReactionSubjectRef,
  content: GitHubReactionContent,
  reacted: boolean
) {
  const update = reactionMutationQueue.then(() =>
    invoke<GitHubReactionSubject>("github_update_repository_reaction", {
      ...target,
      subject,
      content,
      reacted,
    })
  );
  reactionMutationQueue = update.then(
    () => undefined,
    () => undefined
  );
  return update;
}

export function optimisticallyUpdateReaction(
  subject: GitHubReactionSubject,
  content: GitHubReactionContent,
  reacted: boolean
): GitHubReactionSubject {
  const current = subject.groups.find((group) => group.content === content);
  if ((current?.viewerHasReacted ?? false) === reacted) return subject;
  const groups = current
    ? subject.groups
        .map((group) =>
          group.content === content
            ? {
                ...group,
                count: Math.max(0, group.count + (reacted ? 1 : -1)),
                viewerHasReacted: reacted,
              }
            : group
        )
        .filter((group) => group.count > 0 || group.viewerHasReacted)
    : reacted
      ? [...subject.groups, { content, count: 1, viewerHasReacted: true }]
      : subject.groups;
  return {
    ...subject,
    groups: groups.sort(
      (left, right) => REACTION_ORDER.indexOf(left.content) - REACTION_ORDER.indexOf(right.content)
    ),
  };
}

export function syncReactionSubject(
  queryClient: QueryClient,
  target: GitHubReactionRepositoryTarget,
  subject: GitHubReactionSubject
) {
  queryClient.setQueryData<GitHubReactionSubject>(
    githubQueryKeys.reaction({ ...target, subject }),
    subject
  );
  for (const [queryKey, cached] of queryClient.getQueriesData<unknown>({
    queryKey: githubQueryKeys.reactionsRoot(target),
  })) {
    if (!Array.isArray(cached)) continue;
    const subjects = cached as GitHubReactionSubject[];
    if (!subjects.some((item) => item.id === subject.id && item.kind === subject.kind)) continue;
    queryClient.setQueryData<GitHubReactionSubject[]>(
      queryKey,
      subjects.map((item) =>
        item.id === subject.id && item.kind === subject.kind ? subject : item
      )
    );
  }
}
