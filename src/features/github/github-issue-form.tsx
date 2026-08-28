import { type ReactNode, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { GitHubRepositoryContentContext } from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";

export type GitHubIssueFormValue = {
  title: string;
  body: string;
};

type GitHubTitleBodyFormCopy = {
  titleLabel: string;
  titlePlaceholder: string;
  titleRequired: string;
  bodyLabel: string;
  bodyPlaceholder: string;
};

type GitHubTitleBodyFormProps = {
  repository: GitHubRepositoryContentContext;
  reference: string;
  idPrefix: string;
  initialValue: GitHubIssueFormValue;
  copy: GitHubTitleBodyFormCopy;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  requireChanges?: boolean;
  hasExternalChanges?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  additionalFields?: ReactNode;
  onChange?: () => void;
  onSubmit: (value: GitHubIssueFormValue) => void;
  onCancel: () => void;
};

export function GitHubTitleBodyForm({
  repository,
  reference,
  idPrefix,
  initialValue,
  copy,
  submitLabel,
  pendingLabel,
  pending,
  requireChanges = false,
  hasExternalChanges = false,
  errorTitle,
  errorMessage,
  additionalFields,
  onChange,
  onSubmit,
  onCancel,
}: GitHubTitleBodyFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialValue.title);
  const [body, setBody] = useState(initialValue.body);
  const [submitted, setSubmitted] = useState(false);
  const titleInvalid = submitted && !title.trim();
  const hasChanges =
    title.trim() !== initialValue.title || body !== initialValue.body || hasExternalChanges;

  return (
    <form
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        const trimmedTitle = title.trim();
        if (!trimmedTitle || pending || (requireChanges && !hasChanges)) return;
        onSubmit({ title: trimmedTitle, body });
      }}
    >
      <FieldGroup className="gap-5">
        <Field data-invalid={titleInvalid} data-disabled={pending}>
          <FieldLabel htmlFor={`${idPrefix}-title`}>{copy.titleLabel}</FieldLabel>
          <Input
            id={`${idPrefix}-title`}
            name="title"
            value={title}
            autoFocus
            autoComplete="off"
            aria-invalid={titleInvalid}
            disabled={pending}
            placeholder={copy.titlePlaceholder}
            onChange={(event) => {
              setTitle(event.target.value);
              if (submitted && event.target.value.trim()) setSubmitted(false);
              onChange?.();
            }}
          />
          <FieldError>{titleInvalid ? copy.titleRequired : null}</FieldError>
        </Field>
        <Field data-disabled={pending}>
          <FieldLabel htmlFor={`${idPrefix}-body`}>{copy.bodyLabel}</FieldLabel>
          <GitHubMarkdownEditor
            id={`${idPrefix}-body`}
            name="body"
            value={body}
            repository={repository}
            reference={reference}
            placeholder={copy.bodyPlaceholder}
            disabled={pending}
            onChange={(value) => {
              setBody(value);
              onChange?.();
            }}
          />
          <FieldDescription className="text-[10px]">
            {t("workspace.repositories.markdownSupported")}
          </FieldDescription>
        </Field>
        {additionalFields}
        {errorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{errorTitle}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {t("workspace.repositories.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={pending || !title.trim() || (requireChanges && !hasChanges)}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function GitHubIssueForm(props: Omit<GitHubTitleBodyFormProps, "copy" | "reference">) {
  const { t } = useTranslation();
  return (
    <GitHubTitleBodyForm
      {...props}
      reference={props.repository.defaultBranch}
      copy={{
        titleLabel: t("workspace.repositories.issueTitle"),
        titlePlaceholder: t("workspace.repositories.issueTitlePlaceholder"),
        titleRequired: t("workspace.repositories.issueTitleRequired"),
        bodyLabel: t("workspace.repositories.issueBody"),
        bodyPlaceholder: t("workspace.repositories.issueBodyPlaceholder"),
      }}
    />
  );
}
