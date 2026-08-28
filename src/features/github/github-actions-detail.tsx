import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  PlayCircle,
  RefreshCw,
  TerminalSquare,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import {
  GitHubWorkflowJobRerunButton,
  useGitHubWorkflowJobRerun,
} from "./github-actions-job-actions";
import { GitHubActionsArtifacts } from "./github-actions-artifacts";
import { GitHubWorkflowRunActions } from "./github-actions-run-actions";
import {
  GitHubWorkflowStatusBadge,
  workflowDuration,
  workflowJobHasLog,
} from "./github-actions-shared";
import type { GitHubRepository, GitHubWorkflowJob, GitHubWorkflowRun } from "./github-data";
import { GitHubExecutionStatusIcon } from "./github-execution-status";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import { workflowJobLogQueryOptions, workflowRunJobsQueryOptions } from "./github-queries";

function WorkflowJob({
  run,
  job,
  selected,
  onSelectLog,
  rerunDisabled,
  rerunning,
  onRerun,
}: {
  run: GitHubWorkflowRun;
  job: GitHubWorkflowJob;
  selected: boolean;
  onSelectLog: () => void;
  rerunDisabled: boolean;
  rerunning: boolean;
  onRerun: () => void;
}) {
  const { t } = useTranslation();
  const duration = workflowDuration(job.startedAt, job.completedAt);
  const logAvailable = workflowJobHasLog(job);

  return (
    <Collapsible
      defaultOpen={job.conclusion === "failure" || job.conclusion === "timed_out"}
      className="group/job border-b last:border-b-0"
    >
      <div className="flex min-w-0 items-center gap-1 px-2 py-1.5">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-2 text-left"
          >
            <GitHubExecutionStatusIcon status={job.status} conclusion={job.conclusion} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{job.name}</span>
              <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-normal">
                {duration ? <span>{duration}</span> : null}
                {job.runnerName ? <span>{job.runnerName}</span> : null}
                {job.labels.slice(0, 3).map((label) => (
                  <Badge key={label} variant="outline" className="h-5 rounded-md font-normal">
                    {label}
                  </Badge>
                ))}
              </span>
            </span>
            <ChevronDown className="transition-transform group-data-[state=open]/job:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <Button
          type="button"
          variant={selected ? "secondary" : "ghost"}
          size="xs"
          disabled={!logAvailable}
          title={!logAvailable ? t("workspace.repositories.workflowLogUnavailable") : undefined}
          onClick={onSelectLog}
        >
          <FileText data-icon="inline-start" />
          {t("workspace.repositories.viewWorkflowLog")}
        </Button>
        <GitHubWorkflowJobRerunButton
          run={run}
          job={job}
          disabled={rerunDisabled}
          pending={rerunning}
          onRerun={onRerun}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("workspace.repositories.openWorkflowJob")}
          onClick={() => void openExternalUrl(job.url)}
        >
          <ExternalLink />
        </Button>
      </div>
      <CollapsibleContent className="bg-muted/15 border-t px-4 py-3">
        {job.steps.length ? (
          <div className="border-border/70 relative ml-3 flex flex-col border-l">
            {job.steps.map((step) => {
              const stepDuration = workflowDuration(step.startedAt, step.completedAt);
              return (
                <div
                  key={`${step.number}:${step.name}`}
                  className="relative flex min-w-0 items-center gap-3 py-2 pl-6"
                >
                  <span className="bg-background absolute -left-2.5 grid size-5 place-items-center rounded-full">
                    <GitHubExecutionStatusIcon status={step.status} conclusion={step.conclusion} />
                  </span>
                  <span className="text-muted-foreground w-5 shrink-0 text-right font-mono text-[9px] tabular-nums">
                    {step.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px]">{step.name}</span>
                  {stepDuration ? (
                    <span className="text-muted-foreground shrink-0 text-[9px] tabular-nums">
                      {stepDuration}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground py-2 text-center text-[11px]">
            {t("workspace.repositories.noWorkflowSteps")}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GitHubActionsDetail({
  repository,
  run,
  backLabel,
  onBack,
}: {
  repository: GitHubRepository;
  run: GitHubWorkflowRun;
  backLabel?: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [jobsPage, setJobsPage] = useState(1);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const jobRerun = useGitHubWorkflowJobRerun({
    repository,
    runId: run.id,
    onAccepted: () => setSelectedJobId(null),
  });
  const jobsResult = useQuery({
    ...workflowRunJobsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      runId: run.id,
      page: jobsPage,
    }),
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      query.state.data?.jobs.some((job) => job.status !== "completed") ? 10_000 : false,
  });
  const logResult = useQuery({
    ...workflowJobLogQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      jobId: selectedJobId ?? 0,
    }),
    enabled: selectedJobId !== null,
  });
  const jobs = jobsResult.data?.jobs ?? [];
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const progress = jobs.length ? (completedJobs / jobs.length) * 100 : 0;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const jobsError = !jobsResult.data && jobsResult.error ? parseIpcError(jobsResult.error) : null;
  const logError =
    selectedJobId !== null && logResult.error ? parseIpcError(logResult.error) : null;
  const runDuration = workflowDuration(run.startedAt ?? run.createdAt, run.updatedAt);

  return (
    <div className="@container/actions-detail flex min-h-0 min-w-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 min-w-0 flex-1" constrainContentWidth>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-5 sm:px-5">
          <header className="flex min-w-0 flex-wrap items-start gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={backLabel ?? t("workspace.repositories.backToWorkflowRuns")}
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="text-foreground/95 min-w-0 text-sm font-semibold">{run.title}</h3>
                <GitHubWorkflowStatusBadge status={run.status} conclusion={run.conclusion} />
              </div>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                <span>
                  {run.workflowName} #{run.runNumber}
                  {run.runAttempt > 1
                    ? ` · ${t("workspace.repositories.workflowAttempt", { count: run.runAttempt })}`
                    : ""}
                </span>
                <span>{run.event}</span>
                {run.headBranch ? (
                  <span className="flex items-center gap-1">
                    <GitBranch className="size-3" /> {run.headBranch}
                  </span>
                ) : null}
                <span className="flex items-center gap-1 font-mono">
                  <GitCommitHorizontal className="size-3" /> {run.headSha.slice(0, 7)}
                </span>
                {runDuration ? <span>{runDuration}</span> : null}
                <span>{formatIssueDate(run.createdAt, i18n.language)}</span>
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <GitHubWorkflowRunActions
                repository={repository}
                run={run}
                onAccepted={() => setSelectedJobId(null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openExternalUrl(run.url)}
              >
                <ExternalLink data-icon="inline-end" />
                {t("workspace.openOnGitHub")}
              </Button>
            </div>
          </header>

          {jobsResult.data?.jobs.length ? (
            <section className="bg-card/30 flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold">
                    {t("workspace.repositories.workflowJobProgress", {
                      completed: completedJobs,
                      total: jobs.length,
                    })}
                  </h4>
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    {t("workspace.repositories.workflowJobsRefreshAutomatically")}
                  </p>
                </div>
                {jobsResult.isFetching ? (
                  <RefreshCw className="text-primary size-4 animate-spin" />
                ) : null}
              </div>
              <Progress
                value={progress}
                aria-label={t("workspace.repositories.workflowJobCompletion")}
              />
            </section>
          ) : null}

          {jobsResult.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : jobsError ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlayCircle />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.repositories.workflowJobsLoadFailed")}</EmptyTitle>
                <EmptyDescription>{jobsError.message}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void jobsResult.refetch()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : jobs.length ? (
            <section className="overflow-hidden rounded-lg border">
              {jobs.map((job) => (
                <WorkflowJob
                  key={job.id}
                  run={run}
                  job={job}
                  selected={selectedJobId === job.id}
                  onSelectLog={() => setSelectedJobId(job.id)}
                  rerunDisabled={jobRerun.isPending}
                  rerunning={jobRerun.pendingJobId === job.id}
                  onRerun={() => jobRerun.rerun(job)}
                />
              ))}
            </section>
          ) : (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlayCircle />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.repositories.noWorkflowJobs")}</EmptyTitle>
                <EmptyDescription>
                  {t("workspace.repositories.noWorkflowJobsDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {jobsResult.data ? (
            <GitHubPagination
              page={jobsResult.data.page}
              hasPrevious={jobsResult.data.hasPrevious}
              hasMore={jobsResult.data.hasMore}
              onPageChange={(nextPage) => {
                setJobsPage(nextPage);
                setSelectedJobId(null);
              }}
              ariaLabel={t("workspace.repositories.workflowJobPagination")}
            />
          ) : null}

          {selectedJob ? (
            <section className="overflow-hidden rounded-lg border">
              <header className="flex min-w-0 items-center gap-3 border-b px-3 py-2.5">
                <TerminalSquare className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-semibold">{selectedJob.name}</h4>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    {t("workspace.repositories.workflowJobLog")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("workspace.repositories.closeWorkflowLog")}
                  onClick={() => setSelectedJobId(null)}
                >
                  <X />
                </Button>
              </header>
              {logResult.isPending ? (
                <div className="flex flex-col gap-2 p-4">
                  {Array.from({ length: 12 }, (_, index) => (
                    <Skeleton key={index} className="h-3 w-full" />
                  ))}
                </div>
              ) : logError ? (
                <Alert variant="destructive" className="m-3">
                  <FileText />
                  <AlertTitle>{t("workspace.repositories.workflowLogLoadFailed")}</AlertTitle>
                  <AlertDescription className="flex min-w-0 items-center gap-3">
                    <span className="min-w-0 flex-1">{logError.message}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => void logResult.refetch()}
                    >
                      {t("workspace.repositories.retry")}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : logResult.data ? (
                <>
                  {logResult.data.truncated ? (
                    <Alert className="m-3">
                      <FileText />
                      <AlertTitle>{t("workspace.repositories.workflowLogTruncated")}</AlertTitle>
                      <AlertDescription>
                        {t("workspace.repositories.workflowLogTruncatedDescription")}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <pre className="bg-background/55 max-h-[440px] overflow-auto p-4 font-mono text-[10px] leading-5 whitespace-pre">
                    {logResult.data.content || t("workspace.repositories.emptyWorkflowLog")}
                  </pre>
                </>
              ) : null}
            </section>
          ) : null}

          <GitHubActionsArtifacts repository={repository} run={run} />
        </div>
      </ScrollArea>
    </div>
  );
}
