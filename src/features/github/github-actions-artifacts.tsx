import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, CircleAlert, Download, PackageOpen, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { downloadWorkflowArtifact } from "./github-actions-mutations";
import type { GitHubRepository, GitHubWorkflowArtifact, GitHubWorkflowRun } from "./github-data";
import { formatBytes } from "./github-format";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import { workflowRunArtifactsQueryOptions } from "./github-queries";

function ArtifactListSkeleton() {
  const { t } = useTranslation();

  return (
    <section
      className="overflow-hidden rounded-lg border"
      aria-label={t("workspace.repositories.loadingWorkflowArtifacts")}
      aria-busy="true"
    >
      <header className="flex min-h-11 items-center gap-2 border-b px-3 py-2.5">
        <Archive className="text-primary size-4 shrink-0" />
        <Skeleton className="h-4 w-24" />
      </header>
      <div className="flex flex-col">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex min-w-0 items-center gap-3 border-b px-3 py-3 last:border-b-0"
          >
            <Skeleton className="size-8 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ArtifactRow({
  artifact,
  locale,
  disabled,
  downloading,
  onDownload,
}: {
  artifact: GitHubWorkflowArtifact;
  locale: string;
  disabled: boolean;
  downloading: boolean;
  onDownload: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 border-b px-3 py-3 last:border-b-0">
      <span className="bg-muted/60 text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
        <Archive className="size-4" />
      </span>
      <div className="min-w-48 flex-1">
        <p className="text-foreground/95 text-xs font-medium break-all">{artifact.name}</p>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span>{formatBytes(artifact.sizeInBytes, locale)}</span>
          <span>
            {t("workspace.repositories.workflowArtifactCreated", {
              date: formatIssueDate(artifact.createdAt, locale),
            })}
          </span>
          <span>
            {t("workspace.repositories.workflowArtifactExpires", {
              date: formatIssueDate(artifact.expiresAt, locale),
            })}
          </span>
        </p>
      </div>
      {artifact.expired ? (
        <Badge variant="destructive">{t("workspace.repositories.workflowArtifactExpired")}</Badge>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || artifact.expired}
        title={
          artifact.expired
            ? t("workspace.repositories.workflowArtifactExpiredDescription")
            : undefined
        }
        onClick={onDownload}
      >
        {downloading ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
        {downloading
          ? t("workspace.repositories.downloadingWorkflowArtifact")
          : t("workspace.repositories.downloadWorkflowArtifact")}
      </Button>
    </div>
  );
}

function artifactsErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.workflowPermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.workflowArtifactsLoadFailed";
}

export function GitHubActionsArtifacts({
  repository,
  run,
}: {
  repository: GitHubRepository;
  run: GitHubWorkflowRun;
}) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const result = useQuery({
    ...workflowRunArtifactsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      runId: run.id,
      page,
    }),
    placeholderData: (previous) => previous,
    refetchInterval: run.status === "completed" ? false : 10_000,
  });
  const download = useMutation({
    mutationFn: downloadWorkflowArtifact,
    onSuccess: (saved) => {
      if (saved.saved) {
        toast.success(t("workspace.repositories.workflowArtifactDownloadComplete"), {
          description: saved.path ?? undefined,
        });
      }
    },
  });
  const artifacts = result.data?.artifacts ?? [];
  const listError = !result.data && result.error ? parseIpcError(result.error) : null;
  const listErrorMessage = listError
    ? listError.code === "githubPermission"
      ? t("workspace.repositories.workflowArtifactPermissionDenied")
      : listError.message
    : null;
  const downloadError = download.error ? parseIpcError(download.error) : null;
  const downloadErrorMessage = downloadError
    ? downloadError.code === "githubPermission"
      ? t("workspace.repositories.workflowArtifactPermissionDenied")
      : downloadError.code === "githubArtifactExpired"
        ? t("workspace.repositories.workflowArtifactExpiredDescription")
        : downloadError.message
    : null;

  if (result.isPending) return <ArtifactListSkeleton />;

  if (listError) {
    return (
      <Empty className="min-h-52 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageOpen />
          </EmptyMedia>
          <EmptyTitle>{t(artifactsErrorTitle(listError.code))}</EmptyTitle>
          <EmptyDescription>{listErrorMessage}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => void result.refetch()}>
            <RefreshCw data-icon="inline-start" />
            {t("workspace.repositories.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (!artifacts.length) {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <Empty className="min-h-44 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.noWorkflowArtifacts")}</EmptyTitle>
            <EmptyDescription>
              {t(
                run.status === "completed"
                  ? "workspace.repositories.noWorkflowArtifactsDescription"
                  : "workspace.repositories.pendingWorkflowArtifactsDescription"
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        {result.data ? (
          <GitHubPagination
            page={result.data.page}
            hasPrevious={result.data.hasPrevious}
            hasMore={result.data.hasMore}
            onPageChange={setPage}
            ariaLabel={t("workspace.repositories.workflowArtifactPagination")}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section
        className="overflow-hidden rounded-lg border"
        aria-labelledby="workflow-artifacts-heading"
      >
        <header className="flex min-h-11 min-w-0 items-center gap-2 border-b px-3 py-2.5">
          <Archive className="text-primary size-4 shrink-0" />
          <h4 id="workflow-artifacts-heading" className="text-xs font-semibold">
            {t("workspace.repositories.workflowArtifacts")}
          </h4>
          <Badge variant="outline">{result.data?.totalCount ?? artifacts.length}</Badge>
          {result.isFetching ? (
            <Spinner
              className="text-primary ml-auto"
              aria-label={t("workspace.repositories.refreshingWorkflowArtifacts")}
            />
          ) : null}
        </header>
        <div className="flex flex-col">
          {artifacts.map((artifact) => (
            <ArtifactRow
              key={artifact.id}
              artifact={artifact}
              locale={i18n.language}
              disabled={download.isPending}
              downloading={download.isPending && download.variables?.artifactId === artifact.id}
              onDownload={() =>
                download.mutate({
                  owner: repository.owner,
                  repository: repository.name,
                  runId: run.id,
                  artifactId: artifact.id,
                  artifactName: artifact.name,
                })
              }
            />
          ))}
        </div>
        {downloadError && downloadErrorMessage ? (
          <Alert variant="destructive" className="m-3" aria-live="polite">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.workflowArtifactDownloadFailed")}</AlertTitle>
            <AlertDescription>{downloadErrorMessage}</AlertDescription>
          </Alert>
        ) : null}
      </section>
      {result.data ? (
        <GitHubPagination
          page={result.data.page}
          hasPrevious={result.data.hasPrevious}
          hasMore={result.data.hasMore}
          onPageChange={(nextPage) => {
            download.reset();
            setPage(nextPage);
          }}
          ariaLabel={t("workspace.repositories.workflowArtifactPagination")}
        />
      ) : null}
    </div>
  );
}
