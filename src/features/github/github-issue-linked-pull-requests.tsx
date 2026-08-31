import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitPullRequest, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubIssue,
  GitHubIssueLinkedPullRequestReference,
  GitHubRepositoryContentContext,
} from "./github-data";
import { issueLinkedPullRequestQueryOptions } from "./github-issue-linked-pull-request-queries";
import { GitHubIssueRelationLoadError } from "./github-issue-relation-ui";
import { GitHubPagination } from "./github-issue-shared";
import { GitHubPullRequestStateBadge } from "./github-pull-request-shared";

function LinkedPullRequestsSkeleton() {
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

function LinkedPullRequestRow({
  pullRequest,
  onNavigate,
}: {
  pullRequest: GitHubIssueLinkedPullRequestReference;
  onNavigate: (pullRequest: GitHubIssueLinkedPullRequestReference) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="hover:bg-accent/30 flex min-w-0 items-center rounded-md">
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-w-0 flex-1 justify-start gap-2 rounded-md px-2.5 py-2 text-left"
        onClick={() => onNavigate(pullRequest)}
      >
        <GitPullRequest data-icon="inline-start" className="text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{pullRequest.title}</span>
          <span className="text-muted-foreground block truncate text-[10px] font-normal">
            {pullRequest.repository.fullName} #{pullRequest.number}
          </span>
        </span>
        <GitHubPullRequestStateBadge pullRequest={pullRequest} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="mr-1 shrink-0"
        aria-label={t("workspace.repositories.openLinkedPullRequestOnGitHub", {
          repository: pullRequest.repository.fullName,
          number: pullRequest.number,
        })}
        onClick={() => void openExternalUrl(pullRequest.url)}
      >
        <ExternalLink />
      </Button>
    </div>
  );
}

function GitHubIssueLinkedPullRequestsContent({
  repository,
  issue,
  onNavigate,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onNavigate: (pullRequest: GitHubIssueLinkedPullRequestReference) => void;
}) {
  const { t } = useAppTranslation();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const after = cursors[cursors.length - 1] ?? null;
  const page = cursors.length;
  const result = useQuery(
    issueLinkedPullRequestQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      issueNumber: issue.number,
      expectedIssueNodeId: issue.reactionSubject.id,
      after,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;

  if (result.isPending) return <LinkedPullRequestsSkeleton />;

  if (!result.data)
    return (
      <GitHubIssueRelationLoadError
        title={t(
          error?.code === "githubPermission"
            ? "workspace.repositories.issueLinkedPullRequestsPermissionDenied"
            : "workspace.repositories.issueLinkedPullRequestsLoadFailed"
        )}
        error={error}
        onRetry={() => void result.refetch()}
      />
    );

  const { pullRequests, nextCursor } = result.data;
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
    <Card className="gap-0 overflow-hidden py-0 shadow-none" aria-busy={result.isFetching}>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-xs">
          <GitPullRequest className="text-muted-foreground size-3.5" />
          {t("workspace.repositories.linkedPullRequests")}
          {result.isFetching ? (
            <RefreshCw className="text-muted-foreground size-3 animate-spin" />
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-1.5 py-1.5">
        {pullRequests.length === 0 ? (
          <Empty className="min-h-0 gap-2 px-4 py-5 md:p-5">
            <EmptyHeader className="gap-1">
              <EmptyTitle className="text-xs">
                {t("workspace.repositories.noLinkedPullRequests")}
              </EmptyTitle>
              <EmptyDescription className="text-[11px]">
                {t("workspace.repositories.noLinkedPullRequestsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-0.5">
            {pullRequests.map((pullRequest) => (
              <LinkedPullRequestRow
                key={pullRequest.url}
                pullRequest={pullRequest}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </CardContent>
      <GitHubPagination
        page={page}
        hasPrevious={page > 1}
        hasMore={Boolean(nextCursor)}
        onPageChange={changePage}
        ariaLabel={t("workspace.repositories.linkedPullRequestPagination")}
      />
    </Card>
  );
}

export function GitHubIssueLinkedPullRequests(props: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onNavigate: (pullRequest: GitHubIssueLinkedPullRequestReference) => void;
}) {
  const { repository, issue } = props;
  if (!issue.reactionSubject.id.trim()) return null;

  const targetKey = `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}#${issue.number}:${issue.reactionSubject.id}`;
  return <GitHubIssueLinkedPullRequestsContent key={targetKey} {...props} />;
}
