import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubRepositoryContentContext } from "./github-data";
import { issueCreationPolicyQueryOptions } from "./github-issue-creation-policy-queries";
import { GitHubIssueForm, type GitHubIssueFormValue } from "./github-issue-form";
import { invalidateRepositoryIssue, syncCreatedIssue } from "./github-issue-mutations";
import { githubIssueRelationshipQueryKeys } from "./github-issue-relationship-queries";
import {
  createRepositoryIssueSubIssue,
  refreshRepositoryIssueRelationships,
  type GitHubIssueRelationshipMutationTarget,
} from "./github-issue-relationship-mutations";

export function GitHubIssueCreateSubIssueAction({
  repository,
  target,
}: {
  repository: GitHubRepositoryContentContext;
  target: GitHubIssueRelationshipMutationTarget;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const policyResult = useQuery({
    ...issueCreationPolicyQueryOptions({
      owner: target.owner,
      repository: target.repository,
    }),
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) =>
      createRepositoryIssueSubIssue(target, title, body),
    onSuccess: (summary) => {
      setOpen(false);
      syncCreatedIssue(queryClient, target, summary.issue);
      toast.success(t("workspace.repositories.subIssueCreated"));
      void Promise.all([
        refreshRepositoryIssueRelationships(queryClient, target, summary.issue.number),
        invalidateRepositoryIssue(queryClient, {
          ...target,
          issueNumber: summary.issue.number,
        }),
      ]);
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: githubIssueRelationshipQueryKeys.root(target),
        refetchType: "active",
      });
    },
  });
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;
  const policyError = policyResult.error ? parseIpcError(policyResult.error) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return;
        setOpen(nextOpen);
        if (!nextOpen && mutation.isError) mutation.reset();
      }}
    >
      <Button type="button" size="xs" disabled={mutation.isPending} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        {t("workspace.repositories.createSubIssue")}
      </Button>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!mutation.isPending}
      >
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.createSubIssue")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.createSubIssueDescription", {
              repository: `${repository.owner}/${repository.name}`,
              issue: target.issueNumber,
            })}
          </DialogDescription>
        </DialogHeader>
        {policyResult.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-xs" role="status">
            <Spinner />
            {t("workspace.repositories.checkingSubIssueCreationPolicy")}
          </div>
        ) : !policyResult.data ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>
              {t(
                policyError?.code === "githubPermission"
                  ? "workspace.repositories.issueCreationPolicyPermissionDenied"
                  : "workspace.repositories.issueCreationPolicyLoadFailed"
              )}
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1">{policyError?.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void policyResult.refetch()}
              >
                {t("workspace.repositories.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !policyResult.data.blankIssueAllowed ? (
          <Alert>
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.subIssueCreationRestricted")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{t("workspace.repositories.subIssueCreationRestrictedDescription")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openExternalUrl(policyResult.data.templateChooserUrl)}
              >
                <ExternalLink data-icon="inline-start" />
                {t("workspace.repositories.openIssueTemplates")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <GitHubIssueForm
            repository={repository}
            idPrefix="github-new-sub-issue"
            initialValue={{ title: "", body: "" }}
            submitLabel={t("workspace.repositories.createSubIssueConfirm")}
            pendingLabel={t("workspace.repositories.creatingSubIssue")}
            pending={mutation.isPending}
            errorTitle={t(
              mutationError?.code === "githubPermission"
                ? "workspace.repositories.issueRelationshipWritePermissionDenied"
                : "workspace.repositories.createSubIssueFailed"
            )}
            errorMessage={mutationError?.message}
            onChange={() => {
              if (mutation.isError) mutation.reset();
            }}
            onSubmit={(value) => mutation.mutate(value)}
            onCancel={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
