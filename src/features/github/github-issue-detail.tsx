import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, CircleDot, ExternalLink, Pencil, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubIssue, GitHubRepositoryContentContext } from "./github-data";
import { GitHubCommentForm } from "./github-comment-form";
import { GitHubIssueEditDialog } from "./github-issue-edit-dialog";
import { GitHubIssueMetadata } from "./github-issue-metadata";
import {
  issueDetailLocation,
  popIssueDetailLocation,
  pushIssueDetailLocation,
} from "./github-issue-detail-navigation";
import { GitHubIssueRelationships } from "./github-issue-relationships";
import { GitHubIssueStateAction } from "./github-issue-state-action";
import {
  createRepositoryIssueComment,
  invalidateRepositoryIssue,
  issueStateMutationInput,
  syncCreatedIssueComment,
  syncUpdatedIssue,
  updateRepositoryIssueState,
  type GitHubIssueMutationTarget,
} from "./github-issue-mutations";
import {
  invalidateIssueStateCapabilities,
  issueStateCapabilitiesMatchIssue,
  issueStateCapabilitiesQueryOptions,
} from "./github-issue-state-queries";
import { formatIssueDate, GitHubIssueStateBadge } from "./github-issue-shared";
import { GitHubIssueTimeline } from "./github-issue-timeline";
import { githubQueryKeys, repositoryIssueDetailQueryOptions } from "./github-queries";

