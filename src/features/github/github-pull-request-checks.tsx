import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubCheckPage, GitHubRepositoryIdentity } from "./github-data";
import { executionBucket, type GitHubExecutionBucket } from "./github-execution-state";
import { GitHubExecutionStatusIcon } from "./github-execution-status";
import { GitHubPagination } from "./github-issue-shared";
import {
  repositoryCheckSuiteRunsQueryOptions,
  repositoryChecksQueryOptions,
} from "./github-queries";

export function GitHubPullRequestChecks({
  repository,
  reference,
  page,
  onPageChange,
  enabled,
  checkSuiteId,
}: {
  repository: GitHubRepositoryIdentity;
  reference: string;
  page: number;
  onPageChange: (page: number) => void;
  enabled: boolean;
  checkSuiteId?: number;
}) {
  if (checkSuiteId !== undefined) {
    return (
      <GitHubCheckSuiteRuns
        repository={repository}
        checkSuiteId={checkSuiteId}
        page={page}
        onPageChange={onPageChange}
        enabled={enabled}
      />
    );
  }

  return (
    <GitHubReferenceChecks
      repository={repository}
      reference={reference}
      page={page}
      onPageChange={onPageChange}
      enabled={enabled}
    />
  );
}

function GitHubReferenceChecks({
  repository,
  reference,
  page,
  onPageChange,
  enabled,
}: {
  repository: GitHubRepositoryIdentity;
  reference: string;
  page: number;
  onPageChange: (page: number) => void;
  enabled: boolean;
}) {
  const result = useQuery({
    ...repositoryChecksQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      reference,
      page,
    }),
    enabled: enabled && Boolean(reference),
    placeholderData: (previous) => previous,
  });

  return <GitHubChecksResult result={result} onPageChange={onPageChange} />;
}

function GitHubCheckSuiteRuns({
  repository,
  checkSuiteId,
  page,
  onPageChange,
  enabled,
}: {
  repository: GitHubRepositoryIdentity;
  checkSuiteId: number;
  page: number;
  onPageChange: (page: number) => void;
  enabled: boolean;
}) {
  const result = useQuery({
    ...repositoryCheckSuiteRunsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      checkSuiteId,
      page,
    }),
    enabled,
    placeholderData: (previous) => previous,
  });

  return <GitHubChecksResult result={result} onPageChange={onPageChange} />;
}

function GitHubChecksResult({
  result,
  onPageChange,
}: {
  result: UseQueryResult<GitHubCheckPage, Error>;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const data = result.data;
  const error = !data && result.error ? parseIpcError(result.error) : null;
  const counts = useMemo(() => {
    const next: Record<GitHubExecutionBucket, number> = {
      pass: 0,
      fail: 0,
      pending: 0,
      skipped: 0,
    };
    for (const check of data?.checks ?? []) {
      next[executionBucket(check.status, check.conclusion)] += 1;
    }
    return next;
  }, [data]);
  const completed = counts.pass + counts.fail + counts.skipped;
  const progress = data?.checks.length ? (completed / data.checks.length) * 100 : 0;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-5 sm:px-5">
        {result.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.checksLoadFailed")}</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void result.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : data?.checks.length ? (
          <>
            <section className="bg-card/30 flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    {counts.fail
                      ? t("workspace.repositories.checksFailing", { count: counts.fail })
                      : counts.pending
                        ? t("workspace.repositories.checksRunning", { count: counts.pending })
                        : counts.skipped
                          ? t("workspace.repositories.checksComplete")
                          : t("workspace.repositories.checksPassing")}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {t("workspace.repositories.checkSummary", {
                      passed: counts.pass,
                      total: data.totalCount,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-success">
                    {counts.pass} {t("workspace.repositories.checkPassed")}
                  </Badge>
                  {counts.fail ? (
                    <Badge variant="destructive">
                      {counts.fail} {t("workspace.repositories.checkFailed")}
                    </Badge>
                  ) : null}
                  {counts.pending ? (
                    <Badge variant="outline">
                      {counts.pending} {t("workspace.repositories.checkPending")}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <Progress value={progress} aria-label={t("workspace.repositories.checkProgress")} />
            </section>
            <div className="overflow-hidden rounded-lg border">
              {data.checks.map((check) => {
                const bucket = executionBucket(check.status, check.conclusion);
                return (
                  <article
                    key={check.id}
                    className="hover:bg-accent/30 flex min-w-0 items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  >
                    <GitHubExecutionStatusIcon
                      status={check.status}
                      conclusion={check.conclusion}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium">{check.name}</p>
                      <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[10px]">
                        {check.description ?? t(`workspace.repositories.checkBuckets.${bucket}`)}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 rounded-md text-[9px]">
                      {t(`workspace.repositories.checkBuckets.${bucket}`)}
                    </Badge>
                    {check.url ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("workspace.repositories.openCheck")}
                        onClick={() => check.url && void openExternalUrl(check.url)}
                      >
                        <ExternalLink />
                      </Button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.noPullRequestChecks")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.repositories.noPullRequestChecksDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {data ? (
          <GitHubPagination
            page={data.page}
            hasPrevious={data.hasPrevious}
            hasMore={data.hasMore}
            onPageChange={onPageChange}
            ariaLabel={t("workspace.repositories.checkPagination")}
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}
