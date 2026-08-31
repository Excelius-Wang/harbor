import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Pin, PinOff, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubIssue,
  GitHubIssuePinAction as GitHubIssuePinActionValue,
  GitHubRepositoryContentContext,
} from "./github-data";
import {
  refreshRepositoryPinnedIssues,
  repositoryPinnedIssuesQueryOptions,
  syncRepositoryPinnedIssues,
  updateRepositoryIssuePin,
} from "./github-issue-pin-queries";

function updateErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.issueWritePermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  if (code === "githubIssueStateConflict") return "workspace.repositories.issueStateChanged";
  return "workspace.repositories.issuePinUpdateFailed";
}

export function GitHubIssuePinAction({
  repository,
  issue,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const status = useQuery(repositoryPinnedIssuesQueryOptions(target));
  const mutation = useMutation({
    mutationFn: (action: GitHubIssuePinActionValue) =>
      updateRepositoryIssuePin(
        {
          ...target,
          issueNumber: issue.number,
          expectedIssueNodeId: issue.reactionSubject.id,
        },
        action
      ),
    onSuccess: (page, action) => {
      syncRepositoryPinnedIssues(queryClient, target, page);
      toast.success(
        t(
          action === "pin"
            ? "workspace.repositories.issuePinned"
            : "workspace.repositories.issueUnpinned"
        )
      );
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(updateErrorTitle(parsed.code)), { description: parsed.message });
    },
    onSettled: () => {
      void refreshRepositoryPinnedIssues(queryClient, repository, issue.number);
    },
  });

  if (status.isPending) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Spinner data-icon="inline-start" />
        {t("workspace.repositories.pinIssueLoading")}
      </Button>
    );
  }

  const expectedFullName = `${repository.owner}/${repository.name}`;
  const pageMatches =
    status.data?.repositoryFullName.toLowerCase() === expectedFullName.toLowerCase();
  const matchingNumber = status.data?.issues.find((pinned) => pinned.number === issue.number);
  const identityChanged = Boolean(
    matchingNumber && matchingNumber.nodeId !== issue.reactionSubject.id
  );
  if (status.error || !status.data || !pageMatches || identityChanged) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={status.isFetching}
        onClick={() => void status.refetch()}
      >
        {status.isFetching ? (
          <Spinner data-icon="inline-start" />
        ) : status.error ? (
          <CircleAlert data-icon="inline-start" />
        ) : (
          <RefreshCw data-icon="inline-start" />
        )}
        {t("workspace.repositories.pinIssueStatusUnavailable")}
      </Button>
    );
  }

  if (!status.data.viewerCanManage) return null;

  const pinned = matchingNumber?.nodeId === issue.reactionSubject.id;
  const limitReached = !pinned && status.data.issues.length >= 3;
  const action: GitHubIssuePinActionValue = pinned ? "unpin" : "pin";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={limitReached || status.isFetching || mutation.isPending}
      onClick={() => mutation.mutate(action)}
    >
      {mutation.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : pinned ? (
        <PinOff data-icon="inline-start" />
      ) : (
        <Pin data-icon="inline-start" />
      )}
      {t(
        limitReached
          ? "workspace.repositories.pinIssueLimitReached"
          : pinned
            ? "workspace.repositories.unpinIssue"
            : "workspace.repositories.pinIssue"
      )}
    </Button>
  );
}
