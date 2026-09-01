import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubCommentMinimizeClassifier, GitHubDiscussionComment } from "./github-data";
import {
  invalidateRepositoryDiscussion,
  mutateRepositoryDiscussionComment,
  type GitHubDiscussionCommentMutation,
  type GitHubDiscussionMutationTarget,
} from "./github-discussion-mutations";

const MINIMIZE_CLASSIFIERS: GitHubCommentMinimizeClassifier[] = [
  "spam",
  "abuse",
  "offTopic",
  "outdated",
  "duplicate",
  "resolved",
  "lowQuality",
];

export function GitHubDiscussionCommentMinimizeAction({
  comment,
  target,
}: {
  comment: GitHubDiscussionComment;
  target: GitHubDiscussionMutationTarget;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [minimizeOpen, setMinimizeOpen] = useState(false);
  const [classifier, setClassifier] = useState<GitHubCommentMinimizeClassifier>("offTopic");
  const mutation = useMutation({
    mutationFn: (value: GitHubDiscussionCommentMutation) =>
      mutateRepositoryDiscussionComment(target, value),
    onSuccess: (_, value) => {
      toast.success(
        t(
          value.action === "minimize"
            ? "workspace.repositories.commentMinimizedSuccess"
            : "workspace.repositories.commentUnminimizedSuccess"
        )
      );
      setMinimizeOpen(false);
      mutation.reset();
      void invalidateRepositoryDiscussion(queryClient, target);
    },
    onError: (error) => {
      const code = parseIpcError(error).code;
      if (code === "github" || code === "unknown" || code === "githubCommentConflict") {
        void invalidateRepositoryDiscussion(queryClient, target);
      }
    },
  });

  const canMinimize = comment.isMinimized
    ? comment.viewerCanUnminimize === true
    : comment.viewerCanMinimize === true;
  if (!canMinimize) return null;

  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const errorMessage = error
    ? error.code === "githubPermission"
      ? t("workspace.repositories.discussionWritePermissionDenied")
      : error.code === "githubCommentConflict"
        ? t("workspace.repositories.commentChanged")
        : error.message
    : null;
  const minimizeMutation: GitHubDiscussionCommentMutation = {
    action: "minimize",
    commentId: comment.id,
    expectedUpdatedAt: comment.updatedAt,
    expectedMinimized: false,
    classifier,
  };
  const unminimizeMutation: GitHubDiscussionCommentMutation = {
    action: "unminimize",
    commentId: comment.id,
    expectedUpdatedAt: comment.updatedAt,
    expectedMinimized: true,
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-label={t(
          comment.isMinimized
            ? "workspace.repositories.unminimizeComment"
            : "workspace.repositories.minimizeComment"
        )}
        aria-busy={mutation.isPending}
        disabled={mutation.isPending}
        onClick={() => {
          mutation.reset();
          if (comment.isMinimized) mutation.mutate(unminimizeMutation);
          else setMinimizeOpen(true);
        }}
      >
        {mutation.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : comment.isMinimized ? (
          <Eye data-icon="inline-start" />
        ) : (
          <EyeOff data-icon="inline-start" />
        )}
        {t(
          comment.isMinimized
            ? "workspace.repositories.unminimizeComment"
            : "workspace.repositories.minimizeComment"
        )}
      </Button>

      {error && !minimizeOpen ? (
        <Alert variant="destructive" role="alert" className="max-w-sm">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog
        open={minimizeOpen}
        onOpenChange={(open) => {
          if (mutation.isPending) return;
          setMinimizeOpen(open);
          if (!open) mutation.reset();
        }}
      >
        <AlertDialogContent aria-busy={mutation.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.repositories.minimizeCommentTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.minimizeCommentDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-disabled={mutation.isPending}>
            <FieldLabel htmlFor={`github-discussion-comment-${comment.id}-classifier`}>
              {t("workspace.repositories.minimizeCommentReason")}
            </FieldLabel>
            <Select
              value={classifier}
              onValueChange={(value) => setClassifier(value as GitHubCommentMinimizeClassifier)}
              disabled={mutation.isPending}
            >
              <SelectTrigger id={`github-discussion-comment-${comment.id}-classifier`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MINIMIZE_CLASSIFIERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`workspace.repositories.minimizeReasons.${value}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate(minimizeMutation);
              }}
            >
              {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t("workspace.repositories.confirmMinimizeComment")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
