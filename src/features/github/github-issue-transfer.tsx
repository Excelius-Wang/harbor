import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, CircleAlert, Search } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssue, GitHubRepositoryContentContext } from "./github-data";
import {
  getIssueTransferStatus,
  issueTransferStatusIdentityMatches,
  parseGitHubRepositoryReference,
  refreshIssueTransferCaches,
  syncTransferredIssue,
  transferRepositoryIssue,
  type GitHubIssueTransferTarget,
} from "./github-issue-transfer-queries";

function transferErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.issueTransferPermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  if (code === "githubIssueStateConflict")
    return "workspace.repositories.issueTransferStatusChanged";
  if (code === "githubIssueTransferConflict") {
    return "workspace.repositories.issueTransferMayHavePersisted";
  }
  return "workspace.repositories.issueTransferFailed";
}

export function GitHubIssueTransferAction({
  repository,
  issue,
  onTransferred,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
  onTransferred: (target: {
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
    issueNumber: number;
  }) => void;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const repositoryId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const issueEligible = issue.state === "open" && Boolean(issue.reactionSubject.id.trim());
  const parsedRepository = parseGitHubRepositoryReference(value);
  const invalidRepository = value.trim().length > 0 && !parsedRepository;
  const target = parsedRepository
    ? {
        sourceOwner: repository.owner,
        sourceRepository: repository.name,
        issueNumber: issue.number,
        targetOwner: parsedRepository.owner,
        targetRepository: parsedRepository.repository,
        expectedIssueNodeId: issue.reactionSubject.id,
      }
    : null;
  const candidate = useMutation({
    mutationFn: (nextTarget: GitHubIssueTransferTarget) => getIssueTransferStatus(nextTarget),
  });
  const mutation = useMutation({
    mutationFn: (nextTarget: GitHubIssueTransferTarget) => transferRepositoryIssue(nextTarget),
    onSuccess: (transfer, nextTarget) => {
      const destination = syncTransferredIssue(queryClient, nextTarget, transfer);
      if (!destination) {
        toast.error(t("workspace.repositories.issueTransferFailed"));
        void refreshIssueTransferCaches(queryClient, nextTarget, transfer);
        return;
      }
      setOpen(false);
      setValue("");
      candidate.reset();
      toast.success(t("workspace.repositories.issueTransferred"));
      onTransferred({
        owner: nextTarget.targetOwner,
        name: nextTarget.targetRepository,
        url: transfer.targetRepositoryUrl,
        defaultBranch: transfer.targetDefaultBranch,
        issueNumber: transfer.targetIssueNumber,
      });
      void refreshIssueTransferCaches(queryClient, nextTarget, transfer);
    },
    onError: (error, nextTarget) => {
      const parsed = parseIpcError(error);
      toast.error(t(transferErrorTitle(parsed.code)), { description: parsed.message });
      void refreshIssueTransferCaches(queryClient, nextTarget);
      candidate.mutate(nextTarget);
    },
  });

  if (!issueEligible) return null;

  const reviewedTarget =
    target &&
    candidate.variables &&
    candidate.data &&
    issueTransferStatusIdentityMatches(candidate.data, target)
      ? target
      : null;
  const canTransfer = Boolean(reviewedTarget && candidate.data?.viewerCanTransfer);
  const busy = candidate.isPending || mutation.isPending;
  const candidateError = candidate.error ? parseIpcError(candidate.error) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) setOpen(nextOpen);
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowRightLeft data-icon="inline-start" />
        {t("workspace.repositories.transferIssue")}
      </Button>
      <DialogContent showCloseButton={!busy}>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (reviewedTarget && canTransfer) mutation.mutate(reviewedTarget);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.transferIssue")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.transferIssueDescription", {
                issue: `#${issue.number}`,
              })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalidRepository || undefined}>
              <FieldLabel htmlFor={repositoryId}>
                {t("workspace.repositories.targetRepository")}
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={repositoryId}
                  autoComplete="off"
                  value={value}
                  aria-invalid={invalidRepository || undefined}
                  disabled={busy}
                  placeholder="owner/repository"
                  onChange={(event) => {
                    setValue(event.target.value);
                    candidate.reset();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!target || invalidRepository || busy}
                  onClick={() => {
                    if (target) candidate.mutate(target);
                  }}
                >
                  {candidate.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Search data-icon="inline-start" />
                  )}
                  {t(
                    candidate.isPending
                      ? "workspace.repositories.checkingTransferTarget"
                      : "workspace.repositories.checkTransferTarget"
                  )}
                </Button>
              </div>
              <FieldDescription>
                {invalidRepository
                  ? t("workspace.repositories.invalidTargetRepository")
                  : t("workspace.repositories.targetRepositoryDescription")}
              </FieldDescription>
            </Field>
            {candidateError ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>
                  {t(
                    candidateError.code === "githubRateLimited"
                      ? "workspace.repositories.githubRateLimited"
                      : "workspace.repositories.issueTransferTargetLoadFailed"
                  )}
                </AlertTitle>
                <AlertDescription>{candidateError.message}</AlertDescription>
              </Alert>
            ) : null}
            {candidate.data && reviewedTarget && !candidate.data.viewerCanTransfer ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.issueTransferUnavailable")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.issueTransferUnavailableDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
            {candidate.data && reviewedTarget && canTransfer ? (
              <Alert>
                <ArrowRightLeft />
                <AlertTitle>{candidate.data.targetRepositoryFullName}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.transferIssueConfirmDescription", {
                    issue: `#${issue.number}`,
                    repository: candidate.data.targetRepositoryFullName,
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canTransfer || mutation.isPending}>
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ArrowRightLeft data-icon="inline-start" />
              )}
              {t(
                mutation.isPending
                  ? "workspace.repositories.transferringIssue"
                  : "workspace.repositories.confirmTransferIssue"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
