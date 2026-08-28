import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, GitBranch, LockKeyhole, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { parseIpcError } from "@/lib/ipc-error";
import { createRepositoryBranch, deleteRepositoryBranch } from "./github-code-mutations";
import type { GitHubBranch, GitHubRepository } from "./github-data";

export function GitHubCodeCreateBranchDialog({
  open,
  repository,
  branches,
  initialSource,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  repository: GitHubRepository;
  branches: GitHubBranch[];
  initialSource: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (branch: GitHubBranch) => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState(initialSource);
  const [branch, setBranch] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const sourceBranch = useMemo(
    () => branches.find((candidate) => candidate.name === source) ?? branches[0] ?? null,
    [branches, source]
  );

  useEffect(() => {
    if (!open) return;
    setSource(
      branches.some((candidate) => candidate.name === initialSource)
        ? initialSource
        : (branches[0]?.name ?? "")
    );
    setBranch("");
    setSubmitted(false);
  }, [branches, initialSource, open]);

  const mutation = useMutation({
    mutationFn: () =>
      createRepositoryBranch(
        { owner: repository.owner, repository: repository.name },
        sourceBranch!.name,
        sourceBranch!.sha,
        branch.trim()
      ),
    onSuccess: onCreated,
  });
  const branchExists = branches.some((candidate) => candidate.name === branch.trim());
  const branchInvalid = submitted && (!branch.trim() || branchExists);
  const error = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.createBranch")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.createBranchDescription", {
              repository: repository.fullName,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          id="github-code-create-branch-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (!sourceBranch || !branch.trim() || branchExists || mutation.isPending) return;
            mutation.mutate();
          }}
        >
          <FieldGroup className="gap-5">
            <Field data-disabled={mutation.isPending || !branches.length}>
              <FieldLabel htmlFor="github-code-source-branch">
                {t("workspace.repositories.sourceBranch")}
              </FieldLabel>
              <Select value={source} onValueChange={setSource} disabled={mutation.isPending}>
                <SelectTrigger id="github-code-source-branch">
                  <SelectValue placeholder={t("workspace.repositories.selectSourceBranch")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {branches.map((candidate) => (
                      <SelectItem key={candidate.name} value={candidate.name}>
                        <GitBranch />
                        {candidate.name}
                        {candidate.protected ? <LockKeyhole /> : null}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {sourceBranch
                  ? t("workspace.repositories.sourceBranchRevision", {
                      sha: sourceBranch.sha.slice(0, 7),
                    })
                  : t("workspace.repositories.sourceBranchRequired")}
              </FieldDescription>
            </Field>
            <Field data-invalid={branchInvalid} data-disabled={mutation.isPending}>
              <FieldLabel htmlFor="github-code-new-branch">
                {t("workspace.repositories.newBranchName")}
              </FieldLabel>
              <Input
                id="github-code-new-branch"
                value={branch}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                aria-invalid={branchInvalid}
                disabled={mutation.isPending}
                placeholder={t("workspace.repositories.newBranchNamePlaceholder")}
                onChange={(event) => setBranch(event.target.value)}
              />
              <FieldDescription>
                {t("workspace.repositories.newBranchNameDescription")}
              </FieldDescription>
              <FieldError>
                {branchInvalid
                  ? branchExists
                    ? t("workspace.repositories.branchAlreadyExists")
                    : t("workspace.repositories.newBranchNameRequired")
                  : null}
              </FieldError>
            </Field>
            {error ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.branchCreateFailed")}</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button
            type="submit"
            form="github-code-create-branch-form"
            disabled={mutation.isPending || !sourceBranch || !branch.trim() || branchExists}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <GitBranch data-icon="inline-start" />
            )}
            {mutation.isPending
              ? t("workspace.repositories.creatingBranch")
              : t("workspace.repositories.createBranch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GitHubCodeDeleteBranchDialog({
  open,
  repository,
  branch,
  onOpenChange,
  onDeleted,
}: {
  open: boolean;
  repository: GitHubRepository;
  branch: GitHubBranch;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationFn: () =>
      deleteRepositoryBranch(
        { owner: repository.owner, repository: repository.name },
        branch.name,
        branch.sha
      ),
    onSuccess: onDeleted,
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace.repositories.deleteBranchTitle", { branch: branch.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.repositories.deleteBranchDescription", {
              branch: branch.name,
              sha: branch.sha.slice(0, 7),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {branch.protected ? (
          <Alert>
            <LockKeyhole />
            <AlertTitle>{t("workspace.repositories.protectedBranchTitle")}</AlertTitle>
            <AlertDescription>
              {t("workspace.repositories.protectedBranchDeleteDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.branchDeleteFailed")}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("workspace.repositories.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
            {mutation.isPending
              ? t("workspace.repositories.deletingBranch")
              : t("workspace.repositories.deleteBranch")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
