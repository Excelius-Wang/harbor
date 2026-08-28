import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubRelease, GitHubRepositoryContentContext } from "./github-data";
import { GitHubReleaseForm } from "./github-release-form";
import {
  createRepositoryRelease,
  invalidateRepositoryReleases,
  syncCreatedRelease,
} from "./github-release-mutations";

export function GitHubReleaseCreate({
  repository,
  onCancel,
  onCreated,
}: {
  repository: GitHubRepositoryContentContext;
  onCancel: () => void;
  onCreated: (release: GitHubRelease) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createRepositoryRelease>[1]) =>
      createRepositoryRelease(target, input),
    onSuccess: (release) => {
      syncCreatedRelease(queryClient, target, release);
      toast.success(
        t(
          release.draft
            ? "workspace.repositories.releaseDraftSaved"
            : "workspace.repositories.releasePublished"
        )
      );
      onCreated(release);
      void invalidateRepositoryReleases(queryClient, target, release.id);
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft data-icon="inline-start" />
          {t("workspace.repositories.backToReleases")}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[780px] px-4 py-5 sm:px-5">
          <header className="mb-5">
            <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em]">
              {t("workspace.repositories.newRelease")}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {t("workspace.repositories.newReleaseDescription", {
                repository: `${repository.owner}/${repository.name}`,
              })}
            </p>
          </header>
          <section className="bg-card/25 rounded-lg border p-4 sm:p-5">
            <GitHubReleaseForm
              repository={repository}
              idPrefix="github-new-release"
              mode="create"
              initialValue={{
                tagName: "",
                targetCommitish: repository.defaultBranch,
                name: "",
                body: "",
                draft: true,
                prerelease: false,
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
              onCancel={onCancel}
            />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
