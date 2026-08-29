import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  CircleX,
  ExternalLink,
  FileDiff,
  GitCommitHorizontal,
  GitPullRequest,
  LockKeyhole,
  MessageSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import { GitHubCommentForm } from "./github-comment-form";
import type { GitHubPullRequest, GitHubPullRequestRepository } from "./github-data";
import { formatIssueDate } from "./github-issue-shared";
import { GitHubIssueTimeline } from "./github-issue-timeline";
import { GitHubPullRequestChecks } from "./github-pull-request-checks";
import { GitHubPullRequestCommits } from "./github-pull-request-commits";
import { GitHubPullRequestFiles } from "./github-pull-request-files";
import { GitHubPullRequestMergePanel } from "./github-pull-request-merge-panel";
import { GitHubPullRequestMetadata } from "./github-pull-request-metadata";
import { GitHubPullRequestReviewers } from "./github-pull-request-reviewers";
import { GitHubPullRequestEditDialog } from "./github-pull-request-edit-dialog";
import {
  createRepositoryPullRequestComment,
  invalidateRepositoryPullRequest,
  syncCreatedPullRequestComment,
  syncUpdatedPullRequest,
  updateRepositoryPullRequestState,
} from "./github-pull-request-mutations";
import { GitHubPullRequestStateBadge } from "./github-pull-request-shared";
import { repositoryPullRequestDetailQueryOptions } from "./github-queries";

type PullRequestDetailTab = "conversation" | "commits" | "checks" | "files";

