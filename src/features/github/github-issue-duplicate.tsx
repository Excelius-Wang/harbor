import { useQuery } from "@tanstack/react-query";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubIssue,
  GitHubIssueDuplicateReference,
  GitHubRepositoryContentContext,
} from "./github-data";
import { issueDuplicateQueryOptions } from "./github-issue-duplicate-queries";
import { GitHubIssueRelationLoadError } from "./github-issue-relation-ui";
import { normalizeIssueStateReason } from "./github-issue-state";

function DuplicateSkeleton() {
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="px-4">
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

function GitHubIssueDuplicateContent({
  repository,
  issue,
  onNavigate,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onNavigate: (duplicate: GitHubIssueDuplicateReference) => void;
}) {
  const { t } = useAppTranslation();
  const result = useQuery(
    issueDuplicateQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      issueNumber: issue.number,
      expectedIssueNodeId: issue.reactionSubject.id,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;

  if (result.isPending) return <DuplicateSkeleton />;

  if (result.error)
    return (
      <GitHubIssueRelationLoadError
        title={t(
          error?.code === "githubPermission"
            ? "workspace.repositories.issueDuplicatePermissionDenied"
            : "workspace.repositories.issueDuplicateLoadFailed"
        )}
        error={error}
        onRetry={() => void result.refetch()}
      />
    );

  const duplicate = result.data;
  if (!duplicate) return null;

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none" aria-busy={result.isFetching}>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-xs">
          <Copy className="text-muted-foreground size-3.5" />
          {t("workspace.repositories.duplicateOfIssue")}
          {result.isFetching ? (
            <RefreshCw className="text-muted-foreground size-3 animate-spin" />
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-1.5 py-1.5">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full min-w-0 justify-start gap-2 rounded-md px-2.5 py-2 text-left"
          onClick={() => onNavigate(duplicate)}
        >
          <Copy data-icon="inline-start" className="text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{duplicate.title}</span>
            <span className="text-muted-foreground block truncate text-[10px] font-normal">
              {duplicate.fullName} #{duplicate.issueNumber}
            </span>
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}

export function GitHubIssueDuplicate(props: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onNavigate: (duplicate: GitHubIssueDuplicateReference) => void;
}) {
  const { repository, issue } = props;
  const isDuplicate =
    issue.state === "closed" && normalizeIssueStateReason(issue.stateReason) === "duplicate";
  if (!isDuplicate || !issue.reactionSubject.id.trim()) return null;

  const targetKey = `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}#${issue.number}:${issue.reactionSubject.id}`;
  return <GitHubIssueDuplicateContent key={targetKey} {...props} />;
}
