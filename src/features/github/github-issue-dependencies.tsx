import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitFork, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssueSummary, GitHubRepositoryContentContext } from "./github-data";
import { issueDependenciesQueryOptions } from "./github-issue-dependency-queries";
import {
  GitHubIssueAddDependencyAction,
  GitHubIssueRemoveDependencyAction,
} from "./github-issue-dependency-actions";
import type { GitHubIssueDependencyMutationTarget } from "./github-issue-dependency-mutations";
import {
  GitHubIssueRelatedIssueRow,
  GitHubIssueRelationLoadError,
} from "./github-issue-relation-ui";
import { GitHubPagination } from "./github-issue-shared";

function DependenciesSkeleton() {
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

function DependencySection({
  title,
  dependencies,
  onNavigate,
  removeTarget,
}: {
  title: string;
  dependencies: GitHubIssueSummary[];
  onNavigate: (summary: GitHubIssueSummary) => void;
  removeTarget?: GitHubIssueDependencyMutationTarget;
}) {
  if (dependencies.length === 0) return null;

  return (
    <section className="px-1.5 py-1.5">
      <h3 className="text-muted-foreground px-2.5 pb-1 text-[10px] font-medium uppercase">
        {title}
      </h3>
      <div className="flex flex-col gap-0.5">
        {dependencies.map((summary) => (
          <div
            key={`${summary.repository.fullName}#${summary.issue.number}`}
            className="flex items-center gap-1"
          >
            <GitHubIssueRelatedIssueRow summary={summary} onNavigate={onNavigate} />
            {removeTarget ? (
              <GitHubIssueRemoveDependencyAction target={removeTarget} dependency={summary} />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function GitHubIssueDependenciesContent({
  repository,
  issueNumber,
  onNavigate,
}: {
  repository: GitHubRepositoryContentContext;
  issueNumber: number;
  onNavigate: (summary: GitHubIssueSummary) => void;
}) {
  const { t } = useAppTranslation();
  const [page, setPage] = useState(1);
  const result = useQuery(
    issueDependenciesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      issueNumber,
      page,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;
  const mutationTarget = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber,
  };

  if (result.isPending) return <DependenciesSkeleton />;

  if (!result.data)
    return (
      <GitHubIssueRelationLoadError
        title={t(
          error?.code === "githubPermission"
            ? "workspace.repositories.issueDependenciesPermissionDenied"
            : "workspace.repositories.issueDependenciesLoadFailed"
        )}
        error={error}
        onRetry={() => void result.refetch()}
      />
    );

  const { blockedBy, blocking, hasPrevious, hasMore } = result.data;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none" aria-busy={result.isFetching}>
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xs">
            <GitFork className="text-muted-foreground size-3.5" />
            {t("workspace.repositories.issueDependencies")}
            {result.isFetching ? (
              <RefreshCw className="text-muted-foreground size-3 animate-spin" />
            ) : null}
          </CardTitle>
          <GitHubIssueAddDependencyAction target={mutationTarget} />
        </div>
      </CardHeader>
      <CardContent className="px-0 py-1">
        {error ? (
          <div className="px-3 pt-2">
            <GitHubIssueRelationLoadError
              title={t(
                error.code === "githubPermission"
                  ? "workspace.repositories.issueDependenciesPermissionDenied"
                  : "workspace.repositories.issueDependenciesLoadFailed"
              )}
              error={error}
              onRetry={() => void result.refetch()}
            />
          </div>
        ) : null}
        {blockedBy.length === 0 && blocking.length === 0 ? (
          <Empty className="min-h-0 gap-2 px-4 py-5 md:p-5">
            <EmptyHeader className="gap-1">
              <EmptyTitle className="text-xs">
                {t("workspace.repositories.noIssueDependencies")}
              </EmptyTitle>
              <EmptyDescription className="text-[11px]">
                {t("workspace.repositories.noIssueDependenciesDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        <DependencySection
          title={t("workspace.repositories.blockedByIssues")}
          dependencies={blockedBy}
          onNavigate={onNavigate}
          removeTarget={mutationTarget}
        />
        <DependencySection
          title={t("workspace.repositories.blockingIssues")}
          dependencies={blocking}
          onNavigate={onNavigate}
        />
      </CardContent>
      <GitHubPagination
        page={result.data.page}
        hasPrevious={hasPrevious}
        hasMore={hasMore}
        onPageChange={setPage}
        ariaLabel={t("workspace.repositories.issueDependencyPagination")}
      />
    </Card>
  );
}

export function GitHubIssueDependencies(props: {
  repository: GitHubRepositoryContentContext;
  issueNumber: number;
  onNavigate: (summary: GitHubIssueSummary) => void;
}) {
  const { repository, issueNumber } = props;
  const targetKey = `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}#${issueNumber}`;
  return <GitHubIssueDependenciesContent key={targetKey} {...props} />;
}
