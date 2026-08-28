import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssue, GitHubRepository } from "./github-data";
import { GitHubIssueForm, type GitHubIssueFormValue } from "./github-issue-form";
import {
  createRepositoryIssue,
  invalidateRepositoryIssue,
  syncCreatedIssue,
} from "./github-issue-mutations";

export function GitHubIssueCreate({
  repository,
  onCancel,
  onCreated,
}: {
  repository: GitHubRepository;
  onCancel: () => void;
  onCreated: (issue: GitHubIssue) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) =>
      createRepositoryIssue(target, title, body),
    onSuccess: (issue) => {
      syncCreatedIssue(queryClient, target, issue);
      toast.success(t("workspace.repositories.issueCreated"));
      onCreated(issue);
      void invalidateRepositoryIssue(queryClient, { ...target, issueNumber: issue.number });
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <div className="@container/issues flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft data-icon="inline-start" />
          {t("workspace.repositories.backToIssues")}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[780px] px-4 py-5 sm:px-5">
          <header className="mb-5">
            <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em]">
              {t("workspace.repositories.newIssue")}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {t("workspace.repositories.newIssueDescription", {
                repository: repository.fullName,
              })}
            </p>
          </header>
          <section className="bg-card/25 rounded-lg border p-4 sm:p-5">
            <GitHubIssueForm
              repository={repository}
              idPrefix="github-new-issue"
              initialValue={{ title: "", body: "" }}
              submitLabel={t("workspace.repositories.createIssue")}
              pendingLabel={t("workspace.repositories.creatingIssue")}
              pending={mutation.isPending}
              errorTitle={t("workspace.repositories.createIssueFailed")}
              errorMessage={
                error?.code === "githubPermission"
                  ? t("workspace.repositories.issueWritePermissionDenied")
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
