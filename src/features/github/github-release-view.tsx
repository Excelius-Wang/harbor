import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { CircleAlert, LockKeyhole, PackageOpen, Plus, RefreshCw, Rocket, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import type { GitHubRelease, GitHubRepositoryContentContext } from "./github-data";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import { GitHubReleaseCreate } from "./github-release-create";
import { GitHubReleaseDetail } from "./github-release-detail";
import { primeRepositoryRelease } from "./github-release-mutations";
import { repositoryReleasesQueryOptions } from "./github-queries";

function ReleaseListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b px-4 py-4">
          <Skeleton className="size-9 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReleaseRow({
  release,
  locale,
  onOpen,
  onPrefetch,
}: {
  release: GitHubRelease;
  locale: string;
  onOpen: () => void;
  onPrefetch: () => void;
}) {
  const { t } = useTranslation();
  const releaseDate = release.publishedAt ?? release.createdAt;

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-start gap-3 rounded-none border-b px-4 py-4 text-left whitespace-normal last:border-b-0"
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onClick={onOpen}
    >
      <span className="bg-muted/50 text-primary grid size-9 shrink-0 place-items-center rounded-md border">
        <Rocket className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="text-foreground line-clamp-2 text-[13px] leading-5 font-medium">
          {release.name?.trim() || release.tagName}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline">
            <Tag /> {release.tagName}
          </Badge>
          {release.draft ? (
            <Badge variant="destructive">{t("workspace.repositories.releaseDraft")}</Badge>
          ) : release.prerelease ? (
            <Badge variant="secondary">{t("workspace.repositories.releasePrerelease")}</Badge>
          ) : null}
          {release.immutable ? (
            <Badge variant="outline">
              <LockKeyhole /> {t("workspace.repositories.releaseImmutable")}
            </Badge>
          ) : null}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-normal">
          <span>
            {release.author ? `@${release.author}` : t("workspace.repositories.unknownActor")}
          </span>
          <time dateTime={releaseDate}>{formatIssueDate(releaseDate, locale)}</time>
          <span>
            {t("workspace.repositories.releaseAssetCount", {
              count: release.assets.length,
            })}
          </span>
        </span>
      </span>
    </Button>
  );
}

export function GitHubReleaseView({ repository }: { repository: GitHubRepositoryContentContext }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const desktopRuntime = isTauri();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    page,
  };
  const result = useQuery({
    ...repositoryReleasesQueryOptions(target),
    enabled: desktopRuntime,
    placeholderData: (previous) => previous,
  });
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.repositories.desktopOnly") }
    : !result.data && result.error
      ? parseIpcError(result.error)
      : null;
  const supplementalError = result.data && result.error ? parseIpcError(result.error) : null;

  if (creating) {
    return (
      <GitHubReleaseCreate
        repository={repository}
        onCancel={() => setCreating(false)}
        onCreated={(release) => {
          setCreating(false);
          setSelectedReleaseId(release.id);
        }}
      />
    );
  }

  if (selectedReleaseId !== null) {
    return (
      <GitHubReleaseDetail
        repository={repository}
        releaseId={selectedReleaseId}
        onBack={() => setSelectedReleaseId(null)}
        onDeleted={() => setSelectedReleaseId(null)}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{t("workspace.repositories.releases")}</h3>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            {t("workspace.repositories.releasesDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!desktopRuntime}
            onClick={() => setCreating(true)}
          >
            <Plus data-icon="inline-start" />
            {t("workspace.repositories.newRelease")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={result.isFetching || !desktopRuntime}
            onClick={() => void result.refetch()}
          >
            {result.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {t("workspace.repositories.refresh")}
          </Button>
        </div>
      </header>
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
        {result.isPending && desktopRuntime ? (
          <ReleaseListSkeleton />
        ) : error ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageOpen />
              </EmptyMedia>
              <EmptyTitle>
                {t(
                  error.code === "desktopOnly"
                    ? "workspace.repositories.desktopOnlyTitle"
                    : "workspace.repositories.releasesLoadFailed"
                )}
              </EmptyTitle>
              <EmptyDescription>
                {error.code === "githubPermission"
                  ? t("workspace.repositories.releasePermissionDenied")
                  : error.message}
              </EmptyDescription>
            </EmptyHeader>
            {desktopRuntime ? (
              <EmptyContent>
                <Button variant="outline" onClick={() => void result.refetch()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : !result.data?.releases.length ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Rocket />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.noReleases")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.repositories.noReleasesDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mx-auto w-full max-w-[960px] py-2">
            <div className="overflow-hidden border-y sm:rounded-lg sm:border">
              {result.data.releases.map((release) => {
                const detailTarget = {
                  owner: repository.owner,
                  repository: repository.name,
                  releaseId: release.id,
                };
                const prefetch = () => primeRepositoryRelease(queryClient, detailTarget, release);
                return (
                  <ReleaseRow
                    key={release.id}
                    release={release}
                    locale={i18n.language}
                    onPrefetch={prefetch}
                    onOpen={() => {
                      primeRepositoryRelease(queryClient, detailTarget, release);
                      setSelectedReleaseId(release.id);
                    }}
                  />
                );
              })}
            </div>
            <div className="px-3 py-4">
              <GitHubPagination
                page={result.data.page}
                hasPrevious={result.data.hasPrevious}
                hasMore={result.data.hasMore}
                onPageChange={setPage}
                ariaLabel={t("workspace.repositories.releasePagination")}
              />
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
