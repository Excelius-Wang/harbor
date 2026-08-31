import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
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
  type GitHubIssueRelationshipMutationTarget,
} from "./github-issue-relationship-mutations";

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
