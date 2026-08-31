import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Search } from "lucide-react";
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
  markRepositoryIssueDuplicate,
  refreshRepositoryIssueDuplicate,
} from "./github-issue-duplicate-mutations";
import { syncUpdatedIssue } from "./github-issue-mutations";
import { parseGitHubIssueNumber } from "./github-issue-relationship-mutations";
import { normalizeIssueStateReason } from "./github-issue-state";
import {
  issueStateCapabilitiesMatchIssue,
  issueStateCapabilitiesQueryOptions,
} from "./github-issue-state-queries";
import { repositoryIssueDetailQueryOptions } from "./github-queries";

function markDuplicateErrorTitle(code: string) {
  if (code === "githubPermission")
    return "workspace.repositories.issueDuplicateMarkPermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  if (code === "githubIssueStateConflict") return "workspace.repositories.issueStateChanged";
  return "workspace.repositories.issueDuplicateUpdateFailed";
}

export function GitHubIssueMarkDuplicateAction({
  repository,
  issue,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const issueNumberId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const issueTarget = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
  };
  const mutationTarget = {
    ...issueTarget,
    expectedIssueNodeId: issue.reactionSubject.id,
  };
  const eligibleIssue = issue.state === "open" && Boolean(issue.reactionSubject.id.trim());
  const capabilityResult = useQuery({
    ...issueStateCapabilitiesQueryOptions(issueTarget, issue.updatedAt),
    enabled: eligibleIssue,
  });
  const canonicalIssueNumber = parseGitHubIssueNumber(value);
  const invalidCanonical =
    value.trim().length > 0 && (!canonicalIssueNumber || canonicalIssueNumber === issue.number);
  const candidate = useMutation({
    mutationFn: (issueNumber: number) =>
      queryClient.fetchQuery(
        repositoryIssueDetailQueryOptions({
          owner: repository.owner,
          repository: repository.name,
          issueNumber,
          timelinePage: 1,
        })
      ),
  });
  const mutation = useMutation({
    mutationFn: (issueNumber: number) => markRepositoryIssueDuplicate(mutationTarget, issueNumber),
    onSuccess: (updatedIssue) => {
      syncUpdatedIssue(queryClient, issueTarget, updatedIssue);
      setOpen(false);
      setValue("");
      candidate.reset();
      toast.success(t("workspace.repositories.issueDuplicateMarked"));
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(markDuplicateErrorTitle(parsed.code)), { description: parsed.message });
    },
    onSettled: (_data, _error, issueNumber) => {
      if (!issueNumber) return;
      void refreshRepositoryIssueDuplicate(queryClient, mutationTarget, {
        owner: repository.owner,
        repository: repository.name,
        issueNumber,
      });
    },
  });
  const capabilities = capabilityResult.data;
  const canMark =
    eligibleIssue &&
    capabilities?.viewerCanClose === true &&
    issueStateCapabilitiesMatchIssue(capabilities, issue, issueTarget);

  if (!eligibleIssue) return null;

  if (capabilityResult.isPending || capabilityResult.isFetching) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Spinner data-icon="inline-start" />
        {t("workspace.repositories.markIssueDuplicateLoading")}
      </Button>
    );
  }

  if (!canMark) return null;

  const previewIssue =
    candidate.data && candidate.variables === canonicalIssueNumber ? candidate.data.issue : null;
  const candidateIsDuplicate = normalizeIssueStateReason(previewIssue?.stateReason) === "duplicate";
  const candidateIssue = previewIssue && !candidateIsDuplicate ? previewIssue : null;
  const candidateError = candidate.error ? parseIpcError(candidate.error) : null;
  const busy = candidate.isPending || mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) setOpen(nextOpen);
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy data-icon="inline-start" />
        {t("workspace.repositories.markIssueDuplicate")}
      </Button>
      <DialogContent showCloseButton={!busy}>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (candidateIssue && canonicalIssueNumber) mutation.mutate(canonicalIssueNumber);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.markIssueDuplicate")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.markIssueDuplicateDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalidCanonical || undefined}>
              <FieldLabel htmlFor={issueNumberId}>
                {t("workspace.repositories.canonicalIssueNumber")}
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={issueNumberId}
                  inputMode="numeric"
                  autoComplete="off"
                  value={value}
                  aria-invalid={invalidCanonical || undefined}
                  disabled={busy}
                  placeholder="42"
                  onChange={(event) => {
                    setValue(event.target.value);
                    candidate.reset();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canonicalIssueNumber || invalidCanonical || busy}
                  onClick={() => {
                    if (canonicalIssueNumber) candidate.mutate(canonicalIssueNumber);
                  }}
                >
                  {candidate.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Search data-icon="inline-start" />
                  )}
                  {t(
                    candidate.isPending
                      ? "workspace.repositories.reviewingDuplicateTarget"
                      : "workspace.repositories.reviewDuplicateTarget"
                  )}
                </Button>
              </div>
              <FieldDescription>
                {invalidCanonical
                  ? t("workspace.repositories.invalidCanonicalIssueNumber")
                  : t("workspace.repositories.canonicalIssueNumberDescription")}
              </FieldDescription>
            </Field>
            {candidateError ? (
              <Alert variant="destructive">
                <AlertTitle>
                  {t(
                    candidateError.code === "githubRateLimited"
                      ? "workspace.repositories.githubRateLimited"
                      : "workspace.repositories.duplicateTargetLoadFailed"
                  )}
                </AlertTitle>
                <AlertDescription>{candidateError.message}</AlertDescription>
              </Alert>
            ) : null}
            {candidateIsDuplicate ? (
              <Alert variant="destructive">
                <AlertTitle>{t("workspace.repositories.duplicateTargetIsDuplicate")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.duplicateTargetIsDuplicateDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
            {candidateIssue ? (
              <Alert>
                <Copy />
                <AlertTitle>{candidateIssue.title}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.markIssueDuplicateConfirmDescription", {
                    issue: `#${candidateIssue.number}`,
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
            <Button
              type="submit"
              disabled={!candidateIssue || !canonicalIssueNumber || mutation.isPending}
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              {t(
                mutation.isPending
                  ? "workspace.repositories.markingIssueDuplicate"
                  : "workspace.repositories.markIssueDuplicateConfirm"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
