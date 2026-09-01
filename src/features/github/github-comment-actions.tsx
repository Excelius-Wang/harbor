import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubCommentMinimizeClassifier,
  GitHubCommentMutation,
  GitHubRepositoryContentContext,
} from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";
import { canSubmitCommentUpdate } from "./github-comment-mutations";

export type GitHubMutableComment = {
  id: string;
  body: string;
  updatedAt: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
  isPinned?: boolean;
  viewerCanPin?: boolean;
  viewerCanUnpin?: boolean;
  isMinimized?: boolean;
  viewerCanMinimize?: boolean;
  viewerCanUnminimize?: boolean;
};

const MINIMIZE_CLASSIFIERS: GitHubCommentMinimizeClassifier[] = [
  "spam",
  "abuse",
  "offTopic",
  "outdated",
  "duplicate",
  "resolved",
  "lowQuality",
];

export function GitHubCommentActions<TComment>({
  comment,
  repository,
  reference,
  permissionMessage,
  mutateComment,
  onSuccess,
  onConflict,
  onUncertainError,
  uncertainWriteMessage,
  requireNonEmpty = false,
  disabled = false,
}: {
  comment: GitHubMutableComment;
  repository: GitHubRepositoryContentContext;
  reference: string;
  permissionMessage: string;
  mutateComment: (mutation: GitHubCommentMutation) => Promise<TComment | null>;
  onSuccess: (comment: TComment | null, mutation: GitHubCommentMutation) => void;
  onConflict?: () => void | Promise<void>;
  onUncertainError?: () => void | Promise<void>;
  uncertainWriteMessage?: string;
  requireNonEmpty?: boolean;
  disabled?: boolean;
}) {
  const { t } = useAppTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [minimizeOpen, setMinimizeOpen] = useState(false);
  const [minimizeClassifier, setMinimizeClassifier] =
    useState<GitHubCommentMinimizeClassifier>("offTopic");
  const [draft, setDraft] = useState(comment.body);
  const mutation = useMutation({
    mutationFn: mutateComment,
    onSuccess: (result, value) => {
      onSuccess(result, value);
      if (value.action === "update") {
        setEditOpen(false);
      } else if (value.action === "delete") {
        setDeleteOpen(false);
      } else if (value.action === "minimize") {
        setMinimizeOpen(false);
      }
    },
    onError: async (error) => {
      const code = parseIpcError(error).code;
      if (code === "githubCommentConflict") await onConflict?.();
      else if (code === "github" || code === "unknown") await onUncertainError?.();
    },
  });

  useEffect(() => {
    if (!editOpen) setDraft(comment.body);
  }, [comment.body, editOpen]);

  const canPin =
    comment.isPinned !== undefined &&
    ((comment.isPinned && comment.viewerCanUnpin) || (!comment.isPinned && comment.viewerCanPin));
  const canMinimize =
    comment.isMinimized !== undefined &&
    ((comment.isMinimized && comment.viewerCanUnminimize === true) ||
      (!comment.isMinimized && comment.viewerCanMinimize === true));
  if (
    (!comment.viewerCanUpdate && !comment.viewerCanDelete && !canPin && !canMinimize) ||
    !comment.updatedAt
  ) {
    return null;
  }

  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const errorMessage = error
    ? error.code === "githubPermission"
      ? permissionMessage
      : error.code === "githubCommentConflict"
        ? t("workspace.repositories.commentChanged")
        : (error.code === "github" || error.code === "unknown") && uncertainWriteMessage
          ? uncertainWriteMessage
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
  const pinMutation: GitHubCommentMutation = {
    action: comment.isPinned ? "unpin" : "pin",
    commentId: comment.id,
    expectedUpdatedAt: comment.updatedAt,
    expectedPinned: Boolean(comment.isPinned),
  };
  const minimizeMutation: GitHubCommentMutation = {
    action: "minimize",
    commentId: comment.id,
    expectedUpdatedAt: comment.updatedAt,
    expectedMinimized: false,
    classifier: minimizeClassifier,
  };
  const unminimizeMutation: GitHubCommentMutation = {
    action: "unminimize",
    commentId: comment.id,
    expectedUpdatedAt: comment.updatedAt,
    expectedMinimized: true,
  };

  return (
    <>
      {comment.viewerCanUpdate ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("workspace.repositories.editComment")}
              disabled={mutation.isPending || disabled}
              onClick={() => {
                mutation.reset();
                setDraft(comment.body);
                setEditOpen(true);
              }}
            >
              <Pencil />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.repositories.editComment")}</TooltipContent>
        </Tooltip>
      ) : null}
      {comment.viewerCanDelete ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("workspace.repositories.deleteComment")}
              disabled={mutation.isPending || disabled}
              onClick={() => {
                mutation.reset();
                setDeleteOpen(true);
              }}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.repositories.deleteComment")}</TooltipContent>
        </Tooltip>
      ) : null}
      {comment.isPinned !== undefined &&
      ((comment.isPinned && comment.viewerCanUnpin) ||
        (!comment.isPinned && comment.viewerCanPin)) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t(
                comment.isPinned
                  ? "workspace.repositories.unpinComment"
                  : "workspace.repositories.pinComment"
              )}
              aria-busy={mutation.isPending}
              disabled={mutation.isPending || disabled}
              onClick={() => mutation.mutate(pinMutation)}
            >
              {mutation.isPending ? (
                <Spinner aria-hidden="true" />
              ) : comment.isPinned ? (
                <PinOff />
              ) : (
                <Pin />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t(
              comment.isPinned
                ? "workspace.repositories.unpinComment"
                : "workspace.repositories.pinComment"
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {canMinimize ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t(
                comment.isMinimized
                  ? "workspace.repositories.unminimizeComment"
                  : "workspace.repositories.minimizeComment"
              )}
              aria-busy={mutation.isPending}
              disabled={mutation.isPending || disabled}
              onClick={() => {
                mutation.reset();
                if (comment.isMinimized) mutation.mutate(unminimizeMutation);
                else {
                  setMinimizeClassifier("offTopic");
                  setMinimizeOpen(true);
                }
              }}
            >
              {mutation.isPending ? (
                <Spinner aria-hidden="true" />
              ) : comment.isMinimized ? (
                <Eye />
              ) : (
                <EyeOff />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t(
              comment.isMinimized
                ? "workspace.repositories.unminimizeComment"
                : "workspace.repositories.minimizeComment"
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}

      {mutation.error && !editOpen && !deleteOpen && !minimizeOpen ? (
        <Alert variant="destructive" role="alert" className="max-w-sm">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
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
              disabled={
                !canSubmitCommentUpdate(draft, comment.body, mutation.isPending) ||
                disabled ||
                (requireNonEmpty && !draft.trim())
              }
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
              disabled={mutation.isPending || disabled}
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
            <FieldLabel htmlFor={`github-comment-${comment.id}-minimize-classifier`}>
              {t("workspace.repositories.minimizeCommentReason")}
            </FieldLabel>
            <Select
              value={minimizeClassifier}
              onValueChange={(value) =>
                setMinimizeClassifier(value as GitHubCommentMinimizeClassifier)
              }
              disabled={mutation.isPending}
            >
              <SelectTrigger id={`github-comment-${comment.id}-minimize-classifier`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MINIMIZE_CLASSIFIERS.map((classifier) => (
                  <SelectItem key={classifier} value={classifier}>
                    {t(`workspace.repositories.minimizeReasons.${classifier}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {mutation.error ? (
            <Alert variant="destructive">
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
