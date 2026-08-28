import { useState } from "react";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { GitHubReleaseMutationInput, GitHubRepositoryContentContext } from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";

export function GitHubReleaseForm({
  repository,
  idPrefix,
  initialValue,
  immutable = false,
  mode,
  pending,
  errorMessage,
  onChange,
  onSubmit,
  onCancel,
}: {
  repository: GitHubRepositoryContentContext;
  idPrefix: string;
  initialValue: GitHubReleaseMutationInput;
  immutable?: boolean;
  mode: "create" | "edit";
  pending: boolean;
  errorMessage?: string;
  onChange?: () => void;
  onSubmit: (value: GitHubReleaseMutationInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [submitted, setSubmitted] = useState(false);
  const tagInvalid = submitted && !value.tagName.trim();
  const targetInvalid = submitted && !value.targetCommitish.trim();
  const changed =
    value.tagName.trim() !== initialValue.tagName ||
    value.targetCommitish.trim() !== initialValue.targetCommitish ||
    value.name.trim() !== initialValue.name ||
    value.body !== initialValue.body ||
    value.draft !== initialValue.draft ||
    value.prerelease !== initialValue.prerelease;
  const update = (next: Partial<GitHubReleaseMutationInput>) => {
    setValue((current) => ({ ...current, ...next }));
    onChange?.();
  };
  const submitLabel =
    mode === "edit"
      ? t("workspace.repositories.saveChanges")
      : value.draft
        ? t("workspace.repositories.saveReleaseDraft")
        : t("workspace.repositories.publishRelease");
  const pendingLabel =
    mode === "edit"
      ? t("workspace.repositories.savingChanges")
      : value.draft
        ? t("workspace.repositories.savingReleaseDraft")
        : t("workspace.repositories.publishingRelease");

  return (
    <form
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (
          pending ||
          !value.tagName.trim() ||
          !value.targetCommitish.trim() ||
          (mode === "edit" && !changed)
        ) {
          return;
        }
        onSubmit({
          ...value,
          tagName: value.tagName.trim(),
          targetCommitish: value.targetCommitish.trim(),
          name: value.name.trim(),
        });
      }}
    >
      <FieldGroup className="gap-5">
        {immutable ? (
          <Alert>
            <LockKeyhole />
            <AlertTitle>{t("workspace.repositories.releaseImmutableEditTitle")}</AlertTitle>
            <AlertDescription>
              {t("workspace.repositories.releaseImmutableEditDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={tagInvalid} data-disabled={pending || immutable}>
            <FieldLabel htmlFor={`${idPrefix}-tag`}>
              {t("workspace.repositories.releaseTag")}
            </FieldLabel>
            <Input
              id={`${idPrefix}-tag`}
              name="tagName"
              value={value.tagName}
              autoFocus={!immutable}
              autoComplete="off"
              aria-invalid={tagInvalid}
              disabled={pending || immutable}
              placeholder={t("workspace.repositories.releaseTagPlaceholder")}
              onChange={(event) => {
                update({ tagName: event.target.value });
                if (submitted && event.target.value.trim()) setSubmitted(false);
              }}
            />
            <FieldError>
              {tagInvalid ? t("workspace.repositories.releaseTagRequired") : null}
            </FieldError>
          </Field>
          <Field data-invalid={targetInvalid} data-disabled={pending || immutable}>
            <FieldLabel htmlFor={`${idPrefix}-target`}>
              {t("workspace.repositories.releaseTargetCommitish")}
            </FieldLabel>
            <Input
              id={`${idPrefix}-target`}
              name="targetCommitish"
              value={value.targetCommitish}
              autoComplete="off"
              aria-invalid={targetInvalid}
              disabled={pending || immutable}
              placeholder={repository.defaultBranch}
              onChange={(event) => {
                update({ targetCommitish: event.target.value });
                if (submitted && event.target.value.trim()) setSubmitted(false);
              }}
            />
            <FieldDescription className="text-[10px]">
              {t("workspace.repositories.releaseTargetCommitishDescription")}
            </FieldDescription>
            <FieldError>
              {targetInvalid ? t("workspace.repositories.releaseTargetRequired") : null}
            </FieldError>
          </Field>
        </div>
        <Field data-disabled={pending}>
          <FieldLabel htmlFor={`${idPrefix}-name`}>
            {t("workspace.repositories.releaseTitle")}
          </FieldLabel>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            value={value.name}
            autoFocus={immutable}
            autoComplete="off"
            disabled={pending}
            placeholder={t("workspace.repositories.releaseTitlePlaceholder")}
            onChange={(event) => update({ name: event.target.value })}
          />
        </Field>
        <Field data-disabled={pending}>
          <FieldLabel htmlFor={`${idPrefix}-body`}>
            {t("workspace.repositories.releaseNotes")}
          </FieldLabel>
          <GitHubMarkdownEditor
            id={`${idPrefix}-body`}
            name="body"
            value={value.body}
            repository={repository}
            reference={
              value.tagName.trim() || value.targetCommitish.trim() || repository.defaultBranch
            }
            placeholder={t("workspace.repositories.releaseNotesPlaceholder")}
            disabled={pending}
            onChange={(body) => update({ body })}
          />
          <FieldDescription className="text-[10px]">
            {t("workspace.repositories.markdownSupported")}
          </FieldDescription>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field orientation="horizontal" data-disabled={pending || immutable}>
            <Checkbox
              id={`${idPrefix}-draft`}
              checked={value.draft}
              disabled={pending || immutable}
              onCheckedChange={(checked) => update({ draft: checked === true })}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${idPrefix}-draft`}>
                <FieldTitle>{t("workspace.repositories.releaseSaveAsDraft")}</FieldTitle>
              </FieldLabel>
              <FieldDescription className="text-[10px]">
                {t("workspace.repositories.releaseSaveAsDraftDescription")}
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal" data-disabled={pending || immutable}>
            <Checkbox
              id={`${idPrefix}-prerelease`}
              checked={value.prerelease}
              disabled={pending || immutable}
              onCheckedChange={(checked) => update({ prerelease: checked === true })}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${idPrefix}-prerelease`}>
                <FieldTitle>{t("workspace.repositories.releaseSetAsPrerelease")}</FieldTitle>
              </FieldLabel>
              <FieldDescription className="text-[10px]">
                {t("workspace.repositories.releaseSetAsPrereleaseDescription")}
              </FieldDescription>
            </FieldContent>
          </Field>
        </div>
        {errorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.releaseSaveFailed")}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {t("workspace.repositories.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              pending ||
              !value.tagName.trim() ||
              !value.targetCommitish.trim() ||
              (mode === "edit" && !changed)
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
