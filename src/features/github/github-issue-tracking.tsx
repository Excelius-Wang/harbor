import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDot, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubIssue,
  GitHubIssueTrackingDirection,
  GitHubIssueTrackingReference,
  GitHubRepositoryContentContext,
} from "./github-data";
import { issueTrackingQueryOptions } from "./github-issue-tracking-queries";
import { GitHubIssueRelationLoadError } from "./github-issue-relation-ui";
import { GitHubPagination } from "./github-issue-shared";

function TrackingIssueRow({
  issue,
  onNavigate,
}: {
  issue: GitHubIssueTrackingReference;
  onNavigate: (issue: GitHubIssueTrackingReference) => void;
}) {
  const StateIcon = issue.state === "open" ? CircleDot : CheckCircle2;
  return (
    <Button
      type="button"
      variant="ghost"
      className="hover:bg-accent/30 flex h-auto w-full min-w-0 items-center justify-start gap-2 rounded-md px-2.5 py-2 text-left"
      onClick={() => onNavigate(issue)}
    >
      <StateIcon data-icon="inline-start" className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{issue.title}</span>
        <span className="text-muted-foreground block truncate text-[10px] font-normal">
          {issue.repository.fullName} #{issue.number}
        </span>
      </span>
    </Button>
  );
}

function TrackingSection({
  repository,
  issue,
  direction,
  title,
  onNavigate,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  direction: GitHubIssueTrackingDirection;
  title: string;
  onNavigate: (issue: GitHubIssueTrackingReference) => void;
}) {
  const { t } = useAppTranslation();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const after = cursors[cursors.length - 1] ?? null;
  const page = cursors.length;
  const result = useQuery(
    issueTrackingQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      issueNumber: issue.number,
      expectedIssueNodeId: issue.reactionSubject.id,
      direction,
      after,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;
  const errorTitle =
    error?.code === "githubPermission"
      ? "workspace.repositories.issueTrackingPermissionDenied"
      : "workspace.repositories.issueTrackingLoadFailed";

  if (result.isPending) {
    return (
      <section className="px-1.5 py-2">
        <h3 className="text-muted-foreground px-2.5 pb-1 text-[10px] font-medium uppercase">
          {title}
        </h3>
        <div className="flex flex-col gap-2 px-2.5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    );
  }

  if (!result.data) {
    return (
      <section className="px-2.5 py-2">
        <GitHubIssueRelationLoadError
          title={t(errorTitle)}
          error={error}
          onRetry={() => void result.refetch()}
        />
      </section>
    );
  }

  const { issues, nextCursor } = result.data;
  const changePage = (nextPage: number) => {
    if (nextPage < page) {
      setCursors((current) => current.slice(0, -1));
      return;
    }
    if (nextPage === page + 1 && nextCursor) {
      setCursors((current) => [...current, nextCursor]);
    }
  };

  return (
    <section className="border-border/60 px-1.5 py-2 first:border-b" aria-busy={result.isFetching}>
      <div className="flex items-center gap-2 px-2.5 pb-1">
        <h3 className="text-muted-foreground text-[10px] font-medium uppercase">{title}</h3>
        {result.isFetching ? (
          <RefreshCw className="text-muted-foreground size-3 animate-spin" />
        ) : null}
      </div>
      {error ? (
        <div className="px-1">
          <GitHubIssueRelationLoadError
            title={t(errorTitle)}
            error={error}
            onRetry={() => void result.refetch()}
          />
        </div>
      ) : null}
      {issues.length === 0 ? (
        <Empty className="min-h-0 gap-2 px-2.5 py-4 md:p-4">
          <EmptyHeader className="gap-1">
            <EmptyTitle className="text-xs">
              {t(
                direction === "tracked"
                  ? "workspace.repositories.noTrackedIssues"
                  : "workspace.repositories.noTrackedByIssues"
              )}
            </EmptyTitle>
            <EmptyDescription className="text-[11px]">
              {t(
                direction === "tracked"
                  ? "workspace.repositories.noTrackedIssuesDescription"
                  : "workspace.repositories.noTrackedByIssuesDescription"
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-0.5">
          {issues.map((trackedIssue) => (
            <TrackingIssueRow
              key={trackedIssue.nodeId}
              issue={trackedIssue}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
      <GitHubPagination
        page={page}
        hasPrevious={page > 1}
        hasMore={Boolean(nextCursor)}
        onPageChange={changePage}
        ariaLabel={t(
          direction === "tracked"
            ? "workspace.repositories.trackedIssuePagination"
            : "workspace.repositories.trackedByIssuePagination"
        )}
      />
    </section>
  );
}

export function GitHubIssueTracking({
  repository,
  issue,
  onNavigate,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onNavigate: (issue: GitHubIssueTrackingReference) => void;
}) {
  if (!issue.reactionSubject.id.trim()) return null;

  const targetKey =
    repository.owner.toLowerCase() +
    "/" +
    repository.name.toLowerCase() +
    "#" +
    issue.number +
    ":" +
    issue.reactionSubject.id;
  return (
    <TrackingCard key={targetKey} repository={repository} issue={issue} onNavigate={onNavigate} />
  );
}

function TrackingCard({
  repository,
  issue,
  onNavigate,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onNavigate: (issue: GitHubIssueTrackingReference) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-xs">
          <ListChecks className="text-muted-foreground size-3.5" />
          {t("workspace.repositories.issueTracking")}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <TrackingSection
          repository={repository}
          issue={issue}
          direction="tracked"
          title={t("workspace.repositories.trackedIssues")}
          onNavigate={onNavigate}
        />
        <TrackingSection
          repository={repository}
          issue={issue}
          direction="trackedBy"
          title={t("workspace.repositories.trackedByIssues")}
          onNavigate={onNavigate}
        />
      </CardContent>
    </Card>
  );
}
