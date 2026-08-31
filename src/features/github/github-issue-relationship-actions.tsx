import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Link2Off, Plus } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
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
import {
  addRepositoryIssueSubIssue,
  parseGitHubIssueNumber,
  refreshRepositoryIssueRelationships,
  removeRepositoryIssueSubIssue,
  reprioritizeRepositoryIssueSubIssue,
  type GitHubIssueRelationshipMutationTarget,
} from "./github-issue-relationship-mutations";
import type { GitHubIssueSummary } from "./github-data";

function relationshipErrorTitle(code: string) {
  if (code === "githubPermission")
    return "workspace.repositories.issueRelationshipWritePermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.issueRelationshipUpdateFailed";
}

export function GitHubIssueAddSubIssueAction({
  target,
}: {
  target: GitHubIssueRelationshipMutationTarget;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const issueNumberId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const subIssueNumber = parseGitHubIssueNumber(value);
  const hasInvalidIssueNumber = value.trim().length > 0 && !subIssueNumber;
  const mutation = useMutation({
    mutationFn: () =>
      subIssueNumber
        ? addRepositoryIssueSubIssue(target, subIssueNumber)
        : Promise.reject(new Error("invalid sub-issue number")),
    onSuccess: () => {
      setOpen(false);
      setValue("");
      void refreshRepositoryIssueRelationships(
        queryClient,
        target,
        subIssueNumber ?? target.issueNumber
      );
      toast.success(t("workspace.repositories.subIssueAdded"));
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(relationshipErrorTitle(parsed.code)), { description: parsed.message });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!mutation.isPending) setOpen(nextOpen);
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={mutation.isPending}
        onClick={() => setOpen(true)}
      >
        <Plus data-icon="inline-start" />
        {t("workspace.repositories.addSubIssue")}
      </Button>
      <DialogContent showCloseButton={!mutation.isPending}>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (subIssueNumber) mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.addSubIssue")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.addSubIssueDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={hasInvalidIssueNumber || undefined}>
              <FieldLabel htmlFor={issueNumberId}>
                {t("workspace.repositories.subIssueNumber")}
              </FieldLabel>
              <Input
                id={issueNumberId}
                inputMode="numeric"
                autoComplete="off"
                value={value}
                aria-invalid={hasInvalidIssueNumber || undefined}
                disabled={mutation.isPending}
                placeholder="42"
                onChange={(event) => setValue(event.target.value)}
              />
              <FieldDescription>
                {hasInvalidIssueNumber
                  ? t("workspace.repositories.invalidSubIssueNumber")
                  : t("workspace.repositories.subIssueNumberDescription")}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={mutation.isPending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!subIssueNumber || mutation.isPending}>
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {t(
                mutation.isPending
                  ? "workspace.repositories.addingSubIssue"
                  : "workspace.repositories.addSubIssueConfirm"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GitHubIssueRemoveSubIssueAction({
  target,
  subIssue,
}: {
  target: GitHubIssueRelationshipMutationTarget;
  subIssue: GitHubIssueSummary;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const subIssueNumber = subIssue.issue.number;
  const mutation = useMutation({
    mutationFn: () => removeRepositoryIssueSubIssue(target, subIssueNumber),
    onSuccess: () => {
      setOpen(false);
      toast.success(t("workspace.repositories.subIssueRemoved"));
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(relationshipErrorTitle(parsed.code)), { description: parsed.message });
    },
    onSettled: () => {
      void refreshRepositoryIssueRelationships(queryClient, target, subIssueNumber);
    },
  });
  const subIssueLabel = `${subIssue.repository.fullName} #${subIssueNumber}`;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!mutation.isPending) setOpen(nextOpen);
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("workspace.repositories.removeSubIssue")}
        disabled={mutation.isPending}
        onClick={() => setOpen(true)}
      >
        <Link2Off />
      </Button>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("workspace.repositories.removeSubIssueConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.removeSubIssueDescription", { issue: subIssueLabel })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Link2Off data-icon="inline-start" />
            )}
            {t(
              mutation.isPending
                ? "workspace.repositories.removingSubIssue"
                : "workspace.repositories.removeSubIssueConfirm"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GitHubIssueReorderSubIssueActions({
  target,
  page,
  subIssue,
  previousSubIssue,
  nextSubIssue,
}: {
  target: GitHubIssueRelationshipMutationTarget;
  page: number;
  subIssue: GitHubIssueSummary;
  previousSubIssue?: GitHubIssueSummary;
  nextSubIssue?: GitHubIssueSummary;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const subIssueNumber = subIssue.issue.number;
  const mutation = useMutation({
    mutationFn: ({
      relativeIssueNumber,
      placement,
    }: {
      relativeIssueNumber: number;
      placement: "before" | "after";
    }) =>
      reprioritizeRepositoryIssueSubIssue(
        target,
        page,
        subIssueNumber,
        relativeIssueNumber,
        placement
      ),
    onSuccess: () => {
      toast.success(t("workspace.repositories.subIssueMoved"));
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(relationshipErrorTitle(parsed.code)), { description: parsed.message });
    },
    onSettled: () => {
      void refreshRepositoryIssueRelationships(queryClient, target, subIssueNumber);
    },
  });

  if (!previousSubIssue && !nextSubIssue) return null;

  return (
    <div className="flex shrink-0 items-center">
      {previousSubIssue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${t("workspace.repositories.moveSubIssueUp")} ${subIssueNumber}`}
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              relativeIssueNumber: previousSubIssue.issue.number,
              placement: "before",
            })
          }
        >
          {mutation.isPending && mutation.variables?.placement === "before" ? (
            <Spinner />
          ) : (
            <ArrowUp />
          )}
        </Button>
      ) : null}
      {nextSubIssue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${t("workspace.repositories.moveSubIssueDown")} ${subIssueNumber}`}
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              relativeIssueNumber: nextSubIssue.issue.number,
              placement: "after",
            })
          }
        >
          {mutation.isPending && mutation.variables?.placement === "after" ? (
            <Spinner />
          ) : (
            <ArrowDown />
          )}
        </Button>
      ) : null}
    </div>
  );
}
