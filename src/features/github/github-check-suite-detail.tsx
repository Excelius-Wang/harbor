import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitBranch, GitCommitHorizontal, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { parseIpcError } from "@/lib/ipc-error";
import { GitHubWorkflowStatusBadge } from "./github-actions-shared";
import type { GitHubRepository } from "./github-data";
import { GitHubPullRequestChecks } from "./github-pull-request-checks";
import { repositoryCheckSuiteQueryOptions } from "./github-queries";

export function GitHubCheckSuiteDetail({
  repository,
  checkSuiteId,
  backLabel,
  onBack,
}: {
  repository: GitHubRepository;
  checkSuiteId: number;
  backLabel: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const result = useQuery(
    repositoryCheckSuiteQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      checkSuiteId,
    })
  );
  const suite = result.data;
  const error = result.error ? parseIpcError(result.error) : null;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-w-0 items-start gap-3 border-b px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={backLabel}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          {suite ? (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold">
                  {t("workspace.notifications.checkSuiteTitle", {
                    sha: suite.headSha.slice(0, 7),
                  })}
                </h2>
                <GitHubWorkflowStatusBadge
                  status={suite.status}
                  conclusion={suite.conclusion ?? null}
                />
              </div>
              <p className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                {suite.appName ? (
                  <span>{t("workspace.notifications.checkSuiteApp", { app: suite.appName })}</span>
                ) : null}
                {suite.headBranch ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <GitBranch className="size-3" />
                    <span className="max-w-48 truncate">{suite.headBranch}</span>
                  </span>
                ) : null}
                <span className="flex items-center gap-1 font-mono">
                  <GitCommitHorizontal className="size-3" /> {suite.headSha.slice(0, 12)}
                </span>
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
          )}
        </div>
      </header>

      {suite ? (
        <GitHubPullRequestChecks
          repository={repository}
          reference={suite.headSha}
          page={page}
          onPageChange={setPage}
          enabled
          checkSuiteId={checkSuiteId}
        />
      ) : result.isPending ? (
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <Skeleton className="h-24 w-full" />
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.notifications.targetLoadFailed")}</EmptyTitle>
            <EmptyDescription>{error?.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </section>
  );
}
