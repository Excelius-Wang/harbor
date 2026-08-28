import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubPullRequest, GitHubPullRequestRepository } from "./github-data";
import { GitHubTitleBodyForm, type GitHubIssueFormValue } from "./github-issue-form";
import {
  invalidateRepositoryPullRequest,
  syncUpdatedPullRequest,
  updateRepositoryPullRequest,
} from "./github-pull-request-mutations";

export function GitHubPullRequestEditDialog({
  repository,
  pullRequest,
  open,
  onOpenChange,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) =>
      updateRepositoryPullRequest(target, title, body),
    onSuccess: (updatedPullRequest) => {
      syncUpdatedPullRequest(queryClient, target, updatedPullRequest);
      toast.success(t("workspace.repositories.pullRequestUpdated"));
      onOpenChange(false);
      void invalidateRepositoryPullRequest(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const setOpen = (nextOpen: boolean) => {
    if (mutation.isPending) return;
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };
  const repositoryContext = {
    ...repository,
    defaultBranch: pullRequest.baseRef,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.editPullRequest")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.editPullRequestDescription", {
              number: pullRequest.number,
            })}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <GitHubTitleBodyForm
            repository={repositoryContext}
            reference={pullRequest.baseRef}
            idPrefix={`github-edit-pull-request-${pullRequest.number}`}
            initialValue={{ title: pullRequest.title, body: pullRequest.body ?? "" }}
            copy={{
              titleLabel: t("workspace.repositories.pullRequestTitle"),
              titlePlaceholder: t("workspace.repositories.pullRequestTitlePlaceholder"),
              titleRequired: t("workspace.repositories.pullRequestTitleRequired"),
              bodyLabel: t("workspace.repositories.pullRequestBody"),
              bodyPlaceholder: t("workspace.repositories.pullRequestBodyPlaceholder"),
            }}
            submitLabel={t("workspace.repositories.saveChanges")}
            pendingLabel={t("workspace.repositories.savingChanges")}
            pending={mutation.isPending}
            requireChanges
            errorTitle={t("workspace.repositories.updatePullRequestFailed")}
            errorMessage={
              error?.code === "githubPermission"
                ? t("workspace.repositories.pullRequestWritePermissionDenied")
                : error?.message
            }
            onChange={() => {
              if (mutation.isError) mutation.reset();
            }}
            onSubmit={(value) => mutation.mutate(value)}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
