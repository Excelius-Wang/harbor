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
import type { GitHubRelease, GitHubRepositoryContentContext } from "./github-data";
import { GitHubReleaseForm } from "./github-release-form";
import {
  invalidateRepositoryReleases,
  syncUpdatedRelease,
  updateRepositoryRelease,
} from "./github-release-mutations";

export function GitHubReleaseEditDialog({
  repository,
  release,
  open,
  onOpenChange,
}: {
  repository: GitHubRepositoryContentContext;
  release: GitHubRelease;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = {
    owner: repository.owner,
    repository: repository.name,
    releaseId: release.id,
  };
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updateRepositoryRelease>[1]) =>
      updateRepositoryRelease(target, input),
    onSuccess: (updated) => {
      syncUpdatedRelease(queryClient, target, updated);
      toast.success(t("workspace.repositories.releaseUpdated"));
      onOpenChange(false);
      void invalidateRepositoryReleases(queryClient, target, release.id);
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
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.editRelease")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.editReleaseDescription", { tag: release.tagName })}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <GitHubReleaseForm
            repository={repository}
            idPrefix={`github-edit-release-${release.id}`}
            mode="edit"
            immutable={release.immutable}
            initialValue={{
              tagName: release.tagName,
              targetCommitish: release.targetCommitish,
              name: release.name ?? "",
              body: release.body ?? "",
              draft: release.draft,
              prerelease: release.prerelease,
            }}
            pending={mutation.isPending}
            errorMessage={
              error?.code === "githubPermission"
                ? t("workspace.repositories.releaseWritePermissionDenied")
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
