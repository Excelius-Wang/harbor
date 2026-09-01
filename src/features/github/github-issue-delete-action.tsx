import { useState } from "react";
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
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(deleteErrorTitle(parsed.code)), { description: parsed.message });
      void status.refetch();
      void refreshIssueDeletionCaches(queryClient, target);
    },
  });

  if (status.isPending) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Spinner data-icon="inline-start" aria-hidden="true" />
        {t("workspace.repositories.deleteIssueLoading")}
      </Button>
    );
  }

  if (status.error || !status.data || !issueDeleteIdentityMatches(status.data, target)) {
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

  if (!status.data.viewerCanDelete) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
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
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
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