export function GitHubIssueComposer({
  issue,
  repository,
  target,
}: {
  issue: GitHubIssue;
  repository: GitHubRepositoryContentContext;
  target: GitHubIssueMutationTarget;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const capabilityResult = useQuery(issueStateCapabilitiesQueryOptions(target, issue.updatedAt));
  const refreshIssueState = (refreshNavigation = false) =>
    Promise.all([
      invalidateRepositoryIssue(queryClient, target),
      invalidateIssueStateCapabilities(queryClient, target),
      ...(refreshNavigation
        ? [queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositories })]
        : []),
    ]);
  const stateErrorMessage = (error: ReturnType<typeof parseIpcError>) => {
    switch (error.code) {
      case "githubPermission":
        return t("workspace.repositories.issueWritePermissionDenied");
      case "githubIssueStateConflict":
        return t("workspace.repositories.issueStateChanged");
      case "githubIssueMoved":
        return t("workspace.repositories.issueMoved");
      default:
        return error.message;
    }
  };
  const commentMutation = useMutation({
    mutationFn: (commentBody: string) => createRepositoryIssueComment(target, commentBody),
    onSuccess: (comment) => {
      syncCreatedIssueComment(queryClient, target, comment);
      setBody("");
      toast.success(t("workspace.repositories.commentPosted"));
      void invalidateRepositoryIssue(queryClient, target);
    },
  });
  const stateMutation = useMutation({
    mutationFn: (choice: Parameters<typeof issueStateMutationInput>[1]) =>
      updateRepositoryIssueState(target, issueStateMutationInput(issue, choice)),
    onSuccess: (updatedIssue) => {
      syncUpdatedIssue(queryClient, target, updatedIssue);
      toast.success(
        t(
          updatedIssue.state === "closed"
            ? "workspace.repositories.issueClosed"
            : "workspace.repositories.issueReopened"
        )
      );
      void refreshIssueState();
    },
    onError: (error) => {
      const parsed = parseIpcError(error);
      toast.error(t("workspace.repositories.issueStateChangeFailed"), {
        description: stateErrorMessage(parsed),
      });
      void refreshIssueState(parsed.code === "githubIssueMoved");
    },
  });
  const commentError = commentMutation.error ? parseIpcError(commentMutation.error) : null;
  const stateError = stateMutation.error ? parseIpcError(stateMutation.error) : null;
  const capabilityError = capabilityResult.error ? parseIpcError(capabilityResult.error) : null;
  const capabilityBusy = capabilityResult.isPending || capabilityResult.isFetching;
  const capabilities = capabilityResult.data;
  const capabilityMatches = capabilities
    ? issueStateCapabilitiesMatchIssue(capabilities, issue, target)
    : false;
  const viewerCanChange = capabilities
    ? issue.state === "open"
      ? capabilities.viewerCanClose
      : capabilities.viewerCanReopen
    : false;
  const commentErrorMessage = commentError
    ? commentError.code === "githubPermission"
      ? t("workspace.repositories.issueWritePermissionDenied")
      : commentError.message
    : null;
  const retryStateRead = () => void refreshIssueState();
  const stateNotice =
    capabilityError || (capabilities && !capabilityMatches) ? (
      <Alert variant="destructive" className="py-2.5 text-xs">
        <CircleAlert />
        <AlertTitle>{t("workspace.repositories.issueActionsLoadFailed")}</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-2">
          <span>{capabilityError?.message ?? t("workspace.repositories.issueStateChanged")}</span>
          <Button type="button" variant="outline" size="xs" onClick={retryStateRead}>
            <RefreshCw data-icon="inline-start" />
            {t("workspace.repositories.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    ) : stateError ? (
      <Alert variant="destructive" className="py-2.5 text-xs">
        <CircleAlert />
        <AlertTitle>{t("workspace.repositories.issueStateChangeFailed")}</AlertTitle>
        <AlertDescription>{stateErrorMessage(stateError)}</AlertDescription>
      </Alert>
    ) : capabilities && !viewerCanChange ? (
      <Alert className="py-2.5 text-xs">
        <CircleAlert />
        <AlertTitle>{t("workspace.repositories.issueStateUnavailable")}</AlertTitle>
        <AlertDescription>
          {t("workspace.repositories.issueWritePermissionDenied")}
        </AlertDescription>
      </Alert>
    ) : null;
  return (
    <GitHubCommentForm
      repository={repository}
      reference={repository.defaultBranch}
      idPrefix={`github-issue-${issue.number}-comment`}
      body={body}
      pending={commentMutation.isPending}
      submitDisabled={stateMutation.isPending}
      errorMessage={commentErrorMessage}
      notice={stateNotice}
      secondaryAction={
        capabilities &&
        capabilityMatches &&
        !capabilityBusy &&
        !capabilityError &&
        !viewerCanChange ? null : (
          <GitHubIssueStateAction
            state={issue.state}
            pending={stateMutation.isPending}
            loading={capabilityBusy}
            disabled={
              commentMutation.isPending ||
              capabilityBusy ||
              Boolean(capabilityError) ||
              !capabilities ||
              !capabilityMatches ||
              !viewerCanChange
            }
            onChange={(choice) => stateMutation.mutate(choice)}
          />
        )
      }
      onBodyChange={(value) => {
        setBody(value);
        if (commentMutation.isError) commentMutation.reset();
      }}
      onSubmit={() => commentMutation.mutate(body)}
    />
  );
}

function GitHubIssueDetailScreen({
  repository,
  issueNumber,
  onBack,
  backLabel,
  onNavigate,
}: {
  repository: GitHubRepositoryContentContext;
  issueNumber: number;
  onBack: () => void;
  backLabel?: string;
  onNavigate: (repository: GitHubRepositoryContentContext, issueNumber: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [timelinePage, setTimelinePage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const detailResult = useQuery(
    repositoryIssueDetailQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      issueNumber,
      timelinePage,
    })
  );
  const detail = detailResult.data;
  const error = detailResult.error ? parseIpcError(detailResult.error) : null;

  const errorTitle =
    error?.code === "githubPermission"
      ? "workspace.repositories.issuePermissionDenied"
      : error?.code === "githubRateLimited"
        ? "workspace.repositories.githubRateLimited"
        : "workspace.repositories.issueDetailLoadFailed";

  return (
    <div className="@container/issues flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center gap-3 border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {backLabel ?? t("workspace.repositories.backToIssues")}
        </Button>
        {detailResult.isFetching ? (
          <RefreshCw className="text-muted-foreground size-3 animate-spin" />
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {detailResult.isPending ? (
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-5">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error || !detail ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleDot />
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
          <div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-5">
            <div className="mb-5 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em]">
                  {detail.issue.title}{" "}
                  <span className="text-muted-foreground font-normal">#{detail.issue.number}</span>
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <GitHubIssueStateBadge
                    state={detail.issue.state}
                    stateReason={detail.issue.stateReason}
                  />
                  <span className="text-muted-foreground">
                    {t("workspace.repositories.openedBy", {
                      author: detail.issue.author,
                      date: formatIssueDate(detail.issue.createdAt, i18n.language),
                    })}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil data-icon="inline-start" />
                  {t("workspace.repositories.editIssue")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void openExternalUrl(detail.issue.url)}
                >
                  <ExternalLink data-icon="inline-end" />
                  {t("workspace.openOnGitHub")}
                </Button>
              </div>
            </div>
            <div className="grid min-w-0 gap-5 @min-[760px]/issues:grid-cols-[minmax(0,1fr)_220px]">
              <div className="min-w-0">
                <GitHubIssueTimeline
                  issue={detail.issue}
                  timeline={detail.timeline}
                  repository={repository}
                  locale={i18n.language}
                  page={detail.timelinePage}
                  hasPrevious={detail.timelineHasPrevious}
                  hasMore={detail.timelineHasMore}
                  onPageChange={setTimelinePage}
                  commentTarget={{
                    kind: "issue",
                    owner: repository.owner,
                    repository: repository.name,
                    issueNumber: detail.issue.number,
                  }}
                  afterIssue={
                    <GitHubIssueRelationships
                      repository={repository}
                      issueNumber={detail.issue.number}
                      onNavigate={(summary) => onNavigate(summary.repository, summary.issue.number)}
                    />
                  }
                />
                <GitHubIssueComposer
                  issue={detail.issue}
                  repository={repository}
                  target={{
                    owner: repository.owner,
                    repository: repository.name,
                    issueNumber: detail.issue.number,
                  }}
                />
              </div>
              <GitHubIssueMetadata repository={repository} issue={detail.issue} />
            </div>
          </div>
        )}
      </ScrollArea>
      {detail ? (
        <GitHubIssueEditDialog
          repository={repository}
          issue={detail.issue}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}
    </div>
  );
}

export function GitHubIssueDetail({
  repository,
  issueNumber,
  onBack,
  backLabel,
}: {
  repository: GitHubRepositoryContentContext;
  issueNumber: number;
  onBack: () => void;
  backLabel?: string;
}) {
  const { t } = useAppTranslation();
  const root = issueDetailLocation(repository, issueNumber);
  const rootKey = `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}#${issueNumber}`;
  const [navigation, setNavigation] = useState({ rootKey, history: [root] });
  const history = navigation.rootKey === rootKey ? navigation.history : [root];
  const current = history[history.length - 1] ?? root;
  const currentKey = `${current.repository.owner.toLowerCase()}/${current.repository.name.toLowerCase()}#${current.issueNumber}`;

  const navigate = (nextRepository: GitHubRepositoryContentContext, nextIssueNumber: number) => {
    const next = issueDetailLocation(nextRepository, nextIssueNumber);
    setNavigation((currentNavigation) => {
      const currentHistory =
        currentNavigation.rootKey === rootKey ? currentNavigation.history : [root];
      return { rootKey, history: pushIssueDetailLocation(currentHistory, next) };
    });
  };
  const goBack = () => {
    if (history.length === 1) {
      onBack();
      return;
    }
    setNavigation((currentNavigation) => ({
      rootKey,
      history: popIssueDetailLocation(
        currentNavigation.rootKey === rootKey ? currentNavigation.history : [root]
      ),
    }));
  };

  return (
    <GitHubIssueDetailScreen
      key={currentKey}
      repository={current.repository}
      issueNumber={current.issueNumber}
      onBack={goBack}
      backLabel={history.length > 1 ? t("workspace.repositories.backToPreviousIssue") : backLabel}
      onNavigate={navigate}
    />
  );
}
