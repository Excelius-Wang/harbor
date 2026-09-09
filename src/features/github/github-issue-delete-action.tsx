import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssue, GitHubRepositoryContentContext } from "./github-data";
import {
  deleteRepositoryIssue,
  issueDeleteIdentityMatches,
  issueDeleteStatusQueryOptions,
  refreshIssueDeletionCaches,
  syncDeletedIssue,
  type GitHubIssueDeleteTarget,
} from "./github-issue-delete-queries";

function deleteErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.issueDeletePermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  if (code === "githubIssueStateConflict") {
    return "workspace.repositories.issueDeleteStatusChanged";
  }
  if (code === "githubIssueDeletionConflict") {
    return "workspace.repositories.issueDeleteMayHavePersisted";
  }
  return "workspace.repositories.issueDeleteFailed";
}

export function GitHubIssueDeleteAction({
  repository,
  issue,
  onDeleted,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const pendingRequest = useRef(false);
  const target: GitHubIssueDeleteTarget = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
    expectedIssueNodeId: issue.reactionSubject.id,
  };
  const status = useQuery(issueDeleteStatusQueryOptions(target));
  const mutation = useMutation({
    mutationFn: () => deleteRepositoryIssue(target),
    onSuccess: (deletion) => {
      if (!syncDeletedIssue(queryClient, target, deletion)) {
        toast.error(t("workspace.repositories.issueDeleteFailed"));
        void refreshIssueDeletionCaches(queryClient, target);
        return;
      }
      setOpen(false);
      toast.success(t("workspace.repositories.issueDeleted"));
      onDeleted();
      void refreshIssueDeletionCaches(queryClient, target);
    },
    onSettled: () => {
      pendingRequest.current = false;
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(deleteErrorTitle(parsed.code)), { description: parsed.message });
      void status.refetch();
      void refreshIssueDeletionCaches(queryClient, target);
    },
  });

  const statusUnavailable = Boolean(
    status.error || !status.data || !issueDeleteIdentityMatches(status.data, target)
  );
  const canDelete = !statusUnavailable && Boolean(status.data?.viewerCanDelete);
  const busy = mutation.isPending || status.isFetching;
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;

  if (status.isPending && !open) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Spinner data-icon="inline-start" aria-hidden="true" />
        {t("workspace.repositories.deleteIssueLoading")}
      </Button>
    );
  }

  if (statusUnavailable && !open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={status.isFetching}
        onClick={() => void status.refetch()}
      >
        {status.isFetching ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : status.error ? (
          <CircleAlert data-icon="inline-start" />
        ) : (
          <RefreshCw data-icon="inline-start" />
        )}
        {t("workspace.repositories.deleteIssueStatusUnavailable")}
      </Button>
    );
  }

  if (!canDelete && !open) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pendingRequest.current || mutation.isPending) return;
        if (nextOpen) mutation.reset();
        setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={!canDelete || busy}>
          <Trash2 data-icon="inline-start" />
          {t("workspace.repositories.deleteIssue")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace.repositories.deleteIssueTitle", { number: issue.number })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.deleteIssueWarning")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {statusUnavailable ? (
          <WorkspaceStaleNotice
            message={t("workspace.repositories.deleteIssueStatusUnavailable")}
            onRetry={() => void status.refetch()}
            retryDisabled={busy}
          />
        ) : !canDelete ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.issueDeletePermissionDenied")}</AlertTitle>
          </Alert>
        ) : null}
        {mutationError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t(deleteErrorTitle(mutationError.code))}</AlertTitle>
            <AlertDescription>{mutationError.message}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canDelete || busy}
            onClick={(event) => {
              event.preventDefault();
              if (canDelete && !busy && !pendingRequest.current) {
                pendingRequest.current = true;
                mutation.mutate();
              }
            }}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
            {t(
              mutation.isPending
                ? "workspace.repositories.deletingIssue"
                : "workspace.repositories.confirmDeleteIssue"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
