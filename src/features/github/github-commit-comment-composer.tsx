import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import { GitHubCommentForm } from "./github-comment-form";
import {
  invalidateRepositoryCommitComments,
  mutateRepositoryCommitComment,
  syncRepositoryCommitComment,
} from "./github-commit-comments";
import type {
  GitHubCommitComment,
  GitHubCommitCommentPlacement,
  GitHubRepositoryContentContext,
} from "./github-data";
import type { GitHubCommitDetailTarget } from "./github-queries";

export function GitHubCommitCommentComposer({
  target,
  repository,
  placement,
  className,
  disabled = false,
  onCreated,
}: {
  target: GitHubCommitDetailTarget;
  repository: GitHubRepositoryContentContext;
  placement?: GitHubCommitCommentPlacement;
  className?: string;
  disabled?: boolean;
  onCreated?: (comment: GitHubCommitComment) => void;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await mutateRepositoryCommitComment(target, {
        action: "create",
        body,
        ...(placement ? { placement } : {}),
      });
      if (!result) throw new Error("GitHub did not return the created commit comment");
      return result;
    },
    onSuccess: (comment) => {
      syncRepositoryCommitComment(queryClient, target, comment, "create");
      void invalidateRepositoryCommitComments(queryClient, target);
      setBody("");
      toast.success(t("workspace.repositories.commentPosted"));
      onCreated?.(comment);
    },
    onError: async (reason) => {
      const code = parseIpcError(reason).code;
      if (code === "github" || code === "unknown") {
        await invalidateRepositoryCommitComments(queryClient, target);
      }
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const errorMessage = error
    ? error.code === "githubPermission"
      ? t("workspace.repositories.commitCommentPermissionDenied")
      : error.code === "github" || error.code === "unknown"
        ? t("workspace.repositories.commitCommentWriteUncertain")
        : error.message
    : null;

  return (
    <GitHubCommentForm
      repository={repository}
      reference={target.commitSha}
      idPrefix={`commit-${target.commitSha}-${placement?.position ?? "general"}`}
      body={body}
      pending={mutation.isPending}
      submitDisabled={disabled}
      errorMessage={errorMessage}
      className={className}
      onBodyChange={(value) => {
        setBody(value);
        if (mutation.isError) mutation.reset();
      }}
      onSubmit={() => mutation.mutate()}
    />
  );
}
