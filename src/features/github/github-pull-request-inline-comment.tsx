import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, Pencil, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubPullRequestReviewComment, GitHubRepositoryContentContext } from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";

const GitHubReadme = lazy(() => import("./github-readme"));

export function GitHubPullRequestInlineComment({
  id,
  repository,
  reference,
  location,
  draft,
  editRequested,
  onCancel,
  onSave,
  onDelete,
}: {
  id: string;
  repository: GitHubRepositoryContentContext;
  reference: string;
  location: Omit<GitHubPullRequestReviewComment, "body">;
  draft?: GitHubPullRequestReviewComment;
  editRequested: boolean;
  onCancel: () => void;
  onSave: (comment: GitHubPullRequestReviewComment) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState(draft?.body ?? "");
  const [editing, setEditing] = useState(!draft);
  const [submitted, setSubmitted] = useState(false);
  const saveMutation = useMutation({
    mutationFn: onSave,
    onSuccess: () => {
      setEditing(false);
      setSubmitted(false);
    },
  });
  const deleteMutation = useMutation({ mutationFn: onDelete });
  const mutation = saveMutation.error ?? deleteMutation.error;
  const error = mutation ? parseIpcError(mutation) : null;
  const pending = saveMutation.isPending || deleteMutation.isPending;
  const invalid = submitted && !body.trim();
  const locationLabel = t(
    location.startLine === undefined
      ? "workspace.repositories.reviewCommentLocation"
      : "workspace.repositories.reviewCommentRangeLocation",
    {
      path: location.path,
      startLine: location.startLine,
      line: location.line,
    }
  );

  useEffect(() => {
    if (!editing && draft) setBody(draft.body);
  }, [draft, editing]);

  useEffect(() => {
    if (editRequested) setEditing(true);
  }, [editRequested]);

  if (draft && !editing) {
    return (
      <section className="bg-background/80 overflow-hidden rounded-md border shadow-sm">
        <header className="bg-card/70 flex min-h-9 items-center gap-2 border-b px-3 py-1.5">
          <Badge variant="outline" className="rounded-md text-[9px]">
            {t("workspace.repositories.pendingReviewComment")}
          </Badge>
          <span className="text-muted-foreground text-[10px]">{locationLabel}</span>
        </header>
        <div className="harbor-markdown min-w-0 px-3 py-2.5 text-[12px]">
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <GitHubReadme
              content={draft.body}
              path={location.path}
              reference={reference}
              repository={repository}
              onOpenExternal={(url) => void openExternalUrl(url)}
            />
          </Suspense>
        </div>
        {error ? (
          <div className="border-t p-2">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.pendingReviewCommentSaveFailed")}</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <footer className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
            {t("workspace.repositories.delete")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() => {
              saveMutation.reset();
              deleteMutation.reset();
              setEditing(true);
            }}
          >
            <Pencil data-icon="inline-start" />
            {t("workspace.repositories.edit")}
          </Button>
        </footer>
      </section>
    );
  }

  return (
    <form
      className="bg-background/80 overflow-hidden rounded-md border shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (!body.trim()) return;
        saveMutation.mutate({ ...location, body });
      }}
    >
      <div className="p-3">
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor={`${id}-body`} className="sr-only">
            {t("workspace.repositories.reviewComment")}
          </FieldLabel>
          <GitHubMarkdownEditor
            id={`${id}-body`}
            name="body"
            value={body}
            repository={repository}
            reference={reference}
            placeholder={t("workspace.repositories.reviewCommentPlaceholder")}
            disabled={pending}
            invalid={invalid}
            minHeightClassName="min-h-24"
            onChange={(value) => {
              setBody(value);
              if (value.trim()) setSubmitted(false);
              saveMutation.reset();
              deleteMutation.reset();
            }}
          />
          <FieldError>
            {invalid ? t("workspace.repositories.reviewCommentRequired") : null}
          </FieldError>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.pendingReviewCommentSaveFailed")}</AlertTitle>
            <AlertDescription>
              {error.code === "githubPermission"
                ? t("workspace.repositories.pullRequestWritePermissionDenied")
                : error.message}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
        <span className="text-muted-foreground text-[10px]">{locationLabel}</span>
        <div className="flex items-center gap-2">
          {draft ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {t("workspace.repositories.delete")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() => {
              setSubmitted(false);
              if (draft) {
                setBody(draft.body);
                setEditing(false);
                onCancel();
              } else {
                onCancel();
              }
            }}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button type="submit" size="xs" disabled={!body.trim() || pending}>
            {saveMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {t(
              draft
                ? "workspace.repositories.saveReviewComment"
                : "workspace.repositories.addReviewComment"
            )}
          </Button>
        </div>
      </footer>
    </form>
  );
}
