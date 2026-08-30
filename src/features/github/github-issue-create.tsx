import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubIssue, GitHubIssueContactLink, GitHubRepository } from "./github-data";
import { issueCreationPolicyQueryOptions } from "./github-issue-creation-policy-queries";
import { GitHubIssueForm, type GitHubIssueFormValue } from "./github-issue-form";
import {
  createRepositoryIssue,
  invalidateRepositoryIssue,
  syncCreatedIssue,
} from "./github-issue-mutations";

function IssueCreationPolicySkeleton() {
  return (
    <Card className="gap-3 py-4 shadow-none" aria-live="polite" role="status">
      <CardHeader className="px-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-full" />
      </CardHeader>
      <CardContent className="px-4">
        <Skeleton className="h-9 w-40" />
      </CardContent>
    </Card>
  );
}

function IssueTemplateFallback({
  templateChooserUrl,
  contactLinks,
}: {
  templateChooserUrl: string;
  contactLinks: GitHubIssueContactLink[];
}) {
  const { t } = useTranslation();

  return (
    <Card className="gap-4 py-5 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">
          {t("workspace.repositories.issueTemplatesRequired")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("workspace.repositories.issueTemplatesRequiredDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        <Button type="button" onClick={() => void openExternalUrl(templateChooserUrl)}>
          <ExternalLink data-icon="inline-start" />
          {t("workspace.repositories.openIssueTemplates")}
        </Button>
        {contactLinks.map((link) => (
          <Button
            key={`${link.name}:${link.url}`}
            type="button"
            variant="outline"
            className="h-auto justify-start px-3 py-2 text-left"
            onClick={() => void openExternalUrl(link.url)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{link.name}</span>
              <span className="text-muted-foreground block truncate text-[11px] font-normal">
                {link.about}
              </span>
            </span>
            <ExternalLink data-icon="inline-end" />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function IssueCreationPolicyError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">{message}</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" />
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

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
  const policyResult = useQuery(issueCreationPolicyQueryOptions(target));
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
  const policyError = policyResult.error ? parseIpcError(policyResult.error) : null;

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
          {policyResult.isPending ? (
            <IssueCreationPolicySkeleton />
          ) : !policyResult.data ? (
            <IssueCreationPolicyError
              title={t(
                policyError?.code === "githubPermission"
                  ? "workspace.repositories.issueCreationPolicyPermissionDenied"
                  : "workspace.repositories.issueCreationPolicyLoadFailed"
              )}
              message={
                policyError?.message ?? t("workspace.repositories.issueCreationPolicyLoadFailed")
              }
              onRetry={() => void policyResult.refetch()}
            />
          ) : !policyResult.data.blankIssueAllowed ? (
            <IssueTemplateFallback {...policyResult.data} />
          ) : (
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
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
