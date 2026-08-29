import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  GitCompareArrows,
  GitCommitHorizontal,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { GitHubCommitDetail } from "./github-commit-detail";
import { GitHubCommitList } from "./github-commit-list";
import type {
  GitHubPullRequest,
  GitHubPullRequestComparison,
  GitHubRepository,
} from "./github-data";
import { GitHubTitleBodyForm, type GitHubIssueFormValue } from "./github-issue-form";
import {
  createRepositoryPullRequest,
  invalidateRepositoryPullRequest,
  syncCreatedPullRequest,
} from "./github-pull-request-mutations";
import { pullRequestComparisonQueryOptions, repositoryCodeQueryOptions } from "./github-queries";

function PullRequestComparisonSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-3/4" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}

function PullRequestComparisonSummary({
  comparison,
  repository,
}: {
  comparison: GitHubPullRequestComparison;
  repository: GitHubRepository;
}) {
  const { t } = useTranslation();
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);
  if (selectedCommitSha) {
    return (
      <GitHubCommitDetail
        repository={repository}
        commitSha={selectedCommitSha}
        onBack={() => setSelectedCommitSha(null)}
        onSelectCommit={setSelectedCommitSha}
      />
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitCompareArrows />
          {t("workspace.repositories.pullRequestComparisonReady")}
        </CardTitle>
        <CardDescription>
          {t("workspace.repositories.pullRequestComparisonDescription", {
            head: comparison.head,
            base: comparison.base,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <GitCommitHorizontal />
            {t("workspace.repositories.pullRequestAheadBy", {
              count: comparison.aheadBy,
            })}
          </Badge>
          <Badge variant="outline">
            {t("workspace.repositories.changedFileCount", {
              count: comparison.changedFiles,
            })}
          </Badge>
          <Badge variant="outline" className="text-success">
            +{comparison.additions}
          </Badge>
          <Badge variant="outline" className="text-destructive">
            -{comparison.deletions}
          </Badge>
          {comparison.behindBy > 0 ? (
            <Badge variant="outline">
              {t("workspace.repositories.pullRequestComparisonBehind", {
                count: comparison.behindBy,
              })}
            </Badge>
          ) : null}
        </div>
        {comparison.commits.length ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-[10px] font-medium tracking-[0.08em] uppercase">
                {t("workspace.repositories.pullRequestComparisonCommits")}
              </p>
              <GitHubCommitList
                commits={comparison.commits}
                onSelectCommit={setSelectedCommitSha}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function comparisonErrorMessage(
  code: string,
  message: string,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (code === "githubPermission") {
    return t("workspace.repositories.pullRequestCreatePermissionDenied");
  }
  if (code === "githubPullRequestCreationConflict") {
    return t("workspace.repositories.pullRequestCreateConflict");
  }
  if (code === "githubRateLimited") {
    return t("workspace.repositories.githubRateLimited");
  }
  return message;
}

export function GitHubPullRequestCreate({
  repository,
  onCancel,
  onCreated,
}: {
  repository: GitHubRepository;
  onCancel: () => void;
  onCreated: (pullRequest: GitHubPullRequest) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [base, setBase] = useState(repository.defaultBranch);
  const [head, setHead] = useState("");
  const [draft, setDraft] = useState(false);
  const repositoryTarget = { owner: repository.owner, repository: repository.name };
  const branchesResult = useQuery(
    repositoryCodeQueryOptions({
      ...repositoryTarget,
      reference: repository.defaultBranch,
    })
  );
  const branches = useMemo(
    () => branchesResult.data?.branches.map((branch) => branch.name) ?? [],
    [branchesResult.data?.branches]
  );

  useEffect(() => {
    if (!branches.length) return;
    setBase((current) =>
      branches.includes(current)
        ? current
        : branches.includes(repository.defaultBranch)
          ? repository.defaultBranch
          : branches[0]
    );
  }, [branches, repository.defaultBranch]);

  useEffect(() => {
    if (!branches.length) return;
    setHead((current) =>
      current && current !== base && branches.includes(current)
        ? current
        : (branches.find((branch) => branch !== base) ?? "")
    );
    setDraft(false);
  }, [base, branches]);

  const canCompare = Boolean(base && head && base !== head);
  const comparisonResult = useQuery({
    ...pullRequestComparisonQueryOptions({ ...repositoryTarget, base, head }),
    enabled: canCompare,
  });
  const comparison = comparisonResult.data ?? null;
  const canCreate = Boolean(comparison && comparison.aheadBy > 0);
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) =>
      createRepositoryPullRequest(repositoryTarget, {
        base,
        head,
        title,
        body,
        draft,
      }),
    onSuccess: (pullRequest) => {
      syncCreatedPullRequest(queryClient, repositoryTarget, pullRequest);
      toast.success(
        t(
          pullRequest.draft
            ? "workspace.repositories.draftPullRequestCreated"
            : "workspace.repositories.pullRequestCreated"
        )
      );
      onCreated(pullRequest);
      void invalidateRepositoryPullRequest(queryClient, {
        ...repositoryTarget,
        pullRequestNumber: pullRequest.number,
      });
    },
  });
  const branchesError = branchesResult.error ? parseIpcError(branchesResult.error) : null;
  const comparisonError = comparisonResult.error ? parseIpcError(comparisonResult.error) : null;
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <div className="@container/pull-create flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft data-icon="inline-start" />
          {t("workspace.repositories.backToPullRequests")}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-4 py-5 sm:px-5">
          <header>
            <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em]">
              {t("workspace.repositories.newPullRequest")}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {t("workspace.repositories.newPullRequestDescription", {
                repository: repository.fullName,
              })}
            </p>
          </header>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t("workspace.repositories.choosePullRequestBranches")}
              </CardTitle>
              <CardDescription>
                {t("workspace.repositories.choosePullRequestBranchesDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {branchesResult.isPending ? (
                <div className="grid gap-4 @min-[560px]/pull-create:grid-cols-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : branchesError ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>
                    {t("workspace.repositories.pullRequestBranchesLoadFailed")}
                  </AlertTitle>
                  <AlertDescription className="flex flex-col items-start gap-2">
                    <span>{branchesError.message}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void branchesResult.refetch()}
                    >
                      <RefreshCw data-icon="inline-start" />
                      {t("workspace.repositories.retry")}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : branches.length < 2 ? (
                <Empty className="min-h-48 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GitCompareArrows />
                    </EmptyMedia>
                    <EmptyTitle>
                      {t("workspace.repositories.pullRequestBranchesUnavailable")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {t("workspace.repositories.pullRequestBranchesUnavailableDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <FieldGroup className="grid gap-4 @min-[560px]/pull-create:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="github-new-pull-request-base">
                      {t("workspace.repositories.pullRequestBaseBranch")}
                    </FieldLabel>
                    <Select value={base} onValueChange={setBase} disabled={mutation.isPending}>
                      <SelectTrigger id="github-new-pull-request-base" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {branches.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              {branch}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {t("workspace.repositories.pullRequestBaseBranchDescription")}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="github-new-pull-request-head">
                      {t("workspace.repositories.pullRequestHeadBranch")}
                    </FieldLabel>
                    <Select value={head} onValueChange={setHead} disabled={mutation.isPending}>
                      <SelectTrigger id="github-new-pull-request-head" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {branches
                            .filter((branch) => branch !== base)
                            .map((branch) => (
                              <SelectItem key={branch} value={branch}>
                                {branch}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {t("workspace.repositories.pullRequestHeadBranchDescription")}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              )}
            </CardContent>
          </Card>

          {canCompare && comparisonResult.isPending ? (
            <PullRequestComparisonSkeleton />
          ) : comparisonError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.pullRequestComparisonFailed")}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>
                  {comparisonErrorMessage(comparisonError.code, comparisonError.message, t)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void comparisonResult.refetch()}
                >
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : comparison && !canCreate ? (
            <Empty className="min-h-56 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GitCompareArrows />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.repositories.noPullRequestChanges")}</EmptyTitle>
                <EmptyDescription>
                  {t("workspace.repositories.noPullRequestChangesDescription", {
                    head,
                    base,
                  })}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : comparison && canCreate ? (
            <>
              <PullRequestComparisonSummary comparison={comparison} repository={repository} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {t("workspace.repositories.describePullRequest")}
                  </CardTitle>
                  <CardDescription>
                    {t("workspace.repositories.describePullRequestDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GitHubTitleBodyForm
                    key={`${base}:${head}:${comparison.suggestedTitle}`}
                    repository={repository}
                    reference={head}
                    idPrefix="github-new-pull-request"
                    initialValue={{ title: comparison.suggestedTitle, body: "" }}
                    copy={{
                      titleLabel: t("workspace.repositories.pullRequestTitle"),
                      titlePlaceholder: t("workspace.repositories.pullRequestTitlePlaceholder"),
                      titleRequired: t("workspace.repositories.pullRequestTitleRequired"),
                      bodyLabel: t("workspace.repositories.pullRequestBody"),
                      bodyPlaceholder: t("workspace.repositories.pullRequestBodyPlaceholder"),
                    }}
                    submitLabel={t(
                      draft
                        ? "workspace.repositories.createDraftPullRequest"
                        : "workspace.repositories.createPullRequest"
                    )}
                    pendingLabel={t("workspace.repositories.creatingPullRequest")}
                    pending={mutation.isPending}
                    errorTitle={t("workspace.repositories.createPullRequestFailed")}
                    errorMessage={
                      mutationError
                        ? comparisonErrorMessage(mutationError.code, mutationError.message, t)
                        : undefined
                    }
                    additionalFields={
                      <Field orientation="horizontal" data-disabled={mutation.isPending}>
                        <Checkbox
                          id="github-new-pull-request-draft"
                          checked={draft}
                          disabled={mutation.isPending}
                          onCheckedChange={(checked) => setDraft(checked === true)}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="github-new-pull-request-draft">
                            <FieldTitle>
                              {t("workspace.repositories.createAsDraftPullRequest")}
                            </FieldTitle>
                          </FieldLabel>
                          <FieldDescription>
                            {t("workspace.repositories.createAsDraftPullRequestDescription")}
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    }
                    onChange={() => {
                      if (mutation.isError) mutation.reset();
                    }}
                    onSubmit={(value) => mutation.mutate(value)}
                    onCancel={onCancel}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
