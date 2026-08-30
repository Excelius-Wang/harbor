import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubIssue,
  GitHubIssueContactLink,
  GitHubIssueTemplate,
  GitHubRepository,
} from "./github-data";
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

const BLANK_ISSUE_TEMPLATE_VALUE = "__blank_issue__";

type IssueExternalLink = {
  key: string;
  name: string;
  about: string;
  url: string;
  screenReaderLabel?: string;
};

function IssueExternalLinks({ links }: { links: IssueExternalLink[] }) {
  if (links.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {links.map((link) => (
        <Button
          key={link.key}
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-2 text-left"
          onClick={() => void openExternalUrl(link.url)}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{link.name}</span>
            {link.about ? (
              <span className="text-muted-foreground block truncate text-[11px] font-normal">
                {link.about}
              </span>
            ) : null}
          </span>
          <ExternalLink data-icon="inline-end" />
          {link.screenReaderLabel ? (
            <span className="sr-only">{link.screenReaderLabel}</span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}

function issueTemplateExternalLinks(templates: GitHubIssueTemplate[]): IssueExternalLink[] {
  return templates
    .filter((template) => template.kind !== "markdown")
    .map((template) => ({
      key: template.path,
      name: template.name,
      about: template.about,
      url: template.templateUrl,
    }));
}

function IssueTemplatePicker({
  blankIssueAllowed,
  templates,
  value,
  onValueChange,
}: {
  blankIssueAllowed: boolean;
  templates: GitHubIssueTemplate[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const markdownTemplates = templates.filter((template) => template.kind === "markdown");
  const externalTemplateLinks = issueTemplateExternalLinks(templates).map((link) => ({
    ...link,
    screenReaderLabel: t("workspace.repositories.openIssueTemplate", { template: link.name }),
  }));
  const selectedTemplate = markdownTemplates.find((template) => template.path === value);

  if (markdownTemplates.length === 0 && templates.length === 0) return null;

  return (
    <Card className="mb-4 gap-4 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{t("workspace.repositories.issueTemplate")}</CardTitle>
        <CardDescription className="text-xs">
          {selectedTemplate?.about ?? t("workspace.repositories.issueTemplateDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {markdownTemplates.length > 0 ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="github-new-issue-template">
                {t("workspace.repositories.issueTemplate")}
              </FieldLabel>
              <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger id="github-new-issue-template" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {blankIssueAllowed ? (
                      <SelectItem value={BLANK_ISSUE_TEMPLATE_VALUE}>
                        {t("workspace.repositories.blankIssue")}
                      </SelectItem>
                    ) : null}
                    {markdownTemplates.map((template) => (
                      <SelectItem key={template.path} value={template.path}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        ) : null}
        {templates.some((template) => template.kind !== "markdown") ? (
          <CardDescription className="text-xs">
            {t("workspace.repositories.issueTemplateGitHubOnly")}
          </CardDescription>
        ) : null}
        <IssueExternalLinks links={externalTemplateLinks} />
      </CardContent>
    </Card>
  );
}

function IssueTemplateFallback({
  templateChooserUrl,
  contactLinks,
  templates,
}: {
  templateChooserUrl: string;
  contactLinks: GitHubIssueContactLink[];
  templates: GitHubIssueTemplate[];
}) {
  const { t } = useTranslation();
  const externalTemplateLinks = issueTemplateExternalLinks(templates);
  const externalLinks = [
    ...externalTemplateLinks.map((link) => ({
      ...link,
      screenReaderLabel: t("workspace.repositories.openIssueTemplate", { template: link.name }),
    })),
    ...contactLinks.map((link) => ({
      key: `${link.name}:${link.url}`,
      name: link.name,
      about: link.about,
      url: link.url,
    })),
  ];

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
        <IssueExternalLinks links={externalLinks} />
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
  const policy = policyResult.data;
  const markdownTemplates =
    policy?.templates.filter((template) => template.kind === "markdown") ?? [];
  const defaultTemplateValue = policy?.blankIssueAllowed
    ? BLANK_ISSUE_TEMPLATE_VALUE
    : (markdownTemplates[0]?.path ?? BLANK_ISSUE_TEMPLATE_VALUE);
  const [selectedTemplateValue, setSelectedTemplateValue] = useState<string>();
  useEffect(() => {
    setSelectedTemplateValue(undefined);
  }, [repository.name, repository.owner]);
  const selectedMarkdownTemplate = markdownTemplates.find(
    (template) => template.path === selectedTemplateValue
  );
  const templateValue =
    selectedTemplateValue === BLANK_ISSUE_TEMPLATE_VALUE && policy?.blankIssueAllowed
      ? BLANK_ISSUE_TEMPLATE_VALUE
      : (selectedMarkdownTemplate?.path ?? defaultTemplateValue);
  const selectedTemplate = markdownTemplates.find((template) => template.path === templateValue);
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) =>
      createRepositoryIssue(
        target,
        title,
        body,
        selectedTemplate
          ? { labels: selectedTemplate.labels, assignees: selectedTemplate.assignees }
          : undefined
      ),
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
          ) : !policyResult.data.blankIssueAllowed && markdownTemplates.length === 0 ? (
            <IssueTemplateFallback {...policyResult.data} />
          ) : (
            <section className="bg-card/25 rounded-lg border p-4 sm:p-5">
              <IssueTemplatePicker
                blankIssueAllowed={policyResult.data.blankIssueAllowed}
                templates={policyResult.data.templates}
                value={templateValue}
                onValueChange={setSelectedTemplateValue}
              />
              <GitHubIssueForm
                key={templateValue}
                repository={repository}
                idPrefix="github-new-issue"
                initialValue={{
                  title: selectedTemplate?.defaultTitle ?? "",
                  body: selectedTemplate?.body ?? "",
                }}
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
