import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssueSummary, GitHubRepositoryContentContext } from "./github-data";
import { GitHubIssueAddSubIssueAction } from "./github-issue-relationship-actions";
import type { GitHubIssueRelationshipMutationTarget } from "./github-issue-relationship-mutations";
import { issueRelationshipsQueryOptions } from "./github-issue-relationship-queries";
import {
  GitHubIssueRelatedIssueRow,
  GitHubIssueRelationLoadError,
} from "./github-issue-relation-ui";
import { GitHubPagination } from "./github-issue-shared";

function RelationshipsSkeleton() {
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

function GitHubIssueRelationshipsContent({
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
    issueRelationshipsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      issueNumber,
      page,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;
  const mutationTarget: GitHubIssueRelationshipMutationTarget = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber,
  };

  if (result.isPending) return <RelationshipsSkeleton />;

  if (!result.data)
    return (
      <GitHubIssueRelationLoadError
        title={t(
          error?.code === "githubPermission"
            ? "workspace.repositories.issueRelationshipsPermissionDenied"
            : "workspace.repositories.issueRelationshipsLoadFailed"
        )}
        error={error}
        onRetry={() => void result.refetch()}
      />
    );

  const { parent, subIssues, hasPrevious, hasMore } = result.data;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none" aria-busy={result.isFetching}>
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xs">
            <GitBranch className="text-muted-foreground size-3.5" />
            {t("workspace.repositories.issueRelationships")}
            {result.isFetching ? (
              <RefreshCw className="text-muted-foreground size-3 animate-spin" />
            ) : null}
          </CardTitle>
          <GitHubIssueAddSubIssueAction target={mutationTarget} />
        </div>
      </CardHeader>
      <CardContent className="px-0 py-1">
        {error ? (
          <div className="px-3 pt-2">
            <GitHubIssueRelationLoadError
              title={t(
                error.code === "githubPermission"
                  ? "workspace.repositories.issueRelationshipsPermissionDenied"
                  : "workspace.repositories.issueRelationshipsLoadFailed"
              )}
              error={error}
              onRetry={() => void result.refetch()}
            />
          </div>
        ) : null}
        {!parent && subIssues.length === 0 ? (
          <Empty className="min-h-0 gap-2 px-4 py-5 md:p-5">
            <EmptyHeader className="gap-1">
              <EmptyTitle className="text-xs">
                {t("workspace.repositories.noIssueRelationships")}
              </EmptyTitle>
              <EmptyDescription className="text-[11px]">
                {t("workspace.repositories.noIssueRelationshipsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {parent ? (
          <section className="border-b px-1.5 py-1.5">
            <h3 className="text-muted-foreground px-2.5 pb-1 text-[10px] font-medium uppercase">
              {t("workspace.repositories.parentIssue")}
            </h3>
            <GitHubIssueRelatedIssueRow summary={parent} onNavigate={onNavigate} />
          </section>
        ) : null}
        {subIssues.length > 0 ? (
          <section className="px-1.5 py-1.5">
            <h3 className="text-muted-foreground px-2.5 pb-1 text-[10px] font-medium uppercase">
              {t("workspace.repositories.subIssues")}
            </h3>
            <div className="flex flex-col gap-0.5">
              {subIssues.map((summary) => (
                <GitHubIssueRelatedIssueRow
                  key={`${summary.repository.fullName}#${summary.issue.number}`}
                  summary={summary}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
      <GitHubPagination
        page={result.data.page}
        hasPrevious={hasPrevious}
        hasMore={hasMore}
        onPageChange={setPage}
        ariaLabel={t("workspace.repositories.issueRelationshipPagination")}
      />
    </Card>
  );
}

export function GitHubIssueRelationships(props: {
  repository: GitHubRepositoryContentContext;
  issueNumber: number;
  onNavigate: (summary: GitHubIssueSummary) => void;
}) {
  const { repository, issueNumber } = props;
  const targetKey = `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}#${issueNumber}`;
  return <GitHubIssueRelationshipsContent key={targetKey} {...props} />;
}
