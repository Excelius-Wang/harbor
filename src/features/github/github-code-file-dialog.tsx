import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, GitCommitHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { parseIpcError } from "@/lib/ipc-error";
import { commitRepositoryFile } from "./github-code-mutations";
import type {
  GitHubRepository,
  GitHubRepositoryFileCommit,
  GitHubRepositoryFileMutation,
} from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";

function normalizePath(path: string) {
  return path.trim().replace(/^\/+|\/+$/g, "");
}

function directoryForPath(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

function isMarkdownPath(path: string) {
  return /\.(md|mdown|markdown)$/i.test(path);
}

export function GitHubCodeFileDialog({
  open,
  repository,
  branch,
  directory,
  initialPath,
  initialSha,
  initialContent,
  onOpenChange,
  onCommitted,
}: {
  open: boolean;
  repository: GitHubRepository;
  branch: string;
  directory: string;
  initialPath?: string;
  initialSha?: string;
  initialContent?: string;
  onOpenChange: (open: boolean) => void;
  onCommitted: (commit: GitHubRepositoryFileCommit) => void;
}) {
  const { t } = useTranslation();
  const editing = Boolean(initialPath && initialSha);
  const defaultPath = initialPath ?? (directory ? `${directory}/new-file.txt` : "new-file.txt");
  const defaultMessage = editing
    ? t("workspace.repositories.fileUpdateCommitDefault", { path: defaultPath })
    : t("workspace.repositories.fileCreateCommitDefault", { path: defaultPath });
  const [path, setPath] = useState(defaultPath);
  const [content, setContent] = useState(initialContent ?? "");
  const [message, setMessage] = useState(defaultMessage);
  const [messageTouched, setMessageTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPath(defaultPath);
    setContent(initialContent ?? "");
    setMessage(defaultMessage);
    setMessageTouched(false);
    setSubmitted(false);
  }, [defaultMessage, defaultPath, initialContent, open]);

  const mutation = useMutation({
    mutationFn: ({
      commitMessage,
      fileMutation,
    }: {
      commitMessage: string;
      fileMutation: GitHubRepositoryFileMutation;
    }) =>
      commitRepositoryFile(
        { owner: repository.owner, repository: repository.name },
        branch,
        commitMessage,
        fileMutation
      ),
    onSuccess: onCommitted,
  });
  const normalizedPath = normalizePath(path);
  const pathInvalid = submitted && !normalizedPath;
  const messageInvalid = submitted && !message.trim();
  const hasChanges =
    !editing || normalizedPath !== initialPath || content !== (initialContent ?? "");
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const markdown = isMarkdownPath(normalizedPath);
  const relativeBaseUrl = useMemo(() => directoryForPath(normalizedPath), [normalizedPath]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t("workspace.repositories.editRepositoryFile")
              : t("workspace.repositories.createRepositoryFile")}
          </DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.repositoryFileDialogDescription", { branch })}
          </DialogDescription>
        </DialogHeader>

        <form
          id="github-code-file-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            const commitMessage = message.trim();
            if (!normalizedPath || !commitMessage || mutation.isPending || !hasChanges) return;
            const fileMutation: GitHubRepositoryFileMutation = editing
              ? normalizedPath === initialPath
                ? {
                    action: "update",
                    path: initialPath!,
                    expectedSha: initialSha!,
                    content,
                  }
                : {
                    action: "rename",
                    path: initialPath!,
                    expectedSha: initialSha!,
                    newPath: normalizedPath,
                    content,
                  }
              : { action: "create", path: normalizedPath, content };
            mutation.mutate({ commitMessage, fileMutation });
          }}
        >
          <FieldGroup className="gap-5">
            <Field data-invalid={pathInvalid} data-disabled={mutation.isPending}>
              <FieldLabel htmlFor="github-code-file-path">
                {t("workspace.repositories.repositoryFilePath")}
              </FieldLabel>
              <Input
                id="github-code-file-path"
                value={path}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                aria-invalid={pathInvalid}
                disabled={mutation.isPending}
                placeholder={t("workspace.repositories.repositoryFilePathPlaceholder")}
                onChange={(event) => {
                  const nextPath = event.target.value;
                  setPath(nextPath);
                  if (!messageTouched) {
                    setMessage(
                      editing
                        ? t("workspace.repositories.fileUpdateCommitDefault", { path: nextPath })
                        : t("workspace.repositories.fileCreateCommitDefault", { path: nextPath })
                    );
                  }
                }}
              />
              <FieldDescription>
                {editing
                  ? t("workspace.repositories.repositoryFileRenameDescription")
                  : t("workspace.repositories.repositoryFilePathDescription")}
              </FieldDescription>
              <FieldError>
                {pathInvalid ? t("workspace.repositories.repositoryFilePathRequired") : null}
              </FieldError>
            </Field>

            <Field data-disabled={mutation.isPending}>
              <FieldLabel htmlFor="github-code-file-content">
                {t("workspace.repositories.repositoryFileContent")}
              </FieldLabel>
              {markdown ? (
                <GitHubMarkdownEditor
                  id="github-code-file-content"
                  name="content"
                  value={content}
                  repository={repository}
                  reference={branch}
                  relativeBaseUrl={relativeBaseUrl}
                  placeholder={t("workspace.repositories.repositoryFileContentPlaceholder")}
                  disabled={mutation.isPending}
                  minHeightClassName="min-h-72"
                  onChange={setContent}
                />
              ) : (
                <Textarea
                  id="github-code-file-content"
                  name="content"
                  value={content}
                  disabled={mutation.isPending}
                  spellCheck={false}
                  placeholder={t("workspace.repositories.repositoryFileContentPlaceholder")}
                  className="bg-background/40 max-h-[45vh] min-h-72 resize-y font-mono text-[12px] leading-5 [tab-size:2]"
                  onChange={(event) => setContent(event.target.value)}
                />
              )}
              <FieldDescription>
                {t("workspace.repositories.repositoryFileContentDescription")}
              </FieldDescription>
            </Field>

            <Field data-invalid={messageInvalid} data-disabled={mutation.isPending}>
              <FieldLabel htmlFor="github-code-commit-message">
                {t("workspace.repositories.commitMessage")}
              </FieldLabel>
              <Input
                id="github-code-commit-message"
                value={message}
                disabled={mutation.isPending}
                aria-invalid={messageInvalid}
                placeholder={t("workspace.repositories.commitMessagePlaceholder")}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setMessageTouched(true);
                }}
              />
              <FieldDescription className="flex items-center gap-1.5">
                <GitCommitHorizontal className="size-3.5" />
                {t("workspace.repositories.commitToBranch", { branch })}
              </FieldDescription>
              <FieldError>
                {messageInvalid ? t("workspace.repositories.commitMessageRequired") : null}
              </FieldError>
            </Field>

            {normalizedPath.startsWith(".github/workflows/") ? (
              <Alert>
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.workflowFilePermissionTitle")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.workflowFilePermissionDescription")}
                </AlertDescription>
              </Alert>
            ) : null}

            {error ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>
                  {error.code === "githubCodeConflict"
                    ? t("workspace.repositories.repositoryFileConflictTitle")
                    : t("workspace.repositories.repositoryFileCommitFailed")}
                </AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button
            type="submit"
            form="github-code-file-form"
            disabled={mutation.isPending || !normalizedPath || !message.trim() || !hasChanges}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {mutation.isPending
              ? t("workspace.repositories.committingRepositoryFile")
              : t("workspace.repositories.commitChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
