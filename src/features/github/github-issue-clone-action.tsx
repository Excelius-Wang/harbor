import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import type { GitHubIssue, GitHubIssueClone, GitHubRepositoryContentContext } from "./github-data";
import { cloneRepositoryIssue } from "./github-issue-clone-mutations";
import { issueCloneStatusQueryOptions } from "./github-issue-clone-queries";
import { GitHubIssueForm, type GitHubIssueFormValue } from "./github-issue-form";
import { invalidateRepositoryIssue } from "./github-issue-mutations";

function cloneErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.cloneIssuePermissionDenied";
  if (code === "githubIssueStateConflict") return "workspace.repositories.cloneIssueSourceChanged";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.cloneIssueFailed";
}

export function GitHubIssueCloneAction({
  repository,
  issue,
  onCloned,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onCloned: (clone: GitHubIssueClone) => void;
}) {
  const { t } = useTranslation();
  const { t: appT } = useAppTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const target = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
  };
  const statusResult = useQuery(issueCloneStatusQueryOptions(target));
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) =>
      cloneRepositoryIssue(target, {
        expectedIssueNodeId: issue.reactionSubject.id,
        title,
        body,
      }),
    onSuccess: (clone) => {
      setOpen(false);
      toast.success(appT("workspace.repositories.issueCloned"));
      void invalidateRepositoryIssue(queryClient, target);
      onCloned(clone);
    },
    onError: () => {
      void invalidateRepositoryIssue(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const statusError = statusResult.error ? parseIpcError(statusResult.error) : null;

  if (issue.state !== "open" || statusResult.data?.viewerCanClone === false) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return;
        setOpen(nextOpen);
        if (!nextOpen) mutation.reset();
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={statusResult.isPending || mutation.isPending}
        onClick={() => setOpen(true)}
      >
        {statusResult.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Copy data-icon="inline-start" />
        )}
        {t("workspace.repositories.cloneIssue")}
      </Button>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.cloneIssue")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.cloneIssueDescription", {
              repository: `${repository.owner}/${repository.name}`,
              issue: issue.number,
            })}
          </DialogDescription>
        </DialogHeader>
        {statusResult.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-xs" role="status">
            <Spinner />
            {t("workspace.repositories.checkingCloneIssue")}
          </div>
        ) : statusError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.cloneIssueStatusLoadFailed")}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1">{statusError.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void statusResult.refetch()}
              >
                {t("workspace.repositories.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : statusResult.data?.viewerCanClone ? (
          <GitHubIssueForm
            repository={repository}
            idPrefix={`github-clone-issue-${issue.number}`}
            initialValue={{
              title: statusResult.data.title,
              body: statusResult.data.body ?? "",
            }}
            submitLabel={t("workspace.repositories.cloneIssueConfirm")}
            pendingLabel={t("workspace.repositories.cloningIssue")}
            pending={mutation.isPending}
            errorTitle={t(cloneErrorTitle(error?.code ?? "github"))}
            errorMessage={
              error?.code === "github"
                ? t("workspace.repositories.cloneIssueWriteUncertain")
                : error?.message
            }
            onChange={() => {
              if (mutation.isError) mutation.reset();
            }}
            onSubmit={(value) => mutation.mutate(value)}
            onCancel={() => setOpen(false)}
          />
        ) : (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.cloneIssueFailed")}</AlertTitle>
            <AlertDescription>
              {t("workspace.repositories.cloneIssuePermissionDenied")}
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
