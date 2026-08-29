import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Box,
  CircleAlert,
  ExternalLink,
  GitBranch,
  History,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubPackage,
  GitHubPackageType,
  GitHubPackageVersion,
  GitHubPackageVersionAction,
  GitHubPackageVersionState,
  GitHubPackageVisibility,
  GitHubPackageVisibilityValue,
} from "./github-data";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import {
  invalidatePersonalPackage,
  mutatePersonalPackageVersion,
} from "./github-package-mutations";
import {
  personalPackageQueryOptions,
  personalPackagesQueryOptions,
  personalPackageVersionsQueryOptions,
} from "./github-queries";

const packageTypes: GitHubPackageType[] = [
  "container",
  "npm",
  "maven",
  "rubygems",
  "nuget",
  "docker",
];
const GITHUB_PACKAGES_REGISTRY_GUIDE =
  "https://docs.github.com/en/packages/working-with-a-github-packages-registry";

function PackageListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-2">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-lg p-3">
          <Skeleton className="size-8 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PackageDetailSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
      <Skeleton className="h-7 w-2/5" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-9 w-56" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}

function PackageVisibilityBadge({ visibility }: { visibility: GitHubPackageVisibilityValue }) {
  const { t } = useTranslation();
  const label =
    visibility.kind === "unknown"
      ? `${t("workspace.packages.visibility.unknown")}: ${visibility.value}`
      : t(`workspace.packages.visibility.${visibility.kind}`);
  return (
    <Badge
      variant={visibility.kind === "private" ? "secondary" : "outline"}
      className="font-normal"
    >
      {label}
    </Badge>
  );
}

function PackageRow({
  item,
  selected,
  locale,
  onSelect,
}: {
  item: GitHubPackage;
  selected: boolean;
  locale: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full justify-start gap-3 rounded-lg border px-3 py-3 text-left whitespace-normal",
        selected
          ? "border-primary/30 bg-primary/8 hover:bg-primary/10"
          : "border-transparent hover:border-white/8"
      )}
    >
      <span className="border-primary/20 bg-primary/[0.06] text-primary grid size-8 shrink-0 place-items-center rounded-md border">
        <Box className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="w-full truncate text-[12px] font-medium">{item.name}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-[9px] font-normal uppercase">
            {t(`workspace.packages.type.${item.packageType}`)}
          </Badge>
          <PackageVisibilityBadge visibility={item.visibility} />
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span>{t("workspace.packages.versionCount", { count: item.versionCount })}</span>
          <span>{formatIssueDate(item.updatedAt, locale)}</span>
        </span>
      </span>
    </Button>
  );
}

function packagesErrorTitle(code: string) {
  if (code === "desktopOnly") return "workspace.packages.desktopOnlyTitle";
  if (code === "githubNotConnected") return "workspace.packages.connectTitle";
  if (code === "githubPermission") return "workspace.packages.permissionTitle";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.packages.loadFailed";
}

