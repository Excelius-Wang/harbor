import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, Trash2 } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { commitRepositoryFile } from "./github-code-mutations";
import type {
  GitHubFilePreview,
  GitHubRepository,
  GitHubRepositoryFileCommit,
} from "./github-data";

export function GitHubCodeDeleteFileDialog({
  open,
  repository,
  branch,
  preview,
  onOpenChange,
  onCommitted,
}: {
  open: boolean;
  repository: GitHubRepository;
  branch: string;
  preview: GitHubFilePreview;
  onOpenChange: (open: boolean) => void;
  onCommitted: (commit: GitHubRepositoryFileCommit) => void;
}) {
  const { t } = useTranslation();
  const defaultMessage = t("workspace.repositories.fileDeleteCommitDefault", {
    path: preview.path,
  });
  const [message, setMessage] = useState(defaultMessage);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage(defaultMessage);
    setSubmitted(false);
  }, [defaultMessage, open]);

  const mutation = useMutation({
    mutationFn: () =>
      commitRepositoryFile(
        { owner: repository.owner, repository: repository.name },
        branch,
        message.trim(),
        { action: "delete", path: preview.path, expectedSha: preview.sha }
      ),
    onSuccess: onCommitted,
  });
  const messageInvalid = submitted && !message.trim();
  const error = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace.repositories.deleteRepositoryFileTitle", { name: preview.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.deleteRepositoryFileDescription", {
              path: preview.path,
              branch,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup className="gap-4">
          <Field data-invalid={messageInvalid} data-disabled={mutation.isPending}>
            <FieldLabel htmlFor="github-code-delete-file-message">
              {t("workspace.repositories.commitMessage")}
            </FieldLabel>
            <Input
              id="github-code-delete-file-message"
              value={message}
              autoFocus
              disabled={mutation.isPending}
              aria-invalid={messageInvalid}
              onChange={(event) => setMessage(event.target.value)}
            />
            <FieldError>
              {messageInvalid ? t("workspace.repositories.commitMessageRequired") : null}
            </FieldError>
          </Field>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>
                {error.code === "githubCodeConflict"
                  ? t("workspace.repositories.repositoryFileConflictTitle")
                  : t("workspace.repositories.repositoryFileDeleteFailed")}
              </AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("workspace.repositories.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending || !message.trim()}
            onClick={(event) => {
              event.preventDefault();
              setSubmitted(true);
              if (!message.trim() || mutation.isPending) return;
              mutation.mutate();
            }}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
            {mutation.isPending
              ? t("workspace.repositories.deletingRepositoryFile")
              : t("workspace.repositories.deleteRepositoryFile")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
