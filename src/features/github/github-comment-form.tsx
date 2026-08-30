import type { ReactNode } from "react";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { GitHubRepositoryContentContext } from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";

export function GitHubCommentForm({
  repository,
  reference,
  idPrefix,
  body,
  pending,
  submitDisabled = false,
  errorMessage,
  notice,
  secondaryAction,
  className,
  onBodyChange,
  onSubmit,
}: {
  repository: GitHubRepositoryContentContext;
  reference: string;
  idPrefix: string;
  body: string;
  pending: boolean;
  submitDisabled?: boolean;
  errorMessage?: string | null;
  notice?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  onBodyChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className={cn("bg-card/30 mt-5 ml-10 overflow-hidden rounded-lg border", className)}>
      <header className="bg-card/40 flex min-h-11 items-center border-b px-3.5 py-2">
        <h3 className="text-foreground/90 text-xs font-medium">
          {t("workspace.repositories.addComment")}
        </h3>
      </header>
      <form
        className="p-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim() && !pending && !submitDisabled) onSubmit();
        }}
      >
        <FieldGroup className="gap-3">
          <Field data-invalid={Boolean(errorMessage)} data-disabled={pending}>
            <FieldLabel htmlFor={`${idPrefix}-body`} className="sr-only">
              {t("workspace.repositories.addComment")}
            </FieldLabel>
            <GitHubMarkdownEditor
              id={`${idPrefix}-body`}
              name="body"
              value={body}
              repository={repository}
              reference={reference}
              placeholder={t("workspace.repositories.commentPlaceholder")}
              disabled={pending}
              invalid={Boolean(errorMessage)}
              minHeightClassName="min-h-28"
              onChange={onBodyChange}
            />
            <FieldDescription className="text-[10px]">
              {t("workspace.repositories.markdownSupported")}
            </FieldDescription>
            <FieldError>{errorMessage}</FieldError>
          </Field>
          {notice}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {secondaryAction}
            <Button type="submit" size="sm" disabled={!body.trim() || pending || submitDisabled}>
              {pending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
              {t(pending ? "workspace.repositories.commenting" : "workspace.repositories.comment")}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
