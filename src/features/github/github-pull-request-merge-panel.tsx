import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  GitMerge,
  GitPullRequestDraft,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubPullRequest,
  GitHubPullRequestMergeMethod,
  GitHubPullRequestRepository,
} from "./github-data";
import { GitHubPullRequestBranchUpdate } from "./github-pull-request-branch-update";
import { GitHubPullRequestMergeAutomation } from "./github-pull-request-merge-queue";
import {
  invalidateRepositoryPullRequest,
  mergeRepositoryPullRequest,
  syncUpdatedPullRequest,
} from "./github-pull-request-mutations";
import { usePullRequestDraftStateMutation } from "./github-pull-request-lifecycle";
import { GitHubPullRequestRevisionGuard } from "./github-pull-request-shared";

type MergePanelStatus =
  | "merged"
  | "closed"
  | "draft"
  | "conflicts"
  | "blocked"
  | "checking"
  | "ready";

export function getPullRequestMergePanelStatus(pullRequest: GitHubPullRequest): MergePanelStatus {
  if (pullRequest.merged) return "merged";
  if (pullRequest.state === "closed") return "closed";
  if (pullRequest.draft) return "draft";
  if (pullRequest.mergeable === false) return "conflicts";
  if (["blocked", "behind", "unstable"].includes(pullRequest.mergeableState?.toLowerCase() ?? "")) {
    return "blocked";
  }
  if (pullRequest.mergeable == null) return "checking";
  return "ready";
}

export function getDefaultPullRequestMergeCommitTitle(
  pullRequest: GitHubPullRequest,
  method: GitHubPullRequestMergeMethod
) {
  if (method === "squash") return `${pullRequest.title} (#${pullRequest.number})`;
  if (method === "merge") {
    return `Merge pull request #${pullRequest.number} from ${pullRequest.headLabel ?? pullRequest.headRef}`;
  }
  return "";
}