function GitHubPullRequestComposer({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const target = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const commentMutation = useMutation({
    mutationFn: (commentBody: string) => createRepositoryPullRequestComment(target, commentBody),
    onSuccess: (comment) => {
      syncCreatedPullRequestComment(queryClient, target, comment);
      setBody("");
      toast.success(t("workspace.repositories.commentPosted"));
      void invalidateRepositoryPullRequest(queryClient, target);
    },
  });
  const stateMutation = useMutation({
    mutationFn: (pullRequestState: GitHubPullRequest["state"]) =>
      updateRepositoryPullRequestState(target, pullRequestState),
    onSuccess: (updatedPullRequest) => {
      syncUpdatedPullRequest(queryClient, target, updatedPullRequest);
      toast.success(
        t(
          updatedPullRequest.state === "closed"
            ? "workspace.repositories.pullRequestClosed"
            : "workspace.repositories.pullRequestReopened"
        )
      );
      void invalidateRepositoryPullRequest(queryClient, target);
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t("workspace.repositories.pullRequestStateChangeFailed"), {
        description:
          parsed.code === "githubPermission"
            ? t("workspace.repositories.pullRequestWritePermissionDenied")
            : parsed.message,
      });
    },
  });
  const commentError = commentMutation.error ? parseIpcError(commentMutation.error) : null;
  const stateError = stateMutation.error ? parseIpcError(stateMutation.error) : null;
  const nextState = pullRequest.state === "open" ? "closed" : "open";

  return (
    <GitHubCommentForm
      repository={{ ...repository, defaultBranch: pullRequest.baseRef }}
      reference={pullRequest.baseRef}
      idPrefix={`github-pull-request-${pullRequest.number}-comment`}
      body={body}
      pending={commentMutation.isPending}
      submitDisabled={stateMutation.isPending}
      errorMessage={
        commentError?.code === "githubPermission"
          ? t("workspace.repositories.pullRequestWritePermissionDenied")
          : commentError?.message
      }
      notice={
        stateError ? (
          <Alert variant="destructive" className="py-2.5 text-xs">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.pullRequestStateChangeFailed")}</AlertTitle>
            <AlertDescription>
              {stateError.code === "githubPermission"
                ? t("workspace.repositories.pullRequestWritePermissionDenied")
                : stateError.message}
            </AlertDescription>
          </Alert>
        ) : null
      }
      secondaryAction={
        !pullRequest.merged ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={stateMutation.isPending || commentMutation.isPending}
            onClick={() => stateMutation.mutate(nextState)}
          >
            {stateMutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : nextState === "closed" ? (
              <CircleX data-icon="inline-start" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            {stateMutation.isPending
              ? t(
                  nextState === "closed"
                    ? "workspace.repositories.closingPullRequest"
                    : "workspace.repositories.reopeningPullRequest"
                )
              : t(
                  nextState === "closed"
                    ? "workspace.repositories.closePullRequest"
                    : "workspace.repositories.reopenPullRequest"
                )}
          </Button>
        ) : null
      }
      onBodyChange={(value) => {
        setBody(value);
        if (commentMutation.isError) commentMutation.reset();
      }}
      onSubmit={() => commentMutation.mutate(body)}
    />
  );
}

export function GitHubPullRequestDetail({
  repository,
  pullRequestNumber,
  onBack,
  backLabel,
}: {
  repository: GitHubPullRequestRepository;
  pullRequestNumber: number;
  onBack: () => void;
  backLabel?: string;
}) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<PullRequestDetailTab>("conversation");
  const [editOpen, setEditOpen] = useState(false);
  const [timelinePage, setTimelinePage] = useState(1);
  const [commitPage, setCommitPage] = useState(1);
  const [checkPage, setCheckPage] = useState(1);
  const [filePage, setFilePage] = useState(1);
  const detailResult = useQuery(
    repositoryPullRequestDetailQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      pullRequestNumber,
      timelinePage,
    })
  );
  const detail = detailResult.data;
  const error = !detail && detailResult.error ? parseIpcError(detailResult.error) : null;
  const errorTitle =
    error?.code === "githubPermission"
      ? "workspace.repositories.pullRequestPermissionDenied"
      : error?.code === "githubRateLimited"
        ? "workspace.repositories.githubRateLimited"
        : "workspace.repositories.pullRequestDetailLoadFailed";

  return (
    <div className="@container/pull-detail flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center gap-3 border-b px-4 py-2 @max-[620px]/pull-detail:min-h-10">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {backLabel ?? t("workspace.repositories.backToPullRequests")}
        </Button>
        {detailResult.isFetching ? (
          <RefreshCw className="text-muted-foreground size-3 animate-spin" />
        ) : null}
      </div>
      {detailResult.isPending ? (
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-5">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error || !detail ? (
        <Empty className="min-h-80 flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitPullRequest />
            </EmptyMedia>
            <EmptyTitle>{t(errorTitle)}</EmptyTitle>
            <EmptyDescription>{error?.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void detailResult.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="border-b px-4 py-4 sm:px-5 @max-[620px]/pull-detail:py-3">
            <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start gap-3 @max-[620px]/pull-detail:flex-nowrap">
              <div className="min-w-0 flex-1">
                <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em] @max-[620px]/pull-detail:text-base @max-[620px]/pull-detail:leading-6">
                  {detail.pullRequest.title}{" "}
                  <span className="text-muted-foreground font-normal">
                    #{detail.pullRequest.number}
                  </span>
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] @max-[620px]/pull-detail:mt-1.5 @max-[620px]/pull-detail:gap-1.5">
                  <GitHubPullRequestStateBadge pullRequest={detail.pullRequest} />
                  <span className="text-muted-foreground @max-[620px]/pull-detail:hidden">
                    {t("workspace.repositories.openedPullRequestBy", {
                      author: detail.pullRequest.author,
                      date: formatIssueDate(detail.pullRequest.createdAt, i18n.language),
                    })}
                  </span>
                  <Badge
                    variant="outline"
                    className="h-6 max-w-full rounded-md font-mono text-[10px]"
                  >
                    <span className="truncate">
                      {detail.pullRequest.headLabel ?? detail.pullRequest.headRef}
                    </span>
                    <span aria-hidden="true">→</span>
                    <span className="truncate">{detail.pullRequest.baseRef}</span>
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 @max-[620px]/pull-detail:shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="@max-[620px]/pull-detail:size-8 @max-[620px]/pull-detail:px-0"
                  aria-label={t("workspace.repositories.editPullRequest")}
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil data-icon="inline-start" />
                  <span className="@max-[620px]/pull-detail:hidden">
                    {t("workspace.repositories.editPullRequest")}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="@max-[620px]/pull-detail:size-8 @max-[620px]/pull-detail:px-0"
                  aria-label={t("workspace.openOnGitHub")}
                  onClick={() => void openExternalUrl(detail.pullRequest.url)}
                >
                  <ExternalLink data-icon="inline-end" />
                  <span className="@max-[620px]/pull-detail:hidden">
                    {t("workspace.openOnGitHub")}
                  </span>
                </Button>
              </div>
            </div>
          </div>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as PullRequestDetailTab)}
            className="min-h-0 flex-1 gap-0"
          >
            <div className="border-b px-4">
              <TabsList variant="line" className="h-10 gap-4 p-0">
                <TabsTrigger value="conversation" className="px-1.5 text-xs">
                  <MessageSquare /> {t("workspace.repositories.conversation")}
                </TabsTrigger>
                <TabsTrigger value="commits" className="px-1.5 text-xs">
                  <GitCommitHorizontal />
                  {t("workspace.repositories.commitsTab", {
                    count: detail.pullRequest.commits,
                  })}
                </TabsTrigger>
                <TabsTrigger value="checks" className="px-1.5 text-xs">
                  <ShieldCheck /> {t("workspace.repositories.checks")}
                </TabsTrigger>
                <TabsTrigger value="files" className="px-1.5 text-xs">
                  <FileDiff />
                  {t("workspace.repositories.filesTab", {
                    count: detail.pullRequest.changedFiles,
                  })}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="conversation"
              className="flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              <ScrollArea className="min-h-0 flex-1">
                <div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-5">
                  <div className="grid min-w-0 gap-5 @min-[760px]/pull-detail:grid-cols-[minmax(0,1fr)_230px]">
                    <div className="flex min-w-0 flex-col gap-4">
                      <GitHubIssueTimeline
                        issue={detail.pullRequest}
                        timeline={detail.timeline}
                        repository={{ ...repository, defaultBranch: detail.pullRequest.baseRef }}
                        locale={i18n.language}
                        page={detail.timelinePage}
                        hasPrevious={detail.timelineHasPrevious}
                        hasMore={detail.timelineHasMore}
                        onPageChange={setTimelinePage}
                        commentTarget={{
                          kind: "pullRequest",
                          owner: repository.owner,
                          repository: repository.name,
                          pullRequestNumber: detail.pullRequest.number,
                        }}
                        emptyBody={t("workspace.repositories.noPullRequestBody")}
                      />
                      <GitHubPullRequestMergePanel
                        repository={repository}
                        pullRequest={detail.pullRequest}
                      />
                      <GitHubPullRequestComposer
                        repository={repository}
                        pullRequest={detail.pullRequest}
                      />
                    </div>
                    <aside className="flex flex-col gap-4 @min-[760px]/pull-detail:sticky @min-[760px]/pull-detail:top-0 @min-[760px]/pull-detail:self-start">
                      <GitHubPullRequestReviewers
                        repository={repository}
                        pullRequest={detail.pullRequest}
                        reviews={detail.reviews}
                      />
                      <Separator />
                      <GitHubPullRequestMetadata
                        repository={repository}
                        pullRequest={detail.pullRequest}
                      />
                      <Separator />
                      <div>
                        <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.08em] uppercase">
                          {t("workspace.repositories.changeSummary")}
                        </p>
                        <p className="text-muted-foreground flex flex-wrap gap-2 text-[11px]">
                          <span className="text-success">+{detail.pullRequest.additions}</span>
                          <span className="text-destructive">-{detail.pullRequest.deletions}</span>
                          <span>
                            {t("workspace.repositories.changedFileCount", {
                              count: detail.pullRequest.changedFiles,
                            })}
                          </span>
                        </p>
                      </div>
                      {detail.pullRequest.locked ? (
                        <>
                          <Separator />
                          <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                            <LockKeyhole /> {t("workspace.repositories.lockedConversation")}
                          </p>
                        </>
                      ) : null}
                    </aside>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="commits" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              <GitHubPullRequestCommits
                repository={repository}
                pullRequestNumber={pullRequestNumber}
                page={commitPage}
                onPageChange={setCommitPage}
                enabled={tab === "commits"}
              />
            </TabsContent>
            <TabsContent value="checks" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              <GitHubPullRequestChecks
                repository={repository}
                reference={detail.pullRequest.headSha}
                page={checkPage}
                onPageChange={setCheckPage}
                enabled={tab === "checks"}
              />
            </TabsContent>
            <TabsContent value="files" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              <GitHubPullRequestFiles
                repository={repository}
                pullRequest={detail.pullRequest}
                page={filePage}
                onPageChange={setFilePage}
                enabled={tab === "files"}
              />
            </TabsContent>
          </Tabs>
          <GitHubPullRequestEditDialog
            repository={repository}
            pullRequest={detail.pullRequest}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </>
      )}
    </div>
  );
}
