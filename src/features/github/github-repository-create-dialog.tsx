import { FormEvent, useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CircleAlert, GitBranch, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubRepository, GitHubRepositoryVisibility } from "./github-data";
import { repositoryCreationOptionsQueryOptions } from "./github-queries";
import {
  createPersonalRepository,
  refreshPersonalRepositoryLists,
  syncCreatedPersonalRepository,
} from "./github-repository-settings";

const NO_TEMPLATE = "__none__";

export function GitHubRepositoryCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (repository: GitHubRepository) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const homepageId = useId();
  const visibilityId = useId();
  const readmeId = useId();
  const gitignoreId = useId();
  const licenseId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [homepage, setHomepage] = useState("");
  const [visibility, setVisibility] = useState<GitHubRepositoryVisibility>("private");
  const [initializeWithReadme, setInitializeWithReadme] = useState(true);
  const [gitignoreTemplate, setGitignoreTemplate] = useState(NO_TEMPLATE);
  const [licenseTemplate, setLicenseTemplate] = useState(NO_TEMPLATE);
  const [hasIssues, setHasIssues] = useState(true);
  const [hasProjects, setHasProjects] = useState(true);
  const [hasWiki, setHasWiki] = useState(false);
  const [hasDiscussions, setHasDiscussions] = useState(false);
  const optionsResult = useQuery({
    ...repositoryCreationOptionsQueryOptions(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createPersonalRepository({
        name,
        description: description || undefined,
        homepage: homepage || undefined,
        visibility,
        initializeWithReadme,
        gitignoreTemplate:
          initializeWithReadme && gitignoreTemplate !== NO_TEMPLATE ? gitignoreTemplate : undefined,
        licenseTemplate:
          initializeWithReadme && licenseTemplate !== NO_TEMPLATE ? licenseTemplate : undefined,
        hasIssues,
        hasProjects,
        hasWiki,
        hasDiscussions,
      }),
    onSuccess: (settings) => {
      syncCreatedPersonalRepository(queryClient, settings);
      void refreshPersonalRepositoryLists(queryClient);
      onOpenChange(false);
      onCreated(settings.repository);
      toast.success(
        t("workspace.repositories.settings.repositoryCreated", {
          repository: settings.repository.fullName,
        })
      );
    },
  });

  const resetCreation = mutation.reset;
  useEffect(() => {
    if (!open) return;
    resetCreation();
    setName("");
    setDescription("");
    setHomepage("");
    setVisibility("private");
    setInitializeWithReadme(true);
    setGitignoreTemplate(NO_TEMPLATE);
    setLicenseTemplate(NO_TEMPLATE);
    setHasIssues(true);
    setHasProjects(true);
    setHasWiki(false);
    setHasDiscussions(false);
  }, [open, resetCreation]);

  const creationError = mutation.error ? parseIpcError(mutation.error) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && !mutation.isPending) mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={!mutation.isPending}
        className="max-h-[min(760px,calc(100vh-2rem))] overflow-y-auto sm:max-w-xl"
      >
        <form onSubmit={submit} aria-busy={mutation.isPending} className="flex flex-col gap-5">
          <DialogHeader className="pr-8">
            <DialogTitle>{t("workspace.repositories.settings.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.settings.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={nameId}>{t("workspace.repositories.settings.name")}</FieldLabel>
              <Input
                id={nameId}
                disabled={mutation.isPending}
                value={name}
                maxLength={100}
                autoFocus
                autoComplete="off"
                placeholder="harbor"
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={descriptionId}>
                {t("workspace.repositories.settings.description")}
              </FieldLabel>
              <Input
                id={descriptionId}
                disabled={mutation.isPending}
                value={description}
                maxLength={350}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={homepageId}>
                {t("workspace.repositories.settings.homepage")}
              </FieldLabel>
              <Input
                id={homepageId}
                disabled={mutation.isPending}
                type="url"
                value={homepage}
                placeholder="https://example.com"
                onChange={(event) => setHomepage(event.currentTarget.value)}
              />
            </Field>
          </FieldGroup>

          <FieldSet disabled={mutation.isPending}>
            <FieldLegend id={visibilityId} variant="label">
              {t("workspace.repositories.settings.visibility")}
            </FieldLegend>
            <RadioGroup
              value={visibility}
              aria-labelledby={visibilityId}
              disabled={mutation.isPending}
              onValueChange={(value) => setVisibility(value as GitHubRepositoryVisibility)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {(["private", "public"] as const).map((value) => (
                <FieldLabel
                  key={value}
                  htmlFor={`${visibilityId}-${value}`}
                  className="border-border/70 bg-muted/20 flex cursor-pointer items-start gap-3 rounded-md border p-3"
                >
                  <RadioGroupItem id={`${visibilityId}-${value}`} value={value} />
                  <FieldContent>
                    <span className="text-[13px] font-medium">
                      {t(`workspace.repositories.settings.visibilityOptions.${value}.label`)}
                    </span>
                    <FieldDescription>
                      {t(`workspace.repositories.settings.visibilityOptions.${value}.description`)}
                    </FieldDescription>
                  </FieldContent>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>

          <FieldGroup className="border-border/60 gap-3 rounded-md border p-3">
            <Field orientation="horizontal">
              <Checkbox
                id={readmeId}
                disabled={mutation.isPending}
                checked={initializeWithReadme}
                onCheckedChange={(checked) => {
                  const enabled = checked === true;
                  setInitializeWithReadme(enabled);
                  if (!enabled) {
                    setGitignoreTemplate(NO_TEMPLATE);
                    setLicenseTemplate(NO_TEMPLATE);
                  }
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor={readmeId}>
                  <BookOpen /> {t("workspace.repositories.settings.initializeReadme")}
                </FieldLabel>
                <FieldDescription>
                  {t("workspace.repositories.settings.initializeReadmeDescription")}
                </FieldDescription>
              </FieldContent>
            </Field>
            {optionsResult.data && optionsResult.error ? (
              <WorkspaceStaleNotice
                message={parseIpcError(optionsResult.error).message}
                onRetry={() => void optionsResult.refetch()}
                retryDisabled={optionsResult.isFetching || mutation.isPending}
              />
            ) : null}
            {optionsResult.isError && !optionsResult.data ? (
              <Alert variant="destructive">
                <GitBranch />
                <AlertTitle>{t("workspace.repositories.settings.templatesLoadFailed")}</AlertTitle>
                <AlertDescription>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void optionsResult.refetch()}
                    disabled={optionsResult.isFetching || mutation.isPending}
                  >
                    {t("common.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={gitignoreId}>
                    {t("workspace.repositories.settings.gitignore")}
                  </FieldLabel>
                  <Select
                    value={gitignoreTemplate}
                    disabled={
                      !initializeWithReadme || optionsResult.isPending || mutation.isPending
                    }
                    onValueChange={setGitignoreTemplate}
                  >
                    <SelectTrigger id={gitignoreId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={NO_TEMPLATE}>
                          {t("workspace.repositories.settings.noTemplate")}
                        </SelectItem>
                        {optionsResult.data?.gitignoreTemplates.map((template) => (
                          <SelectItem key={template} value={template}>
                            {template}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={licenseId}>
                    {t("workspace.repositories.settings.license")}
                  </FieldLabel>
                  <Select
                    value={licenseTemplate}
                    disabled={
                      !initializeWithReadme || optionsResult.isPending || mutation.isPending
                    }
                    onValueChange={setLicenseTemplate}
                  >
                    <SelectTrigger id={licenseId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={NO_TEMPLATE}>
                          {t("workspace.repositories.settings.noTemplate")}
                        </SelectItem>
                        {optionsResult.data?.licenses.map((license) => (
                          <SelectItem key={license.key} value={license.key}>
                            {license.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            )}
          </FieldGroup>

          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            {[
              ["issues", hasIssues, setHasIssues],
              ["projects", hasProjects, setHasProjects],
              ["wiki", hasWiki, setHasWiki],
              ["discussions", hasDiscussions, setHasDiscussions],
            ].map(([key, checked, setChecked]) => (
              <Field key={key as string} orientation="horizontal">
                <Checkbox
                  id={`${nameId}-${key}`}
                  disabled={mutation.isPending}
                  checked={checked as boolean}
                  onCheckedChange={(value) =>
                    (setChecked as (value: boolean) => void)(value === true)
                  }
                />
                <FieldLabel htmlFor={`${nameId}-${key}`}>
                  {t(`workspace.repositories.settings.features.${key}`)}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>

          {creationError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.settings.createFailed")}</AlertTitle>
              <AlertDescription>{creationError.message}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending ? <Spinner /> : <Plus />}
              {t(
                mutation.isPending
                  ? "workspace.repositories.settings.creating"
                  : "workspace.repositories.settings.create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