function PackageVersionRow({
  version,
  locale,
  onMutate,
}: {
  version: GitHubPackageVersion;
  locale: string;
  onMutate: (version: GitHubPackageVersion) => void;
}) {
  const { t } = useTranslation();
  const deleted = version.state === "deleted";
  const tags = version.metadata.kind === "container" ? version.metadata.tags : [];
  return (
    <div className="hover:bg-muted/20 flex flex-col gap-3 border-b px-4 py-3 transition-colors last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
          {deleted ? <History className="size-4" /> : <PackageOpen className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-mono text-xs font-medium">{version.name}</span>
            {version.license ? (
              <Badge variant="outline" className="font-normal">
                {version.license}
              </Badge>
            ) : null}
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-mono text-[9px] font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          {version.description ? (
            <p className="text-muted-foreground line-clamp-2 text-xs leading-5">
              {version.description}
            </p>
          ) : null}
          <p className="text-muted-foreground text-[10px]">
            {deleted && version.deletedAt
              ? t("workspace.packages.deletedAt", {
                  date: formatIssueDate(version.deletedAt, locale),
                })
              : t("workspace.packages.updatedAt", {
                  date: formatIssueDate(version.updatedAt, locale),
                })}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("workspace.packages.openVersion")}
          onClick={() => void openExternalUrl(version.url)}
        >
          <ExternalLink />
        </Button>
        <Button
          type="button"
          variant={deleted ? "outline" : "ghost"}
          size="sm"
          className={deleted ? undefined : "text-destructive hover:text-destructive"}
          onClick={() => onMutate(version)}
        >
          {deleted ? <RotateCcw data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
          {t(deleted ? "workspace.packages.restore" : "workspace.packages.deleteVersion")}
        </Button>
      </div>
    </div>
  );
}

function GitHubPackageDetail({
  packageType,
  packageName,
  onBack,
}: {
  packageType: GitHubPackageType;
  packageName: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const desktopRuntime = isTauri();
  const queryClient = useQueryClient();
  const [state, setState] = useState<GitHubPackageVersionState>("active");
  const [page, setPage] = useState(1);
  const [selectedVersion, setSelectedVersion] = useState<GitHubPackageVersion | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const packageTarget = { packageType, packageName };
  const detailResult = useQuery({
    ...personalPackageQueryOptions(packageTarget),
    enabled: desktopRuntime,
  });
  const packageDetail = detailResult.data;
  const versionsResult = useQuery({
    ...personalPackageVersionsQueryOptions({ ...packageTarget, state, page }),
    enabled: desktopRuntime && Boolean(packageDetail),
  });
  const versionPage = versionsResult.data;
  const mutation = useMutation({
    mutationFn: ({
      version,
      action,
    }: {
      version: GitHubPackageVersion;
      action: GitHubPackageVersionAction;
    }) => {
      if (!packageDetail) throw new Error("Package detail is unavailable");
      return mutatePersonalPackageVersion({
        packageType,
        packageName,
        expectedPackageId: packageDetail.id,
        versionId: version.id,
        expectedVersionName: version.name,
        action,
      });
    },
    onSuccess: async (result) => {
      setSelectedVersion(null);
      setConfirmation("");
      toast.success(
        t(
          result.action === "delete"
            ? "workspace.packages.versionDeleted"
            : "workspace.packages.versionRestored",
          { version: result.versionName }
        )
      );
      await invalidatePersonalPackage(queryClient, packageTarget);
    },
  });
  const detailError =
    !packageDetail && detailResult.error ? parseIpcError(detailResult.error) : null;
  const versionsError =
    !versionsResult.data && versionsResult.error ? parseIpcError(versionsResult.error) : null;
  const supplementalError =
    versionPage && versionsResult.error ? parseIpcError(versionsResult.error) : null;
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;
  const selectedAction: GitHubPackageVersionAction | null = selectedVersion
    ? selectedVersion.state === "deleted"
      ? "restore"
      : "delete"
    : null;

  useEffect(() => {
    setState("active");
    setPage(1);
    setSelectedVersion(null);
    setConfirmation("");
  }, [packageName, packageType]);

  if (detailResult.isPending) return <PackageDetailSkeleton />;

  if (detailError || !packageDetail) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t(packagesErrorTitle(detailError?.code ?? "unknown"))}</EmptyTitle>
          <EmptyDescription>{detailError?.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => void detailResult.refetch()}>
            <RefreshCw data-icon="inline-start" />
            {t("common.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-[74px] shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="workspace-wide:hidden"
            aria-label={t("workspace.packages.back")}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-[-0.02em]">
                {packageDetail.name}
              </h2>
              <PackageVisibilityBadge visibility={packageDetail.visibility} />
            </div>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {t(`workspace.packages.type.${packageDetail.packageType}`)} · {packageDetail.owner}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={detailResult.isFetching || versionsResult.isFetching}
            onClick={() => {
              void detailResult.refetch();
              void versionsResult.refetch();
            }}
          >
            {detailResult.isFetching || versionsResult.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            <span className="hidden sm:inline">{t("common.refresh")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openExternalUrl(packageDetail.url)}
          >
            <ExternalLink data-icon="inline-start" />
            <span className="hidden sm:inline">{t("workspace.packages.openOnGitHub")}</span>
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
        <div className="flex flex-col gap-4 p-4">
          <section className="bg-card/35 grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("workspace.packages.versions")}
              </span>
              <span className="font-mono text-sm tabular-nums">{packageDetail.versionCount}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("workspace.packages.linkedRepository")}
              </span>
              {packageDetail.repository ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto min-w-0 justify-start p-0 text-sm"
                  onClick={() => void openExternalUrl(packageDetail.repository!.url)}
                >
                  <GitBranch data-icon="inline-start" />
                  <span className="truncate">{packageDetail.repository.fullName}</span>
                </Button>
              ) : (
                <span className="text-muted-foreground text-sm">
                  {t("workspace.packages.notLinked")}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {t("workspace.packages.updated")}
              </span>
              <span className="text-sm">
                {formatIssueDate(packageDetail.updatedAt, i18n.language)}
              </span>
            </div>
          </section>

          <Alert>
            <ShieldAlert />
            <AlertTitle>{t("workspace.packages.webFallbackTitle")}</AlertTitle>
            <AlertDescription>
              <p>{t("workspace.packages.webFallbackDescription")}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void openExternalUrl(GITHUB_PACKAGES_REGISTRY_GUIDE)}
                >
                  <ExternalLink data-icon="inline-start" />
                  {t("workspace.packages.publishInstallGuide")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void openExternalUrl(packageDetail.url)}
                >
                  <ExternalLink data-icon="inline-start" />
                  {t("workspace.packages.manageOnGitHub")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={state}
              onValueChange={(value) => {
                setState(value as GitHubPackageVersionState);
                setPage(1);
              }}
            >
              <TabsList>
                <TabsTrigger value="active">{t("workspace.packages.activeVersions")}</TabsTrigger>
                <TabsTrigger value="deleted">{t("workspace.packages.deletedVersions")}</TabsTrigger>
              </TabsList>
            </Tabs>
            {state === "deleted" ? (
              <span className="text-muted-foreground text-xs">
                {t("workspace.packages.restoreWindow")}
              </span>
            ) : null}
          </div>

          {supplementalError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.packages.refreshFailed")}</AlertTitle>
              <AlertDescription>{supplementalError.message}</AlertDescription>
            </Alert>
          ) : null}

          <section className="overflow-hidden rounded-lg border">
            {versionsError ? (
              <Empty className="min-h-56">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.packages.versionsFailed")}</EmptyTitle>
                  <EmptyDescription>
                    {versionsError.code === "githubPermission"
                      ? t("workspace.packages.permissionDescription")
                      : versionsError.message}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={() => void versionsResult.refetch()}>
                    <RefreshCw data-icon="inline-start" />
                    {t("common.retry")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : versionsResult.isPending ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-20 w-full" />
                ))}
              </div>
            ) : !versionPage || versionPage.versions.length === 0 ? (
              <Empty className="min-h-56">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {state === "deleted" ? <History /> : <PackageOpen />}
                  </EmptyMedia>
                  <EmptyTitle>
                    {t(
                      state === "deleted"
                        ? "workspace.packages.noDeletedVersions"
                        : "workspace.packages.noActiveVersions"
                    )}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t(
                      state === "deleted"
                        ? "workspace.packages.noDeletedVersionsDescription"
                        : "workspace.packages.noActiveVersionsDescription"
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              versionPage.versions.map((version) => (
                <PackageVersionRow
                  key={version.id}
                  version={version}
                  locale={i18n.language}
                  onMutate={setSelectedVersion}
                />
              ))
            )}
            {versionPage ? (
              <GitHubPagination
                page={versionPage.page}
                hasPrevious={versionPage.hasPrevious}
                hasMore={versionPage.hasMore}
                onPageChange={setPage}
                ariaLabel={t("workspace.packages.versionPagination")}
              />
            ) : null}
          </section>
        </div>
      </ScrollArea>

      <AlertDialog
        open={selectedVersion !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setSelectedVersion(null);
            setConfirmation("");
            mutation.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                selectedAction === "restore"
                  ? "workspace.packages.restoreTitle"
                  : "workspace.packages.deleteTitle"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedAction === "restore"
                ? t("workspace.packages.restoreDescription", {
                    version: selectedVersion?.name,
                  })
                : t("workspace.packages.deleteDescription", {
                    version: selectedVersion?.name,
                    packageName,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedAction === "delete" ? (
            <div className="flex flex-col gap-3">
              {packageDetail.visibility.kind === "public" ? (
                <Alert>
                  <CircleAlert />
                  <AlertDescription>
                    {t("workspace.packages.publicDeleteRestriction")}
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor={`delete-package-version-${selectedVersion?.id ?? "selected"}`}>
                  {t("workspace.packages.deleteConfirmation", { packageName })}
                </FieldLabel>
                <Input
                  id={`delete-package-version-${selectedVersion?.id ?? "selected"}`}
                  value={confirmation}
                  disabled={mutation.isPending}
                  autoComplete="off"
                  onChange={(event) => setConfirmation(event.currentTarget.value)}
                />
              </Field>
            </div>
          ) : null}
          {mutationError ? (
            <FieldError>
              {mutationError.code === "githubPackageConflict"
                ? t("workspace.packages.conflictDescription")
                : mutationError.code === "githubPermission"
                  ? t("workspace.packages.permissionDescription")
                  : mutationError.message}
            </FieldError>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={selectedAction === "delete" ? "destructive" : "default"}
              disabled={
                mutation.isPending ||
                !selectedVersion ||
                (selectedAction === "delete" && confirmation !== packageName)
              }
              onClick={(event) => {
                event.preventDefault();
                if (selectedVersion && selectedAction) {
                  mutation.mutate({ version: selectedVersion, action: selectedAction });
                }
              }}
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : selectedAction === "restore" ? (
                <RotateCcw data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {t(
                selectedAction === "restore"
                  ? "workspace.packages.restore"
                  : "workspace.packages.deleteVersion"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function GitHubPackagesView() {
  const { t, i18n } = useTranslation();
  const desktopRuntime = isTauri();
  const [packageType, setPackageType] = useState<GitHubPackageType>("container");
  const [visibility, setVisibility] = useState<GitHubPackageVisibility | null>(null);
  const [page, setPage] = useState(1);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [wideLayout, setWideLayout] = useState(
    () => window.matchMedia("(min-width: 1180px)").matches
  );
  const result = useQuery({
    ...personalPackagesQueryOptions({ packageType, visibility, page }),
    enabled: desktopRuntime,
  });
  const packagePage = result.data;
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.packages.desktopOnly") }
    : !result.data && result.error
      ? parseIpcError(result.error)
      : null;
  const supplementalError = packagePage && result.error ? parseIpcError(result.error) : null;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1180px)");
    const updateLayout = () => setWideLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    const packages = packagePage?.packages ?? [];
    if (wideLayout && selectedName === null && packages[0]) setSelectedName(packages[0].name);
  }, [packagePage, selectedName, wideLayout]);

  const resetSelection = () => {
    setPage(1);
    setSelectedName(null);
  };

  return (
    <section className="@container/packages flex min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--background)_95%,transparent)]">
      <header className="flex min-h-[74px] shrink-0 items-center justify-between gap-4 border-b px-5 py-3">
        <div>
          <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
            {t("workspace.packages.eyebrow")}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em]">
            {t("workspace.nav.packages")}
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!desktopRuntime || result.isFetching}
          onClick={() => void result.refetch()}
        >
          {result.isFetching ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {t("common.refresh")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "workspace-wide:flex workspace-wide:w-[340px] min-h-0 w-full shrink-0 flex-col border-r",
            selectedName === null ? "flex" : "hidden"
          )}
        >
          <div className="grid grid-cols-2 gap-2 border-b p-3">
            <Select
              value={packageType}
              onValueChange={(value) => {
                setPackageType(value as GitHubPackageType);
                resetSelection();
              }}
            >
              <SelectTrigger size="sm" aria-label={t("workspace.packages.registry")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {packageTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`workspace.packages.type.${type}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={visibility ?? "all"}
              onValueChange={(value) => {
                setVisibility(value === "all" ? null : (value as GitHubPackageVisibility));
                resetSelection();
              }}
            >
              <SelectTrigger size="sm" aria-label={t("workspace.packages.visibilityFilter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("workspace.packages.visibility.all")}</SelectItem>
                  <SelectItem value="public">
                    {t("workspace.packages.visibility.public")}
                  </SelectItem>
                  <SelectItem value="private">
                    {t("workspace.packages.visibility.private")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
            {error ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>{t(packagesErrorTitle(error.code))}</EmptyTitle>
                  <EmptyDescription>
                    {error.code === "githubPermission"
                      ? t("workspace.packages.permissionDescription")
                      : error.message}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
                    <RefreshCw data-icon="inline-start" />
                    {t("common.retry")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : result.isPending ? (
              <PackageListSkeleton />
            ) : !packagePage || packagePage.packages.length === 0 ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageOpen />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.packages.emptyTitle")}</EmptyTitle>
                  <EmptyDescription>{t("workspace.packages.emptyDescription")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-1.5 p-2">
                {supplementalError ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription>{supplementalError.message}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-muted-foreground text-[10px]">
                    {t("workspace.packages.loadedCount", { count: packagePage.packages.length })}
                  </span>
                  <Badge variant="outline" className="font-normal">
                    {t(`workspace.packages.type.${packageType}`)}
                  </Badge>
                </div>
                {packagePage.packages.map((item) => (
                  <PackageRow
                    key={item.id}
                    item={item}
                    selected={selectedName === item.name}
                    locale={i18n.language}
                    onSelect={() => setSelectedName(item.name)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
          {packagePage ? (
            <GitHubPagination
              page={packagePage.page}
              hasPrevious={packagePage.hasPrevious}
              hasMore={packagePage.hasMore}
              onPageChange={(nextPage) => {
                setPage(nextPage);
                setSelectedName(null);
              }}
              ariaLabel={t("workspace.packages.packagePagination")}
            />
          ) : null}
        </aside>

        <main
          className={cn(
            "workspace-wide:flex min-h-0 min-w-0 flex-1",
            selectedName === null ? "hidden" : "flex"
          )}
        >
          {selectedName ? (
            <GitHubPackageDetail
              key={`${packageType}:${selectedName}`}
              packageType={packageType}
              packageName={selectedName}
              onBack={() => setSelectedName(null)}
            />
          ) : (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageOpen />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.packages.selectTitle")}</EmptyTitle>
                <EmptyDescription>{t("workspace.packages.selectDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </main>
      </div>
    </section>
  );
}
