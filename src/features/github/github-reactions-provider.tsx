import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { parseIpcError, type IpcError } from "@/lib/ipc-error";
import type {
  GitHubReactionContent,
  GitHubReactionSubject,
  GitHubReactionSubjectRef,
  GitHubRepositoryIdentity,
} from "./github-data";
import { githubQueryKeys, repositoryReactionsQueryOptions } from "./github-queries";
import {
  chunkReactionSubjects,
  optimisticallyUpdateReaction,
  syncReactionSubject,
  updateRepositoryReaction,
} from "./github-reactions";

type ReactionMutation = {
  subject: GitHubReactionSubjectRef;
  content: GitHubReactionContent;
  reacted: boolean;
  current: GitHubReactionSubject;
};

type GitHubReactionsContextValue = {
  subject: (reference: GitHubReactionSubjectRef) => GitHubReactionSubject | undefined;
  loading: boolean;
  error: IpcError | null;
  pending: boolean;
  toggle: (reference: GitHubReactionSubjectRef, content: GitHubReactionContent) => void;
  retry: () => void;
};

const GitHubReactionsContext = createContext<GitHubReactionsContextValue | null>(null);

function reactionKey(subject: GitHubReactionSubjectRef) {
  return `${subject.kind}:${subject.id}`;
}

export function GitHubReactionsProvider({
  repository,
  subjects,
  children,
}: {
  repository: GitHubRepositoryIdentity;
  subjects: GitHubReactionSubjectRef[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const batches = useMemo(() => chunkReactionSubjects(subjects), [subjects]);
  const results = useQueries({
    queries: batches.map((batch) =>
      repositoryReactionsQueryOptions({
        owner: repository.owner,
        repository: repository.name,
        subjects: batch,
      })
    ),
  });
  const subjectsByKey = useMemo(() => {
    const values = new Map<string, GitHubReactionSubject>();
    for (const result of results) {
      for (const subject of result.data ?? []) values.set(reactionKey(subject), subject);
    }
    return values;
  }, [results]);

  useEffect(() => {
    for (const subject of subjectsByKey.values()) {
      queryClient.setQueryData(
        githubQueryKeys.reaction({
          owner: repository.owner,
          repository: repository.name,
          subject,
        }),
        subject
      );
    }
  }, [queryClient, repository.name, repository.owner, subjectsByKey]);

  const mutation = useMutation({
    mutationFn: ({ subject, content, reacted }: ReactionMutation) =>
      updateRepositoryReaction(
        { owner: repository.owner, repository: repository.name },
        subject,
        content,
        reacted
      ),
    onMutate: async ({ current, content, reacted }) => {
      await queryClient.cancelQueries({
        queryKey: githubQueryKeys.reactionsRoot({
          owner: repository.owner,
          repository: repository.name,
        }),
      });
      const snapshots = queryClient.getQueriesData<unknown>({
        queryKey: githubQueryKeys.reactionsRoot({
          owner: repository.owner,
          repository: repository.name,
        }),
      });
      syncReactionSubject(
        queryClient,
        { owner: repository.owner, repository: repository.name },
        optimisticallyUpdateReaction(current, content, reacted)
      );
      return { snapshots };
    },
    onSuccess: (subject) =>
      syncReactionSubject(
        queryClient,
        { owner: repository.owner, repository: repository.name },
        subject
      ),
    onError: (reason, _variables, context) => {
      for (const [queryKey, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      void queryClient.invalidateQueries({
        queryKey: githubQueryKeys.reactionsRoot({
          owner: repository.owner,
          repository: repository.name,
        }),
        refetchType: "active",
      });
      const error = parseIpcError(reason);
      toast.error(t("workspace.repositories.reactions.updateFailed"), {
        description:
          error.code === "githubPermission"
            ? t("workspace.repositories.reactions.permissionDenied")
            : error.message,
      });
    },
  });
  const queryError = results.find((result) => result.error)?.error;
  const value = useMemo<GitHubReactionsContextValue>(
    () => ({
      subject: (reference) => subjectsByKey.get(reactionKey(reference)),
      loading: results.some((result) => result.isPending),
      error: queryError ? parseIpcError(queryError) : null,
      pending: mutation.isPending,
      toggle: (reference, content) => {
        const subject = subjectsByKey.get(reactionKey(reference));
        if (!subject || mutation.isPending) return;
        const group = subject.groups.find((group) => group.content === content);
        const reacted = !(group?.viewerHasReacted ?? false);
        if (reacted && !subject.viewerCanReact) return;
        mutation.reset();
        mutation.mutate({ subject: reference, content, reacted, current: subject });
      },
      retry: () => {
        for (const result of results) void result.refetch();
      },
    }),
    [mutation, queryError, results, subjectsByKey]
  );

  return <GitHubReactionsContext value={value}>{children}</GitHubReactionsContext>;
}

export function useGitHubReactions() {
  return useContext(GitHubReactionsContext);
}
