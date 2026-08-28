import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  FilterX,
  GitBranch,
  GitCommitHorizontal,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { GitHubActionsDetail } from "./github-actions-detail";
import { GitHubWorkflowDispatchDialog } from "./github-actions-dispatch-dialog";
import { GitHubActionsRunFilters } from "./github-actions-filters";
import { GitHubWorkflowStatusBadge, workflowDuration } from "./github-actions-shared";
import { GitHubActionsWorkflowNavigation } from "./github-actions-workflow-navigation";
import type {
  GitHubRepository,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubWorkflowRunFilters,
} from "./github-data";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import { repositoryWorkflowRunsQueryOptions, workflowRunJobsQueryOptions } from "./github-queries";

const DEFAULT_WORKFLOW_RUN_FILTERS: GitHubWorkflowRunFilters = {
  status: "all",
  branch: "",
  event: "",
  actor: "",
};

function WorkflowRunSkeletons() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-start gap-3 border-b px-4 py-4">
          <Skeleton className="h-6 w-20 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowRunRow({
  run,
  locale,
  onSelect,
  onPrefetch,
}: {
  run: GitHubWorkflowRun;
  locale: string;
  onSelect: () => void;
  onPrefetch: () => void;
}) {
  const { t } = useTranslation();
  const duration = workflowDuration(run.startedAt ?? run.createdAt, run.updatedAt);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      className="hover:bg-accent/40 h-auto w-full items-start gap-3 rounded-none border-b px-4 py-3.5 text-left whitespace-normal"
    >
      <GitHubWorkflowStatusBadge status={run.status} conclusion={run.conclusion} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-foreground/95 min-w-0 text-[13px] leading-5 font-medium">
            {run.title}
          </span>
          <Badge variant="outline" className="h-5 rounded-md font-normal">
            {run.event}
          </Badge>
        </span>
        <span className="text-muted-foreground mt-1 block truncate text-[10px] font-normal">
          {run.workflowName} #{run.runNumber}
          {run.runAttempt > 1
            ? ` · ${t("workspace.repositories.workflowAttempt", { count: run.runAttempt })}`
            : ""}
        </span>
        <span className="text-muted-foreground mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-normal">
          {run.headBranch ? (
            <span className="flex min-w-0 items-center gap-1">
              <GitBranch /> <span className="max-w-48 truncate">{run.headBranch}</span>
            </span>
          ) : null}
          <span className="flex items-center gap-1 font-mono">
            <GitCommitHorizontal /> {run.headSha.slice(0, 7)}
          </span>
          {run.actor ? <span>@{run.actor}</span> : null}
          {duration ? <span>{duration}</span> : null}
          <span>{formatIssueDate(run.createdAt, locale)}</span>
        </span>
      </span>
      <ChevronRight className="text-muted-foreground mt-1 shrink-0" />
    </Button>
  );
}

function workflowRunsErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.workflowPermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.workflowRunsLoadFailed";
}

