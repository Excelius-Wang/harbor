import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  CircleAlert,
  Download,
  ExternalLink,
  FileArchive,
  GitCommitHorizontal,
  LockKeyhole,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubReleaseArchiveFormat,
  GitHubReleaseAsset,
  GitHubRepositoryContentContext,
} from "./github-data";
import { formatBytes } from "./github-format";
import { formatIssueDate } from "./github-issue-shared";
import { GitHubReleaseEditDialog } from "./github-release-edit-dialog";
import {
  deleteRepositoryRelease,
  deleteRepositoryReleaseAsset,
  downloadRepositoryReleaseArchive,
  downloadRepositoryReleaseAsset,
  invalidateRepositoryReleases,
  syncDeletedRelease,
  syncDeletedReleaseAsset,
  syncUploadedReleaseAsset,
  uploadRepositoryReleaseAsset,
} from "./github-release-mutations";
import { repositoryReleaseQueryOptions } from "./github-queries";

const GitHubReadme = lazy(() => import("./github-readme"));

function releaseErrorMessage(code: string, message: string, permissionCopy: string) {
  return code === "githubPermission" ? permissionCopy : message;
}

function ReleaseAssetRow({
  asset,
  locale,
  disabled,
  downloading,
  deleting,
  canDelete,
  onDownload,
  onDelete,
}: {
  asset: GitHubReleaseAsset;
  locale: string;
  disabled: boolean;
  downloading: boolean;
  deleting: boolean;
  canDelete: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const uploaded = asset.state.toLowerCase() === "uploaded";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 border-b px-3 py-3 last:border-b-0">
      <span className="bg-muted/60 text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
        <FileArchive className="size-4" />
      </span>
      <div className="min-w-52 flex-1">
        <p className="text-foreground/95 text-xs font-medium break-all">{asset.name}</p>
        {asset.label ? (
          <p className="text-muted-foreground mt-0.5 text-[10px]">{asset.label}</p>
        ) : null}
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span>{formatBytes(asset.size, locale)}</span>
          <span>{asset.contentType}</span>
          <span>
            {t("workspace.repositories.releaseAssetDownloads", {
              count: asset.downloadCount,
            })}
          </span>
          <span>
            {t("workspace.repositories.releaseAssetUpdated", {
              date: formatIssueDate(asset.updatedAt, locale),
            })}
          </span>
        </p>
        {asset.digest ? (
          <p className="text-muted-foreground mt-1 font-mono text-[9px] break-all">
            {asset.digest}
          </p>
        ) : null}
      </div>
      {!uploaded ? (
        <Badge variant="secondary">{t("workspace.repositories.releaseAssetProcessing")}</Badge>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !uploaded}
        onClick={onDownload}
      >
        {downloading ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
        {t(
          downloading
            ? "workspace.repositories.downloadingReleaseAsset"
            : "workspace.repositories.downloadReleaseAsset"
        )}
      </Button>
      {canDelete ? (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onDelete}>
          {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
          {t("workspace.repositories.deleteReleaseAsset")}
        </Button>
      ) : null}
    </div>
  );
}

export function GitHubReleaseDetail({
  repository,
  releaseId,
  onBack,
  onDeleted,
  backLabel,
}: {
  repository: GitHubRepositoryContentContext;
  releaseId: number;
  onBack: () => void;
  onDeleted?: () => void;
  backLabel?: string;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [releaseDeleteOpen, setReleaseDeleteOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<GitHubReleaseAsset | null>(null);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    releaseId,
  };
  const result = useQuery(repositoryReleaseQueryOptions(target));
  const release = result.data;
  const assetDownload = useMutation({
    mutationFn: downloadRepositoryReleaseAsset,
    onSuccess: (saved) => {
      if (saved.saved) {
        toast.success(t("workspace.repositories.releaseDownloadComplete"), {
          description: saved.path ?? undefined,
        });
      }
    },
  });
  const archiveDownload = useMutation({
    mutationFn: downloadRepositoryReleaseArchive,
    onSuccess: (saved) => {
      if (saved.saved) {
        toast.success(t("workspace.repositories.releaseDownloadComplete"), {
          description: saved.path ?? undefined,
        });
      }
    },
  });
  const assetUpload = useMutation({
    mutationFn: () => uploadRepositoryReleaseAsset(target),
    onSuccess: (asset) => {
      if (!asset) return;
      syncUploadedReleaseAsset(queryClient, target, asset);
      toast.success(t("workspace.repositories.releaseAssetUploaded"), {
        description: asset.name,
      });
    },
    onSettled: () => void invalidateRepositoryReleases(queryClient, target, releaseId),
  });
  const assetDelete = useMutation({
    mutationFn: (asset: GitHubReleaseAsset) =>
      deleteRepositoryReleaseAsset(target, asset.id).then(() => asset),
    onSuccess: (asset) => {
      syncDeletedReleaseAsset(queryClient, target, asset.id);
      toast.success(t("workspace.repositories.releaseAssetDeleted"), {
        description: asset.name,
      });
      setAssetToDelete(null);
      void invalidateRepositoryReleases(queryClient, target, releaseId);
    },
  });
  const releaseDelete = useMutation({
    mutationFn: () => deleteRepositoryRelease(target),
    onSuccess: () => {
      syncDeletedRelease(queryClient, target);
      toast.success(t("workspace.repositories.releaseDeleted"));
      setReleaseDeleteOpen(false);
      void invalidateRepositoryReleases(queryClient, target);
      (onDeleted ?? onBack)();
    },
  });
  const error = !release && result.error ? parseIpcError(result.error) : null;
  const supplementalError = release && result.error ? parseIpcError(result.error) : null;
  const downloadError = assetDownload.error
    ? parseIpcError(assetDownload.error)
    : archiveDownload.error
      ? parseIpcError(archiveDownload.error)
      : null;
  const writeError = assetUpload.error ? parseIpcError(assetUpload.error) : null;
  const assetDeleteError = assetDelete.error ? parseIpcError(assetDelete.error) : null;
  const releaseDeleteError = releaseDelete.error ? parseIpcError(releaseDelete.error) : null;
  const downloadArchive = (archiveFormat: GitHubReleaseArchiveFormat) => {
    if (!release) return;
    archiveDownload.mutate({
      ...target,
      tagName: release.tagName,
      archiveFormat,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center gap-3 border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {backLabel ?? t("workspace.repositories.backToReleases")}
        </Button>
        {result.isFetching ? (
          <RefreshCw className="text-muted-foreground size-3 animate-spin" />
        ) : null}
      </div>
      {supplementalError ? (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 px-4 py-2">
          <CircleAlert />
          <AlertDescription className="flex min-w-0 items-center gap-3 text-[11px]">
            <span className="min-w-0 flex-1 truncate">{supplementalError.message}</span>
            <Button type="button" variant="ghost" size="xs" onClick={() => void result.refetch()}>
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {result.isPending ? (
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 p-5">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error || !release ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageOpen />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.releaseLoadFailed")}</EmptyTitle>
              <EmptyDescription>
                {error
                  ? releaseErrorMessage(
                      error.code,
                      error.message,
                      t("workspace.repositories.releasePermissionDenied")
                    )
                  : undefined}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void result.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="mx-auto w-full max-w-[960px] px-4 py-5 sm:px-5">
            <header className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    <Tag /> {release.tagName}
                  </Badge>
                  {release.draft ? (
                    <Badge variant="destructive">{t("workspace.repositories.releaseDraft")}</Badge>
                  ) : release.prerelease ? (
                    <Badge variant="secondary">
                      {t("workspace.repositories.releasePrerelease")}
                    </Badge>
                  ) : null}
                  {release.immutable ? (
                    <Badge variant="outline">
                      <LockKeyhole /> {t("workspace.repositories.releaseImmutable")}
                    </Badge>
                  ) : null}
                </div>
                <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em]">
                  {release.name?.trim() || release.tagName}
                </h2>
                <p className="text-muted-foreground mt-2 text-[11px]">
                  {t(
                    release.draft
                      ? "workspace.repositories.releaseCreatedBy"
                      : "workspace.repositories.releasePublishedBy",
                    {
                      author: release.author
                        ? `@${release.author}`
                        : t("workspace.repositories.unknownActor"),
                      date: formatIssueDate(
                        release.publishedAt ?? release.createdAt,
                        i18n.language
                      ),
                    }
                  )}
                </p>
                <p className="text-muted-foreground mt-1 flex items-center gap-1 text-[10px]">
                  <GitCommitHorizontal className="size-3" />
                  {t("workspace.repositories.releaseTarget", {
                    target: release.targetCommitish,
                  })}
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-wrap items-center gap-2 min-[1200px]:w-auto min-[1200px]:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void openExternalUrl(release.url)}
                >
                  <ExternalLink data-icon="inline-end" />
                  {t("workspace.openOnGitHub")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil data-icon="inline-start" />
                  {t("workspace.repositories.editRelease")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={releaseDelete.isPending}
                  onClick={() => setReleaseDeleteOpen(true)}
                >
                  {releaseDelete.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Trash2 data-icon="inline-start" />
                  )}
                  {t("workspace.repositories.deleteRelease")}
                </Button>
              </div>
            </header>

            <article className="bg-card/30 mt-5 overflow-hidden rounded-lg border">
              <header className="bg-card/40 flex min-h-11 items-center gap-2 border-b px-3.5 py-2 text-xs font-medium">
                <Tag />
                {t("workspace.repositories.releaseNotes")}
              </header>
              {release.body?.trim() ? (
                <div className="harbor-markdown min-h-24 px-4 py-4 text-[12px]">
                  <Suspense fallback={<Skeleton className="h-20 w-full" />}>
                    <GitHubReadme
                      content={release.body}
                      path=""
                      reference={release.tagName}
                      repository={repository}
                      onOpenExternal={(url) => void openExternalUrl(url)}
                    />
                  </Suspense>
                </div>
              ) : (
                <p className="text-muted-foreground px-4 py-6 text-center text-xs">
                  {t("workspace.repositories.noReleaseNotes")}
                </p>
              )}
            </article>

            <section className="mt-4 overflow-hidden rounded-lg border">
              <header className="flex min-h-11 items-center gap-2 border-b px-3 py-2.5">
                <Archive className="text-primary size-4" />
                <h3 className="text-xs font-semibold">
                  {t("workspace.repositories.releaseAssets")}
                </h3>
                <Badge variant="outline">{release.assets.length}</Badge>
                {!release.immutable ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="ml-auto"
                    disabled={assetUpload.isPending || assetDelete.isPending}
                    onClick={() => assetUpload.mutate()}
                  >
                    {assetUpload.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Plus data-icon="inline-start" />
                    )}
                    {t("workspace.repositories.uploadReleaseAsset")}
                  </Button>
                ) : null}
              </header>
              {release.assets.length ? (
                <div className="flex flex-col">
                  {release.assets.map((asset) => (
                    <ReleaseAssetRow
                      key={asset.id}
                      asset={asset}
                      locale={i18n.language}
                      disabled={
                        assetDownload.isPending ||
                        archiveDownload.isPending ||
                        assetUpload.isPending ||
                        assetDelete.isPending ||
                        releaseDelete.isPending
                      }
                      downloading={
                        assetDownload.isPending && assetDownload.variables?.assetId === asset.id
                      }
                      deleting={assetDelete.isPending && assetDelete.variables?.id === asset.id}
                      canDelete={!release.immutable}
                      onDownload={() =>
                        assetDownload.mutate({
                          ...target,
                          assetId: asset.id,
                          assetName: asset.name,
                        })
                      }
                      onDelete={() => setAssetToDelete(asset)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground px-4 py-6 text-center text-xs">
                  {t("workspace.repositories.noReleaseAssets")}
                </p>
              )}
            </section>

            {release.hasZipball || release.hasTarball ? (
              <section className="mt-4 overflow-hidden rounded-lg border">
                <header className="flex min-h-11 items-center gap-2 border-b px-3 py-2.5">
                  <FileArchive className="text-primary size-4" />
                  <h3 className="text-xs font-semibold">
                    {t("workspace.repositories.releaseSourceCode")}
                  </h3>
                </header>
                <div className="flex flex-wrap gap-2 p-3">
                  {release.hasZipball ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={assetDownload.isPending || archiveDownload.isPending}
                      onClick={() => downloadArchive("zip")}
                    >
                      {archiveDownload.isPending &&
                      archiveDownload.variables?.archiveFormat === "zip" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Download data-icon="inline-start" />
                      )}
                      {t("workspace.repositories.releaseSourceZip")}
                    </Button>
                  ) : null}
                  {release.hasTarball ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={assetDownload.isPending || archiveDownload.isPending}
                      onClick={() => downloadArchive("tarGz")}
                    >
                      {archiveDownload.isPending &&
                      archiveDownload.variables?.archiveFormat === "tarGz" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Download data-icon="inline-start" />
                      )}
                      {t("workspace.repositories.releaseSourceTarGz")}
                    </Button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {downloadError ? (
              <Alert variant="destructive" className="mt-4" aria-live="polite">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.releaseDownloadFailed")}</AlertTitle>
                <AlertDescription>
                  {releaseErrorMessage(
                    downloadError.code,
                    downloadError.message,
                    t("workspace.repositories.releasePermissionDenied")
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
            {writeError ? (
              <Alert variant="destructive" className="mt-4" aria-live="polite">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.releaseWriteFailed")}</AlertTitle>
                <AlertDescription>
                  {releaseErrorMessage(
                    writeError.code,
                    writeError.message,
                    t("workspace.repositories.releaseWritePermissionDenied")
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </ScrollArea>
      {release ? (
        <GitHubReleaseEditDialog
          repository={repository}
          release={release}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}
      <AlertDialog
        open={assetToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !assetDelete.isPending) {
            setAssetToDelete(null);
            assetDelete.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.deleteReleaseAssetTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.deleteReleaseAssetDescription", {
                name: assetToDelete?.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {assetDeleteError ? (
            <Alert variant="destructive" aria-live="polite">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.releaseWriteFailed")}</AlertTitle>
              <AlertDescription>
                {releaseErrorMessage(
                  assetDeleteError.code,
                  assetDeleteError.message,
                  t("workspace.repositories.releaseWritePermissionDenied")
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assetDelete.isPending}>
              {t("workspace.repositories.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={assetDelete.isPending || !assetToDelete}
              onClick={(event) => {
                event.preventDefault();
                if (assetToDelete) assetDelete.mutate(assetToDelete);
              }}
            >
              {assetDelete.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t("workspace.repositories.deleteReleaseAsset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={releaseDeleteOpen}
        onOpenChange={(open) => {
          if (!releaseDelete.isPending) {
            setReleaseDeleteOpen(open);
            if (!open) releaseDelete.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.repositories.deleteReleaseTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                release?.draft
                  ? "workspace.repositories.deleteReleaseDraftDescription"
                  : "workspace.repositories.deleteReleaseDescription",
                { tag: release?.tagName }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {releaseDeleteError ? (
            <Alert variant="destructive" aria-live="polite">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.releaseWriteFailed")}</AlertTitle>
              <AlertDescription>
                {releaseErrorMessage(
                  releaseDeleteError.code,
                  releaseDeleteError.message,
                  t("workspace.repositories.releaseWritePermissionDenied")
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releaseDelete.isPending}>
              {t("workspace.repositories.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={releaseDelete.isPending || !release}
              onClick={(event) => {
                event.preventDefault();
                if (release) releaseDelete.mutate();
              }}
            >
              {releaseDelete.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t("workspace.repositories.deleteRelease")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