export function GitHubPullRequestMergePanel({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<GitHubPullRequestMergeMethod>("merge");
  const [commitTitle, setCommitTitle] = useState(() =>
    getDefaultPullRequestMergeCommitTitle(pullRequest, "merge")
  );
  const [commitMessage, setCommitMessage] = useState("");
  const target = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const draftState = usePullRequestDraftStateMutation(repository, pullRequest);
  const mutation = useMutation({
    mutationFn: () =>
      mergeRepositoryPullRequest(target, {
        headSha: pullRequest.headSha,
        method,
        commitTitle: method === "rebase" ? undefined : commitTitle.trim() || undefined,
        commitMessage: method === "rebase" ? undefined : commitMessage.trim() || undefined,
      }),
    onSuccess: (mergedPullRequest) => {
      syncUpdatedPullRequest(queryClient, target, mergedPullRequest);
      setOpen(false);
      toast.success(t("workspace.repositories.pullRequestMergeSucceeded"));
      void invalidateRepositoryPullRequest(queryClient, target);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const status = getPullRequestMergePanelStatus(pullRequest);
  const canMerge = status === "ready";
  const statusTitle = t(`workspace.repositories.pullRequestMergeStatuses.${status}.title`);
  const statusDescription = t(
    `workspace.repositories.pullRequestMergeStatuses.${status}.description`,
    {
      base: pullRequest.baseRef,
      state: pullRequest.mergeableState ?? t("workspace.repositories.mergeStateUnknown"),
    }
  );
  const statusIcon =
    status === "merged" || status === "ready" ? (
      <CheckCircle2 />
    ) : status === "checking" ? (
      <RefreshCw className="animate-spin" />
    ) : status === "blocked" ? (
      <Clock3 />
    ) : status === "draft" ? (
      <GitPullRequestDraft />
    ) : (
      <XCircle />
    );
  const methodDescription = t(
    `workspace.repositories.pullRequestMergeMethods.${method}.description`
  );
  const actionLabel = t(`workspace.repositories.pullRequestMergeActions.${method}`);
  const errorMessage =
    error?.code === "githubPermission"
      ? t("workspace.repositories.pullRequestMergePermissionDenied")
      : error?.message;

  function changeMethod(nextMethod: GitHubPullRequestMergeMethod) {
    setMethod(nextMethod);
    setCommitTitle(getDefaultPullRequestMergeCommitTitle(pullRequest, nextMethod));
    mutation.reset();
  }

  function changeOpen(nextOpen: boolean) {
    if (mutation.isPending) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setMethod("merge");
      setCommitTitle(getDefaultPullRequestMergeCommitTitle(pullRequest, "merge"));
      setCommitMessage("");
      mutation.reset();
    }
  }

  return (
    <>
      <section
        data-slot="pull-request-merge-panel"
        className={
          canMerge
            ? "border-success/35 bg-success/[0.045] rounded-lg border"
            : status === "conflicts"
              ? "border-destructive/35 bg-destructive/[0.045] rounded-lg border"
              : "bg-card rounded-lg border"
        }
        aria-labelledby={`pull-request-${pullRequest.number}-merge-status`}
      >
        <div className="flex min-w-0 items-center gap-3 p-4 @max-[520px]/pull-detail:items-start">
          <div
            className={
              canMerge || status === "merged"
                ? "bg-success/12 text-success flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4"
                : status === "conflicts"
                  ? "bg-destructive/12 text-destructive flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4"
                  : "bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4"
            }
          >
            {statusIcon}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id={`pull-request-${pullRequest.number}-merge-status`}
              className="text-card-foreground text-sm font-semibold"
            >
              {statusTitle}
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">{statusDescription}</p>
          </div>
          {status === "draft" ? (
            <Button
              type="button"
              size="sm"
              className="bg-success text-background hover:bg-success/90 focus-visible:ring-success/35 @max-[520px]/pull-detail:self-center"
              disabled={draftState.mutation.isPending}
              onClick={() => draftState.mutation.mutate(false)}
            >
              {draftState.mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CheckCircle2 data-icon="inline-start" />
              )}
              {draftState.mutation.isPending
                ? t("workspace.repositories.markingPullRequestReadyForReview")
                : t("workspace.repositories.markPullRequestReadyForReview")}
            </Button>
          ) : canMerge ? (
            <Button
              type="button"
              size="sm"
              className="bg-success text-background hover:bg-success/90 focus-visible:ring-success/35 @max-[520px]/pull-detail:self-center"
              onClick={() => changeOpen(true)}
            >
              <GitMerge data-icon="inline-start" />
              {t("workspace.repositories.openPullRequestMergeDialog")}
            </Button>
          ) : null}
        </div>
        {status === "draft" && draftState.errorMessage ? (
          <Alert variant="destructive" className="mx-4 mb-4 w-auto">
            <XCircle />
            <AlertTitle>{t("workspace.repositories.pullRequestDraftStateChangeFailed")}</AlertTitle>
            <AlertDescription>{draftState.errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <GitHubPullRequestBranchUpdate repository={repository} pullRequest={pullRequest} />
        <GitHubPullRequestMergeAutomation repository={repository} pullRequest={pullRequest} />
      </section>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[560px]"
          aria-busy={mutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>
              {t("workspace.repositories.pullRequestMergeDialogTitle", {
                number: pullRequest.number,
              })}
            </DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.pullRequestMergeDialogDescription", {
                number: pullRequest.number,
                base: pullRequest.baseRef,
              })}
            </DialogDescription>
          </DialogHeader>

          <GitHubPullRequestRevisionGuard
            from={pullRequest.headLabel ?? pullRequest.headRef}
            to={pullRequest.baseRef}
            expectedHeadSha={pullRequest.headSha}
            description={t("workspace.repositories.pullRequestMergeHeadGuard")}
          />

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`pull-request-${pullRequest.number}-merge-method`}>
                {t("workspace.repositories.pullRequestMergeMethod")}
              </FieldLabel>
              <Select
                value={method}
                onValueChange={(value) => changeMethod(value as GitHubPullRequestMergeMethod)}
                disabled={mutation.isPending}
              >
                <SelectTrigger
                  id={`pull-request-${pullRequest.number}-merge-method`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {(["merge", "squash", "rebase"] as const).map((mergeMethod) => (
                      <SelectItem key={mergeMethod} value={mergeMethod}>
                        {t(`workspace.repositories.pullRequestMergeMethods.${mergeMethod}.label`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{methodDescription}</FieldDescription>
            </Field>

            {method !== "rebase" ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`pull-request-${pullRequest.number}-commit-title`}>
                    {t("workspace.repositories.pullRequestCommitTitle")}
                  </FieldLabel>
                  <Input
                    id={`pull-request-${pullRequest.number}-commit-title`}
                    value={commitTitle}
                    disabled={mutation.isPending}
                    onChange={(event) => {
                      setCommitTitle(event.target.value);
                      mutation.reset();
                    }}
                    placeholder={t("workspace.repositories.pullRequestCommitTitlePlaceholder")}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`pull-request-${pullRequest.number}-commit-message`}>
                    {t("workspace.repositories.pullRequestCommitMessage")}
                  </FieldLabel>
                  <Textarea
                    id={`pull-request-${pullRequest.number}-commit-message`}
                    value={commitMessage}
                    disabled={mutation.isPending}
                    className="min-h-24 resize-y"
                    onChange={(event) => {
                      setCommitMessage(event.target.value);
                      mutation.reset();
                    }}
                    placeholder={t("workspace.repositories.pullRequestCommitMessagePlaceholder")}
                  />
                  <FieldDescription>
                    {t("workspace.repositories.pullRequestCommitMessageDescription")}
                  </FieldDescription>
                </Field>
              </>
            ) : null}
          </FieldGroup>

          {errorMessage ? (
            <Alert variant="destructive">
              <XCircle />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => changeOpen(false)}
            >
              {t("workspace.repositories.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-success text-background hover:bg-success/90 focus-visible:ring-success/35"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <GitMerge data-icon="inline-start" />
              )}
              {mutation.isPending ? t("workspace.repositories.mergingPullRequest") : actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
