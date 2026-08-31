import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubIssue,
  GitHubIssueDuplicateReference,
  GitHubRepositoryContentContext,
} from "./github-data";
import {
  refreshRepositoryIssueDuplicate,
  unmarkRepositoryIssueDuplicate,
} from "./github-issue-duplicate-mutations";
import { issueDuplicateQueryOptions } from "./github-issue-duplicate-queries";
import { syncUpdatedIssue } from "./github-issue-mutations";
import { GitHubIssueRelationLoadError } from "./github-issue-relation-ui";
import { normalizeIssueStateReason } from "./github-issue-state";

function duplicateMutationErrorTitle(code: string) {
  if (code === "githubPermission")
    return "workspace.repositories.issueDuplicateWritePermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  if (code === "githubIssueStateConflict") return "workspace.repositories.issueStateChanged";
  return "workspace.repositories.issueDuplicateUpdateFailed";
}

function duplicateLoadErrorTitle(code?: string) {
  if (code === "githubPermission") return "workspace.repositories.issueDuplicatePermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.issueDuplicateLoadFailed";
}

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
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
    expectedIssueNodeId: issue.reactionSubject.id,
  };
  const result = useQuery(issueDuplicateQueryOptions(target));
  const error = result.error ? parseIpcError(result.error) : null;
  const duplicate = result.data;
  const mutation = useMutation({
    mutationFn: () => unmarkRepositoryIssueDuplicate(target),
    onSuccess: (updatedIssue) => {
      setConfirmOpen(false);
      syncUpdatedIssue(queryClient, target, updatedIssue);
      toast.success(t("workspace.repositories.issueDuplicateUnmarked"));
    },
    onError: (mutationError) => {
      const parsed = parseIpcError(mutationError);
      toast.error(t(duplicateMutationErrorTitle(parsed.code)), {
        description: parsed.message,
      });
    },
    onSettled: () => {
      if (duplicate) void refreshRepositoryIssueDuplicate(queryClient, target, duplicate);
    },
  });

  if (result.isPending) return <DuplicateSkeleton />;

  if (result.error)
    return (
      <GitHubIssueRelationLoadError
        title={t(duplicateLoadErrorTitle(error?.code))}
        error={error}
        onRetry={() => void result.refetch()}
      />
    );

  if (!duplicate) return null;

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none" aria-busy={result.isFetching}>
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xs">
            <Copy className="text-muted-foreground size-3.5" />
            {t("workspace.repositories.duplicateOfIssue")}
            {result.isFetching ? (
              <RefreshCw className="text-muted-foreground size-3 animate-spin" />
            ) : null}
          </CardTitle>
          {duplicate.viewerCanUnmark ? (
            <AlertDialog
              open={confirmOpen}
              onOpenChange={(open) => {
                if (!mutation.isPending) setConfirmOpen(open);
              }}
            >
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={mutation.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <Undo2 data-icon="inline-start" />
                {t("workspace.repositories.unmarkIssueDuplicate")}
              </Button>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("workspace.repositories.unmarkIssueDuplicateConfirm")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("workspace.repositories.unmarkIssueDuplicateDescription", {
                      issue: `${duplicate.fullName} #${duplicate.issueNumber}`,
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={mutation.isPending}>
                    {t("common.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={mutation.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      mutation.mutate();
                    }}
                  >
                    {mutation.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Undo2 data-icon="inline-start" />
                    )}
                    {t(
                      mutation.isPending
                        ? "workspace.repositories.unmarkingIssueDuplicate"
                        : "workspace.repositories.unmarkIssueDuplicateConfirm"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
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
