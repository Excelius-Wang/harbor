import { FormEvent, useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, GitBranch, Plus } from "lucide-react";
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
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
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

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

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
    onError: (error) =>
      toast.error(t("workspace.repositories.settings.createFailed"), {
        description: parseIpcError(error).message,
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.settings.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.settings.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={nameId}>{t("workspace.repositories.settings.name")}</FieldLabel>
              <Input
                id={nameId}
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
                type="url"
                value={homepage}
                placeholder="https://example.com"
                onChange={(event) => setHomepage(event.currentTarget.value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>{t("workspace.repositories.settings.visibility")}</FieldLabel>
            <RadioGroup
              value={visibility}
              onValueChange={(value) => setVisibility(value as GitHubRepositoryVisibility)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {(["private", "public"] as const).map((value) => (
                <FieldLabel
                  key={value}
                  className="border-border/70 bg-muted/20 flex cursor-pointer items-start gap-3 rounded-md border p-3"
                >
                  <RadioGroupItem value={value} />
                  <FieldContent>
                    <span className="text-xs font-medium">
                      {t(`workspace.repositories.settings.visibilityOptions.${value}.label`)}
                    </span>
                    <FieldDescription>
                      {t(`workspace.repositories.settings.visibilityOptions.${value}.description`)}
                    </FieldDescription>
                  </FieldContent>
                </FieldLabel>
              ))}
            </RadioGroup>
          </Field>

          <div className="border-border/60 flex flex-col gap-3 rounded-md border p-3">
            <Field orientation="horizontal">
              <Checkbox
                id="create-readme"
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
                <FieldLabel htmlFor="create-readme">
                  <BookOpen /> {t("workspace.repositories.settings.initializeReadme")}
                </FieldLabel>
                <FieldDescription>
                  {t("workspace.repositories.settings.initializeReadmeDescription")}
                </FieldDescription>
              </FieldContent>
            </Field>
            {optionsResult.isError ? (
              <Alert variant="destructive">
                <GitBranch />
                <AlertTitle>{t("workspace.repositories.settings.templatesLoadFailed")}</AlertTitle>
                <AlertDescription>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void optionsResult.refetch()}
                  >
                    {t("common.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{t("workspace.repositories.settings.gitignore")}</FieldLabel>
                  <Select
                    value={gitignoreTemplate}
                    disabled={!initializeWithReadme || optionsResult.isPending}
                    onValueChange={setGitignoreTemplate}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEMPLATE}>
                        {t("workspace.repositories.settings.noTemplate")}
                      </SelectItem>
                      {optionsResult.data?.gitignoreTemplates.map((template) => (
                        <SelectItem key={template} value={template}>
                          {template}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>{t("workspace.repositories.settings.license")}</FieldLabel>
                  <Select
                    value={licenseTemplate}
                    disabled={!initializeWithReadme || optionsResult.isPending}
                    onValueChange={setLicenseTemplate}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEMPLATE}>
                        {t("workspace.repositories.settings.noTemplate")}
                      </SelectItem>
                      {optionsResult.data?.licenses.map((license) => (
                        <SelectItem key={license.key} value={license.key}>
                          {license.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["issues", hasIssues, setHasIssues],
              ["projects", hasProjects, setHasProjects],
              ["wiki", hasWiki, setHasWiki],
              ["discussions", hasDiscussions, setHasDiscussions],
            ].map(([key, checked, setChecked]) => (
              <Field key={key as string} orientation="horizontal">
                <Checkbox
                  id={`create-${key}`}
                  checked={checked as boolean}
                  onCheckedChange={(value) =>
                    (setChecked as (value: boolean) => void)(value === true)
                  }
                />
                <FieldLabel htmlFor={`create-${key}`}>
                  {t(`workspace.repositories.settings.features.${key}`)}
                </FieldLabel>
              </Field>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