export function GitHubActionsView({ repository }: { repository: GitHubRepository }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [workflow, setWorkflow] = useState<GitHubWorkflow | null>(null);
  const [filters, setFilters] = useState<GitHubWorkflowRunFilters>(DEFAULT_WORKFLOW_RUN_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState<GitHubWorkflowRun | null>(null);
  const workflowId = workflow?.id ?? null;
  const result = useQuery({
    ...repositoryWorkflowRunsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      workflowId,
      ...filters,
      page,
    }),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === repository.owner &&
      previousQuery.queryKey[3] === repository.name &&
      previousQuery.queryKey[5] === (workflowId ?? "all") &&
      previousQuery.queryKey[6] === filters.status &&
      previousQuery.queryKey[7] === filters.branch &&
      previousQuery.queryKey[8] === filters.event &&
      previousQuery.queryKey[9] === filters.actor
        ? previous
        : undefined,
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => run.status !== "completed") ? 15_000 : false,
  });
  const data = result.data;
  const error = !data && result.error ? parseIpcError(result.error) : null;
  const selectedRunId = selectedRun?.id ?? null;
  const hasActiveFilters =
    filters.status !== "all" || Boolean(filters.branch || filters.event || filters.actor);

  function changeFilters(nextFilters: GitHubWorkflowRunFilters) {
    setFilters(nextFilters);
    setPage(1);
    setSelectedRun(null);
  }

  function clearFilters() {
    changeFilters(DEFAULT_WORKFLOW_RUN_FILTERS);
  }

  useEffect(() => {
    setWorkflow(null);
    setFilters(DEFAULT_WORKFLOW_RUN_FILTERS);
    setPage(1);
    setSelectedRun(null);
  }, [repository.id]);

  useEffect(() => {
    if (!selectedRunId || !data) return;
    const updatedRun = data.runs.find((run) => run.id === selectedRunId);
    if (!updatedRun) return;
    setSelectedRun((current) => (current?.id === updatedRun.id ? updatedRun : current));
  }, [data, selectedRunId]);

  if (selectedRun) {
    return (
      <GitHubActionsDetail
        repository={repository}
        run={selectedRun}
        onBack={() => setSelectedRun(null)}
      />
    );
  }

  return (
    <div className="@container/actions flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-4 py-3 @max-[900px]/actions:grid-cols-1">
        <GitHubActionsRunFilters
          repository={repository}
          workflowId={workflowId}
          value={filters}
          onValueChange={changeFilters}
        />
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 @max-[900px]/actions:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX data-icon="inline-start" />
                {t("workspace.repositories.clearWorkflowRunFilters")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("workspace.repositories.refreshWorkflowRuns")}
              onClick={() => void result.refetch()}
              disabled={result.isFetching}
            >
              <RefreshCw className={cn(result.isFetching && "animate-spin")} />
            </Button>
          </div>
          <span className="text-muted-foreground text-[10px]">
            {data
              ? t("workspace.repositories.workflowRunCount", {
                  count: data.totalCount,
                })
              : null}
          </span>
          <GitHubWorkflowDispatchDialog
            repository={repository}
            initialWorkflowId={workflow?.state === "active" ? workflow.id : null}
            disabled={workflow !== null && workflow.state !== "active"}
            onAccepted={() => void result.refetch()}
          />
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] @max-[760px]/actions:grid-cols-1 @max-[760px]/actions:grid-rows-[auto_minmax(0,1fr)]">
        <GitHubActionsWorkflowNavigation
          repository={repository}
          selectedWorkflowId={workflowId}
          onSelect={(nextWorkflow) => {
            setWorkflow(nextWorkflow);
            setPage(1);
          }}
        />

        <section className="flex min-h-0 min-w-0 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            {result.isPending ? (
              <WorkflowRunSkeletons />
            ) : error ? (
              <Empty className="min-h-80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PlayCircle />
                  </EmptyMedia>
                  <EmptyTitle>{t(workflowRunsErrorTitle(error.code))}</EmptyTitle>
                  <EmptyDescription>{error.message}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" onClick={() => void result.refetch()}>
                    <RefreshCw data-icon="inline-start" />
                    {t("workspace.repositories.retry")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : data?.runs.length ? (
              <div className={cn("transition-opacity", result.isFetching && "opacity-60")}>
                {data.runs.map((run) => {
                  const jobsOptions = workflowRunJobsQueryOptions({
                    owner: repository.owner,
                    repository: repository.name,
                    runId: run.id,
                    page: 1,
                  });
                  return (
                    <WorkflowRunRow
                      key={run.id}
                      run={run}
                      locale={i18n.language}
                      onSelect={() => setSelectedRun(run)}
                      onPrefetch={() => void queryClient.prefetchQuery(jobsOptions)}
                    />
                  );
                })}
              </div>
            ) : (
              <Empty className="min-h-80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PlayCircle />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.repositories.noWorkflowRuns")}</EmptyTitle>
                  <EmptyDescription>
                    {t(
                      hasActiveFilters
                        ? "workspace.repositories.noFilteredWorkflowRunsDescription"
                        : workflowId === null
                          ? "workspace.repositories.noWorkflowRunsDescription"
                          : "workspace.repositories.noSelectedWorkflowRunsDescription"
                    )}
                  </EmptyDescription>
                </EmptyHeader>
                {hasActiveFilters ? (
                  <EmptyContent>
                    <Button variant="outline" onClick={clearFilters}>
                      <FilterX data-icon="inline-start" />
                      {t("workspace.repositories.clearWorkflowRunFilters")}
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            )}
          </ScrollArea>

          {data ? (
            <GitHubPagination
              page={data.page}
              hasPrevious={data.hasPrevious}
              hasMore={data.hasMore}
              onPageChange={setPage}
              ariaLabel={t("workspace.repositories.workflowRunPagination")}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
