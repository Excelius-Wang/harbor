import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2Off, Plus } from "lucide-react";
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
import type { GitHubIssueSummary } from "./github-data";
import {
  addRepositoryIssueDependency,
  parseGitHubIssueUrl,
  refreshRepositoryIssueDependencies,
  removeRepositoryIssueDependency,
  type GitHubIssueDependencyMutationTarget,
} from "./github-issue-dependency-mutations";

function dependencyErrorTitle(code: string) {
  if (code === "githubPermission")
    return "workspace.repositories.issueDependencyWritePermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.issueDependencyUpdateFailed";
}

export function GitHubIssueAddDependencyAction({
  target,
}: {
  target: GitHubIssueDependencyMutationTarget;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const issueUrlId = useId();
  const [open, setOpen] = useState(false);
  const [issueUrl, setIssueUrl] = useState("");
  const blockingIssue = parseGitHubIssueUrl(issueUrl);
  const hasInvalidIssueUrl = issueUrl.trim().length > 0 && !blockingIssue;
  const mutation = useMutation({
    mutationFn: () =>
      blockingIssue
        ? addRepositoryIssueDependency(target, blockingIssue)
        : Promise.reject(new Error("invalid dependency Issue URL")),
    onSuccess: () => {
      setOpen(false);
      setIssueUrl("");
      void refreshRepositoryIssueDependencies(queryClient, target);
      toast.success(t("workspace.repositories.dependencyAdded"));
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(dependencyErrorTitle(parsed.code)), { description: parsed.message });
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
        {t("workspace.repositories.addDependency")}
      </Button>
      <DialogContent showCloseButton={!mutation.isPending}>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (blockingIssue) mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.addDependency")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.addDependencyDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={hasInvalidIssueUrl || undefined}>
              <FieldLabel htmlFor={issueUrlId}>
                {t("workspace.repositories.dependencyIssueUrl")}
              </FieldLabel>
              <Input
                id={issueUrlId}
                type="url"
                autoComplete="off"
                value={issueUrl}
                aria-invalid={hasInvalidIssueUrl || undefined}
                disabled={mutation.isPending}
                placeholder="https://github.com/owner/repository/issues/42"
                onChange={(event) => setIssueUrl(event.target.value)}
              />
              <FieldDescription>
                {hasInvalidIssueUrl
                  ? t("workspace.repositories.invalidDependencyIssueUrl")
                  : t("workspace.repositories.dependencyIssueUrlDescription")}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={mutation.isPending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!blockingIssue || mutation.isPending}>
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {t(
                mutation.isPending
                  ? "workspace.repositories.addingDependency"
                  : "workspace.repositories.addDependencyConfirm"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GitHubIssueRemoveDependencyAction({
  target,
  dependency,
}: {
  target: GitHubIssueDependencyMutationTarget;
  dependency: GitHubIssueSummary;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => removeRepositoryIssueDependency(target, dependency.issue.id),
    onSuccess: () => {
      setOpen(false);
      void refreshRepositoryIssueDependencies(queryClient, target);
      toast.success(t("workspace.repositories.dependencyRemoved"));
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t(dependencyErrorTitle(parsed.code)), { description: parsed.message });
    },
  });
  const dependencyLabel = `${dependency.repository.fullName} #${dependency.issue.number}`;

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
        aria-label={t("workspace.repositories.removeDependency")}
        disabled={mutation.isPending}
        onClick={() => setOpen(true)}
      >
        <Link2Off />
      </Button>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("workspace.repositories.removeDependencyConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.removeDependencyDescription", {
              issue: dependencyLabel,
            })}
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
                ? "workspace.repositories.removingDependency"
                : "workspace.repositories.removeDependencyConfirm"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
