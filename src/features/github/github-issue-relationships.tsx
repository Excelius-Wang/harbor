import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleDot, GitBranch, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssueSummary, GitHubRepositoryContentContext } from "./github-data";
import { issueRelationshipsQueryOptions } from "./github-issue-relationship-queries";
import { GitHubPagination } from "./github-issue-shared";

function RelationshipRow({
  summary,
  onNavigate,
}: {
  summary: GitHubIssueSummary;
  onNavigate: (summary: GitHubIssueSummary) => void;
}) {
  const StateIcon = summary.issue.state === "open" ? CircleDot : CheckCircle2;
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full min-w-0 justify-start gap-2 rounded-md px-2.5 py-2 text-left"
      onClick={() => onNavigate(summary)}
    >
      <StateIcon data-icon="inline-start" className="text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{summary.issue.title}</span>
        <span className="text-muted-foreground block truncate text-[10px] font-normal">
          {summary.repository.fullName} #{summary.issue.number}
        </span>
      </span>
    </Button>
  );
}

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
  const error = !result.data && result.error ? parseIpcError(result.error) : null;

  if (result.isPending) return <RelationshipsSkeleton />;

  if (error || !result.data) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>
          {t(
            error?.code === "githubPermission"
              ? "workspace.repositories.issueRelationshipsPermissionDenied"
              : "workspace.repositories.issueRelationshipsLoadFailed"
          )}
        </AlertTitle>
        <AlertDescription>
          <span>{error?.message}</span>
          <Button type="button" variant="outline" size="xs" onClick={() => void result.refetch()}>
            <RefreshCw data-icon="inline-start" />
            {t("workspace.repositories.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const { parent, subIssues, hasPrevious, hasMore } = result.data;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none" aria-busy={result.isFetching}>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-xs">
          <GitBranch className="text-muted-foreground size-3.5" />
          {t("workspace.repositories.issueRelationships")}
          {result.isFetching ? (
            <RefreshCw className="text-muted-foreground size-3 animate-spin" />
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-1">
        {!parent && subIssues.length === 0 ? (
          <div className="px-4 py-4">
            <p className="text-xs font-medium">
              {t("workspace.repositories.noIssueRelationships")}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {t("workspace.repositories.noIssueRelationshipsDescription")}
            </p>
          </div>
        ) : null}
        {parent ? (
          <section className="border-b px-1.5 py-1.5">
            <h3 className="text-muted-foreground px-2.5 pb-1 text-[10px] font-medium uppercase">
              {t("workspace.repositories.parentIssue")}
            </h3>
            <RelationshipRow summary={parent} onNavigate={onNavigate} />
          </section>
        ) : null}
        {subIssues.length > 0 ? (
          <section className="px-1.5 py-1.5">
            <h3 className="text-muted-foreground px-2.5 pb-1 text-[10px] font-medium uppercase">
              {t("workspace.repositories.subIssues")}
            </h3>
            <div className="flex flex-col gap-0.5">
              {subIssues.map((summary) => (
                <RelationshipRow
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
