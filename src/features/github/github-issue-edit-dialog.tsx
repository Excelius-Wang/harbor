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
import type { GitHubIssue, GitHubRepositoryContentContext } from "./github-data";
import { GitHubIssueForm, type GitHubIssueFormValue } from "./github-issue-form";
import {
  invalidateRepositoryIssue,
  syncUpdatedIssue,
  updateRepositoryIssue,
} from "./github-issue-mutations";

export function GitHubIssueEditDialog({
  repository,
  issue,
  open,
  onOpenChange,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
  };
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) =>
      updateRepositoryIssue(target, title, body),
    onSuccess: (updatedIssue) => {
      syncUpdatedIssue(queryClient, target, updatedIssue);
      toast.success(t("workspace.repositories.issueUpdated"));
      onOpenChange(false);
      void invalidateRepositoryIssue(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const setOpen = (nextOpen: boolean) => {
    if (mutation.isPending) return;
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.editIssue")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.editIssueDescription", { number: issue.number })}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <GitHubIssueForm
            repository={repository}
            idPrefix={`github-edit-issue-${issue.number}`}
            initialValue={{ title: issue.title, body: issue.body ?? "" }}
            submitLabel={t("workspace.repositories.saveChanges")}
            pendingLabel={t("workspace.repositories.savingChanges")}
            pending={mutation.isPending}
            requireChanges
            errorTitle={t("workspace.repositories.updateIssueFailed")}
            errorMessage={
              error?.code === "githubPermission"
                ? t("workspace.repositories.issueWritePermissionDenied")
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
