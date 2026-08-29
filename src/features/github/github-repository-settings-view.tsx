import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronRight,
  GitMerge,
  Globe2,
  Save,
  Settings2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubRepository,
  GitHubRepositorySettings,
  GitHubRepositorySettingsUpdate,
  GitHubRepositoryVisibility,
} from "./github-data";
import {
  personalRepositorySettingsQueryOptions,
  repositoryCodeQueryOptions,
} from "./github-queries";
import {
  deletePersonalRepository,
  refreshPersonalRepositoryLists,
  syncDeletedPersonalRepository,
  syncUpdatedPersonalRepository,
  updatePersonalRepositorySettings,
} from "./github-repository-settings";

const GitHubRepositoryPagesView = lazy(() =>
  import("./github-repository-pages-view").then((module) => ({
    default: module.GitHubRepositoryPagesView,
  }))
);

function editableSettings(settings: GitHubRepositorySettings): GitHubRepositorySettingsUpdate {
  return {
    name: settings.repository.name,
    description: settings.repository.description,
    homepage: settings.homepage,
    visibility: settings.visibility,
    defaultBranch: settings.repository.defaultBranch,
    archived: settings.repository.isArchived,
    isTemplate: settings.isTemplate,
    hasIssues: settings.hasIssues,
    hasProjects: settings.hasProjects,
    hasWiki: settings.hasWiki,
    hasDiscussions: settings.hasDiscussions,
    allowMergeCommit: settings.allowMergeCommit,
    allowSquashMerge: settings.allowSquashMerge,
    allowRebaseMerge: settings.allowRebaseMerge,
    allowAutoMerge: settings.allowAutoMerge,
    allowUpdateBranch: settings.allowUpdateBranch,
    deleteBranchOnMerge: settings.deleteBranchOnMerge,
    acceptVisibilityChangeConsequences: false,
    confirmArchiveChange: false,
  };
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function SettingToggle({
  id,
  checked,
  disabled,
  label,
  description,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  description?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal" className="items-start">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}

export function GitHubRepositorySettingsView({ repository }: { repository: GitHubRepository }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const settingsResult = useQuery(personalRepositorySettingsQueryOptions(target));
  const settings = settingsResult.data;
  const [draft, setDraft] = useState<GitHubRepositorySettingsUpdate | null>(null);
  const [visibilityConfirmation, setVisibilityConfirmation] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [managingPages, setManagingPages] = useState(false);
  const codeResult = useQuery({
    ...repositoryCodeQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      reference: repository.defaultBranch,
    }),
    enabled: Boolean(settings) && !repository.isArchived,
  });

  useEffect(() => {
    if (settings) setDraft(editableSettings(settings));
  }, [settings]);

  useEffect(() => {
    setDeleteOpen(false);
    setDeleteConfirmation("");
    setManagingPages(false);
  }, [repository.id]);

  const branches = [
    ...new Set([
      ...(draft?.defaultBranch ? [draft.defaultBranch] : []),
      ...(codeResult.data?.branches ?? []).map((branch) => branch.name),
    ]),
  ];

  const mutation = useMutation({
    mutationFn: (update: GitHubRepositorySettingsUpdate) =>
      updatePersonalRepositorySettings(target, update),
    onSuccess: (next, update) => {
      syncUpdatedPersonalRepository(queryClient, target, next);
      setDraft(editableSettings(next));
      setVisibilityConfirmation(false);
      setArchiveConfirmation(false);
      void refreshPersonalRepositoryLists(queryClient);
      toast.success(
        t(
          settings && settings.repository.isArchived !== update.archived
            ? update.archived
              ? "workspace.repositories.settings.archivedSuccess"
              : "workspace.repositories.settings.unarchivedSuccess"
            : "workspace.repositories.settings.updated"
        )
      );
    },
    onError: (error) =>
      toast.error(t("workspace.repositories.settings.updateFailed"), {
        description: parseIpcError(error).message,
      }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deletePersonalRepository(target, deleteConfirmation),
    onSuccess: () => {
      syncDeletedPersonalRepository(queryClient, target, repository.id);
      void refreshPersonalRepositoryLists(queryClient);
      setDeleteOpen(false);
      toast.success(t("workspace.repositories.settings.deleted"));
    },
    onError: (error) => {
      const ipcError = parseIpcError(error);
      toast.error(t("workspace.repositories.settings.deleteFailed"), {
        description:
          ipcError.code === "githubPermission"
            ? t("workspace.repositories.settings.deletePermission")
            : ipcError.message,
      });
    },
  });

  if (settingsResult.isPending) return <SettingsSkeleton />;
  if (settingsResult.isError) {
    const error = parseIpcError(settingsResult.error);
    return (
      <div className="mx-auto grid w-full max-w-3xl place-items-center p-6">
        <Alert variant="destructive">
          <Settings2 />
          <AlertTitle>{t("workspace.repositories.settings.loadFailed")}</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void settingsResult.refetch()}>
              {t("common.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!settings || !draft) return <SettingsSkeleton />;

  const archived = settings.repository.isArchived;
  const mergeMethodsValid =
    draft.allowMergeCommit || draft.allowSquashMerge || draft.allowRebaseMerge;
  const updateDraft = <Key extends keyof GitHubRepositorySettingsUpdate>(
    key: Key,
    value: GitHubRepositorySettingsUpdate[Key]
  ) => setDraft((current) => (current ? { ...current, [key]: value } : current));
  const submitSettings = () => {
    if (!mergeMethodsValid || archived) return;
    if (draft.visibility !== settings.visibility) {
      setVisibilityConfirmation(true);
      return;
    }
    mutation.mutate(draft);
  };
  const toggleArchive = () => {
    mutation.mutate({
      ...editableSettings(settings),
      archived: !settings.repository.isArchived,
      confirmArchiveChange: true,
    });
  };

  if (managingPages) {
    return (
      <Suspense fallback={<SettingsSkeleton />}>
        <GitHubRepositoryPagesView
          repository={settings.repository}
          branches={branches}
          onBack={() => setManagingPages(false)}
        />
      </Suspense>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5 pb-10">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em]">
            {t("workspace.repositories.settings.title")}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("workspace.repositories.settings.ownerOnlyDescription")}
          </p>
        </div>

        {archived ? (
          <Alert>
            <Archive />
            <AlertTitle>{t("workspace.repositories.settings.archivedTitle")}</AlertTitle>
            <AlertDescription>
              {t("workspace.repositories.settings.archivedDescription")}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("workspace.repositories.settings.general")}</CardTitle>
            <CardDescription>
              {t("workspace.repositories.settings.generalDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="repository-settings-name">
                {t("workspace.repositories.settings.name")}
              </FieldLabel>
              <Input
                id="repository-settings-name"
                value={draft.name}
                maxLength={100}
                disabled={archived}
                onChange={(event) => updateDraft("name", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("workspace.repositories.settings.defaultBranch")}</FieldLabel>
              <Select
                value={draft.defaultBranch}
                disabled={archived}
                onValueChange={(value) => updateDraft("defaultBranch", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="repository-settings-description">
                {t("workspace.repositories.settings.description")}
              </FieldLabel>
              <Input
                id="repository-settings-description"
                value={draft.description ?? ""}
                maxLength={350}
                disabled={archived}
                onChange={(event) => updateDraft("description", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="repository-settings-homepage">
                {t("workspace.repositories.settings.homepage")}
              </FieldLabel>
              <Input
                id="repository-settings-homepage"
                type="url"
                value={draft.homepage ?? ""}
                disabled={archived}
                onChange={(event) => updateDraft("homepage", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("workspace.repositories.settings.visibility")}</FieldLabel>
              <Select
                value={draft.visibility}
                disabled={archived}
                onValueChange={(value) =>
                  updateDraft("visibility", value as GitHubRepositoryVisibility)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    {t("workspace.repositories.settings.visibilityOptions.private.label")}
                  </SelectItem>
                  <SelectItem value="public">
                    {t("workspace.repositories.settings.visibilityOptions.public.label")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <SettingToggle
              id="repository-settings-template"
              checked={draft.isTemplate}
              disabled={archived}
              label={t("workspace.repositories.settings.templateRepository")}
              description={t("workspace.repositories.settings.templateRepositoryDescription")}
              onCheckedChange={(checked) => updateDraft("isTemplate", checked)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("workspace.repositories.settings.featuresTitle")}</CardTitle>
            <CardDescription>
              {t("workspace.repositories.settings.featuresDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["hasIssues", "issues"],
                ["hasProjects", "projects"],
                ["hasWiki", "wiki"],
                ["hasDiscussions", "discussions"],
              ] as const
            ).map(([field, key]) => (
              <SettingToggle
                key={field}
                id={`repository-settings-${field}`}
                checked={draft[field]}
                disabled={archived}
                label={t(`workspace.repositories.settings.features.${key}`)}
                onCheckedChange={(checked) => updateDraft(field, checked)}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitMerge /> {t("workspace.repositories.settings.pullRequests")}
            </CardTitle>
            <CardDescription>
              {t("workspace.repositories.settings.pullRequestsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["allowMergeCommit", "mergeCommit"],
                ["allowSquashMerge", "squashMerge"],
                ["allowRebaseMerge", "rebaseMerge"],
                ["allowAutoMerge", "autoMerge"],
                ["allowUpdateBranch", "updateBranch"],
                ["deleteBranchOnMerge", "deleteBranch"],
              ] as const
            ).map(([field, key]) => (
              <SettingToggle
                key={field}
                id={`repository-settings-${field}`}
                checked={draft[field]}
                disabled={archived}
                label={t(`workspace.repositories.settings.mergeOptions.${key}.label`)}
                description={t(`workspace.repositories.settings.mergeOptions.${key}.description`)}
                onCheckedChange={(checked) => updateDraft(field, checked)}
              />
            ))}
            {!mergeMethodsValid ? (
              <p role="alert" className="text-destructive text-xs sm:col-span-2">
                {t("workspace.repositories.settings.mergeMethodRequired")}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            disabled={archived || !draft.name.trim() || !mergeMethodsValid || mutation.isPending}
            onClick={submitSettings}
          >
            {mutation.isPending ? <Spinner /> : <Save />}
            {t("workspace.repositories.settings.save")}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 /> {t("workspace.repositories.settings.pages.title")}
            </CardTitle>
            <CardDescription>
              {t("workspace.repositories.settings.pages.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              {t("workspace.repositories.settings.pages.summary")}
            </p>
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="outline" onClick={() => setManagingPages(true)}>
              {t("workspace.repositories.settings.pages.manage")}
              <ChevronRight data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-destructive/35">
          <CardHeader>
            <CardTitle className="text-destructive">
              {t("workspace.repositories.settings.dangerZone")}
            </CardTitle>
            <CardDescription>
              {t("workspace.repositories.settings.dangerZoneDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <div>
                <p className="text-sm font-medium">
                  {t(
                    archived
                      ? "workspace.repositories.settings.unarchive"
                      : "workspace.repositories.settings.archive"
                  )}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t(
                    archived
                      ? "workspace.repositories.settings.unarchiveDescription"
                      : "workspace.repositories.settings.archiveDescription"
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => setArchiveConfirmation(true)}
              >
                {archived ? <Undo2 /> : <Archive />}
                {t(
                  archived
                    ? "workspace.repositories.settings.unarchive"
                    : "workspace.repositories.settings.archive"
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
              <div>
                <p className="text-sm font-medium">{t("workspace.repositories.settings.delete")}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("workspace.repositories.settings.deleteDescription")}
                </p>
              </div>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> {t("workspace.repositories.settings.delete")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={visibilityConfirmation} onOpenChange={setVisibilityConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.settings.visibilityChangeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.settings.visibilityChangeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
            <li>{t("workspace.repositories.settings.visibilityConsequenceStars")}</li>
            <li>{t("workspace.repositories.settings.visibilityConsequenceForks")}</li>
            <li>{t("workspace.repositories.settings.visibilityConsequenceActions")}</li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                mutation.mutate({ ...draft, acceptVisibilityChangeConsequences: true })
              }
            >
              {t("workspace.repositories.settings.acceptVisibilityChange")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveConfirmation} onOpenChange={setArchiveConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                archived
                  ? "workspace.repositories.settings.unarchiveTitle"
                  : "workspace.repositories.settings.archiveTitle"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                archived
                  ? "workspace.repositories.settings.unarchiveConfirmDescription"
                  : "workspace.repositories.settings.archiveConfirmDescription",
                { repository: settings.repository.fullName }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={toggleArchive}>
              {t(
                archived
                  ? "workspace.repositories.settings.unarchive"
                  : "workspace.repositories.settings.archive"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.settings.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.settings.deleteConfirmDescription", {
                repository: settings.repository.fullName,
              })}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="repository-delete-confirmation">
              {t("workspace.repositories.settings.deleteConfirmationLabel", {
                repository: settings.repository.fullName,
              })}
            </FieldLabel>
            <Input
              id="repository-delete-confirmation"
              value={deleteConfirmation}
              autoComplete="off"
              onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={
                deleteConfirmation !== settings.repository.fullName || deleteMutation.isPending
              }
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? <Spinner /> : <Trash2 />}
              {t("workspace.repositories.settings.deletePermanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
