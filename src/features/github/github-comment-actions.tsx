import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubCommentMutation, GitHubRepositoryContentContext } from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";

export type GitHubMutableComment = {
  id: string;
  body: string;
  updatedAt: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
};

export function GitHubCommentActions<TComment>({
  comment,
  repository,
  reference,
  permissionMessage,
  mutateComment,
  onSuccess,
  onConflict,
}: {
  comment: GitHubMutableComment;
  repository: GitHubRepositoryContentContext;
  reference: string;
  permissionMessage: string;
  mutateComment: (mutation: GitHubCommentMutation) => Promise<TComment | null>;
  onSuccess: (comment: TComment | null, mutation: GitHubCommentMutation) => void;
  onConflict?: () => void;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const mutation = useMutation({
    mutationFn: mutateComment,
    onSuccess: (result, value) => {
      onSuccess(result, value);
      if (value.action === "update") {
        setEditOpen(false);
      } else {
        setDeleteOpen(false);
      }
    },
    onError: (error) => {
      if (parseIpcError(error).code === "githubCommentConflict") onConflict?.();
    },
  });

  useEffect(() => {
    if (!editOpen) setDraft(comment.body);
  }, [comment.body, editOpen]);

  if ((!comment.viewerCanUpdate && !comment.viewerCanDelete) || !comment.updatedAt) return null;

  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const errorMessage = error
    ? error.code === "githubPermission"
      ? permissionMessage
      : error.code === "githubCommentConflict"
        ? t("workspace.repositories.commentChanged")
        : error.message
    : null;
  const updateMutation: GitHubCommentMutation = {
    action: "update",
    commentId: comment.id,
    expectedUpdatedAt: comment.updatedAt,
    body: draft,
  };
  const deleteMutation: GitHubCommentMutation = {
    action: "delete",
    commentId: comment.id,
    expectedUpdatedAt: comment.updatedAt,
  };

  return (
    <>
      {comment.viewerCanUpdate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("workspace.repositories.editComment")}
          disabled={mutation.isPending}
          onClick={() => {
            mutation.reset();
            setDraft(comment.body);
            setEditOpen(true);
          }}
        >
          <Pencil />
        </Button>
      ) : null}
      {comment.viewerCanDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("workspace.repositories.deleteComment")}
          disabled={mutation.isPending}
          onClick={() => {
            mutation.reset();
            setDeleteOpen(true);
          }}
        >
          <Trash2 />
        </Button>
      ) : null}

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (mutation.isPending) return;
          setEditOpen(open);
          if (!open) mutation.reset();
        }}
      >
        <DialogContent
          className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl"
          aria-busy={mutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.editCommentTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.editCommentDescription")}
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(errorMessage)} data-disabled={mutation.isPending}>
            <FieldLabel htmlFor={`github-comment-${comment.id}-body`} className="sr-only">
              {t("workspace.repositories.commentBody")}
            </FieldLabel>
            <GitHubMarkdownEditor
              id={`github-comment-${comment.id}-body`}
              name="body"
              value={draft}
              repository={repository}
              reference={reference}
              placeholder={t("workspace.repositories.commentPlaceholder")}
              disabled={mutation.isPending}
              invalid={Boolean(errorMessage)}
              minHeightClassName="min-h-40"
              onChange={(value) => {
                setDraft(value);
                if (mutation.isError) mutation.reset();
              }}
            />
            <FieldError>{errorMessage}</FieldError>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setEditOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!draft.trim() || draft === comment.body || mutation.isPending}
              onClick={() => mutation.mutate(updateMutation)}
            >
              {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t(
                mutation.isPending
                  ? "workspace.repositories.savingComment"
                  : "workspace.repositories.saveComment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (mutation.isPending) return;
          setDeleteOpen(open);
          if (!open) mutation.reset();
        }}
      >
        <AlertDialogContent aria-busy={mutation.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.repositories.deleteCommentTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.deleteCommentDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate(deleteMutation);
              }}
            >
              {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t(
                mutation.isPending
                  ? "workspace.repositories.deletingComment"
                  : "workspace.repositories.deleteComment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
