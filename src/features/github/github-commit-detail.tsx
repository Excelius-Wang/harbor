import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  ExternalLink,
  FileDiff,
  GitCommitHorizontal,
  RefreshCw,
  ShieldQuestion,
  UserRound,
} from "lucide-react";
import type { ViewType } from "react-diff-view";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import { GitHubCommitCommentFileDiff } from "./github-commit-comment-diff";
import { GitHubCommitCommentsWorkspace } from "./github-commit-comments-workspace";
import type {
  GitHubChangedFile,
  GitHubCommitActor,
  GitHubCommitComment,
  GitHubRepositoryContentContext,
  GitHubRepositoryIdentity,
} from "./github-data";
import {
  isRetryableCommitDetailError,
  matchingCommitDetailPages,
} from "./github-commit-detail-pages";
import { formatIssueDate } from "./github-issue-shared";
import { repositoryCommitDetailQueryOptions } from "./github-queries";

function CommitActor({
  actor,
  label,
  locale,
}: {
  actor: GitHubCommitActor | null;
  label: string;
  locale: string;
}) {
  const { t } = useAppTranslation();
  const name = actor?.name ?? actor?.login ?? t("workspace.repositories.unknownAuthor");
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar size="sm" className="shrink-0">
        {actor?.avatarUrl ? <AvatarImage src={actor.avatarUrl} alt="" /> : null}
        <AvatarFallback>
          <UserRound />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-muted-foreground text-[9px] font-medium tracking-[0.08em] uppercase">
          {label}
        </p>
        <p className="truncate text-[11px] font-medium">
          {actor?.login ? `@${actor.login}` : name}
        </p>
        {actor?.date ? (
          <p className="text-muted-foreground truncate text-[9px]">
            {formatIssueDate(actor.date, locale)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CommitFile({
  file,
  index,
  viewType,
  target,
  repository,
  comments,
  canCreateComment,
  onOpenFile,
}: {
  file: GitHubChangedFile;
  index: number;
  viewType: ViewType;
  target: { owner: string; repository: string; commitSha: string };
  repository: GitHubRepositoryContentContext;
  comments: GitHubCommitComment[];
  canCreateComment: boolean;
  onOpenFile?: (file: GitHubChangedFile) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <Collapsible defaultOpen={index < 2} className="overflow-hidden rounded-lg border">
      <div className="bg-card/45 flex min-w-0 items-center gap-2 border-b px-2 py-1.5">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group min-w-0 flex-1 justify-start"
          >
            <ChevronDown className="transition-transform group-data-[state=closed]:-rotate-90" />
            <span className="truncate font-mono text-[11px]">{file.path}</span>
          </Button>
        </CollapsibleTrigger>
        <Badge variant="outline" className="shrink-0 rounded-md text-[9px]">
          {t(`workspace.repositories.fileStatuses.${file.status}`, {
            defaultValue: file.status,
          })}
        </Badge>
        <span className="text-success text-[10px]">+{file.additions}</span>
        <span className="text-destructive text-[10px]">-{file.deletions}</span>
        {onOpenFile || file.blobUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("workspace.repositories.viewSource")}
                onClick={() => {
                  if (onOpenFile) onOpenFile(file);
                  else if (file.blobUrl) void openExternalUrl(file.blobUrl);
                }}
              >
                <ExternalLink />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("workspace.repositories.viewSource")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {file.previousPath ? (
        <p className="text-muted-foreground border-b px-3 py-2 font-mono text-[9px]">
          {t("workspace.repositories.commitFileRenamed", {
            previousPath: file.previousPath,
            path: file.path,
          })}
        </p>
      ) : null}
      <CollapsibleContent>
        <GitHubCommitCommentFileDiff
          file={file}
          viewType={viewType}
          target={target}
          repository={repository}
          comments={comments}
          canCreateComment={canCreateComment}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GitHubCommitDetail({
  repository,
  commitSha,
  backLabel,
  onBack,
  onSelectCommit,
  onOpenFile,
}: {
  repository: GitHubRepositoryIdentity;
  commitSha: string;
  backLabel?: string;
  onBack: () => void;
  onSelectCommit: (sha: string) => void;
  onOpenFile?: (file: GitHubChangedFile, reference: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [viewType, setViewType] = useState<ViewType>("unified");
  const [copied, setCopied] = useState(false);
  const result = useInfiniteQuery(
    repositoryCommitDetailQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      commitSha,
    })
  );
  const pages = result.data?.pages ?? [];
  const matchingPages = useMemo(() => matchingCommitDetailPages(pages), [pages]);
  const pageMismatch = matchingPages.length !== pages.length;
  const firstPage = matchingPages[0];
  const commit = firstPage?.commit;
  const files = matchingPages.flatMap((page) => page.files);
  const filesAtLimit = matchingPages.some((page) => page.filesAtLimit);
  const initialError = !commit && result.error ? parseIpcError(result.error) : null;
  const laterError = commit && result.isFetchNextPageError ? parseIpcError(result.error) : null;
  const commentTarget = {
    owner: repository.owner,
    repository: repository.name,
    commitSha,
  };
  const contentRepository: GitHubRepositoryContentContext = {
    owner: repository.owner,
    name: repository.name,
    url: `https://github.com/${repository.owner}/${repository.name}`,
    defaultBranch: commitSha,
  };

  if (result.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!commit || initialError) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitCommitHorizontal />
          </EmptyMedia>
          <EmptyTitle>{t("workspace.repositories.commitDetailLoadFailed")}</EmptyTitle>
          <EmptyDescription>{initialError?.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            {backLabel ?? t("workspace.repositories.backToCommits")}
          </Button>
          {initialError && isRetryableCommitDetailError(initialError) ? (
            <Button variant="outline" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          ) : null}
        </EmptyContent>
      </Empty>
    );
  }

  const messageLines = commit.message.split("\n");
  const headline = messageLines[0] || commit.shortSha;
  const body = messageLines.slice(1).join("\n").trim();
  const copySha = async () => {
    try {
      await navigator.clipboard.writeText(commit.sha);
      setCopied(true);
      toast.success(t("workspace.repositories.commitShaCopied"));
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast.error(t("workspace.repositories.commitShaCopyFailed"));
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="overflow-hidden rounded-lg border">
        <div className="bg-card/40 flex min-w-0 flex-wrap items-center gap-2 border-b px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            {backLabel ?? t("workspace.repositories.backToCommits")}
          </Button>
          <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[10px]">
            {commit.sha}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("workspace.repositories.copyCommitSha")}
                onClick={() => void copySha()}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("workspace.repositories.copyCommitSha")}</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void openExternalUrl(commit.url)}
          >
            <ExternalLink data-icon="inline-end" />
            {t("workspace.openOnGitHub")}
          </Button>
        </div>
        <div className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="min-w-0 flex-1 text-base leading-6 font-semibold tracking-[-0.015em]">
                {headline}
              </h3>
              {commit.verification?.verified ? (
                <Badge variant="outline" className="text-success shrink-0 rounded-md">
                  <BadgeCheck /> {t("workspace.repositories.commitVerifiedByGitHub")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground shrink-0 rounded-md">
                  <ShieldQuestion />
                  {t("workspace.repositories.commitUnverified", {
                    reason: commit.verification?.reason ?? "unsigned",
                  })}
                </Badge>
              )}
            </div>
            {body ? (
              <p className="text-muted-foreground mt-2 text-[11px] leading-5 whitespace-pre-wrap">
                {body}
              </p>
            ) : null}
          </div>
          <Separator />
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <CommitActor
              actor={commit.author}
              label={t("workspace.repositories.commitAuthor")}
              locale={i18n.language}
            />
            <CommitActor
              actor={commit.committer}
              label={t("workspace.repositories.committer")}
              locale={i18n.language}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px]">
            {commit.stats ? (
              <>
                <Badge variant="secondary" className="rounded-md">
                  {t("workspace.repositories.commitTotalChanges", { count: commit.stats.total })}
                </Badge>
                <span className="text-success">+{commit.stats.additions}</span>
                <span className="text-destructive">-{commit.stats.deletions}</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("workspace.repositories.commitStatsUnavailable")}
              </span>
            )}
            <span className="text-muted-foreground ml-auto">
              {t("workspace.repositories.commitFilesLoaded", { count: files.length })}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[9px] font-medium tracking-[0.08em] uppercase">
              {t("workspace.repositories.commitParents")}
            </span>
            {commit.parents.length ? (
              commit.parents.map((parent) => (
                <Button
                  key={parent.sha}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="font-mono"
                  onClick={() => onSelectCommit(parent.sha)}
                >
                  {parent.shortSha}
                </Button>
              ))
            ) : (
              <span className="text-muted-foreground text-[10px]">
                {t("workspace.repositories.rootCommit")}
              </span>
            )}
          </div>
        </div>
      </header>

      <GitHubCommitCommentsWorkspace
        target={commentTarget}
        repository={contentRepository}
        files={files}
        filesStillLoading={Boolean(result.hasNextPage || result.isFetchingNextPage || pageMismatch)}
      >
        {({ comments, canCreateComment }) => (
          <>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">
                  {t("workspace.repositories.commitChanges")}
                </h4>
                <p className="text-muted-foreground text-[10px]">
                  {t("workspace.repositories.commitChangesDescription")}
                </p>
              </div>
              <Select value={viewType} onValueChange={(value) => setViewType(value as ViewType)}>
                <SelectTrigger size="sm" className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="unified">
                      {t("workspace.repositories.unifiedDiff")}
                    </SelectItem>
                    <SelectItem value="split">{t("workspace.repositories.splitDiff")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {pageMismatch ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.commitPageMismatch")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.commitPageMismatchDescription")}
                </AlertDescription>
              </Alert>
            ) : null}

            {files.length ? (
              <div className="flex min-w-0 flex-col gap-3">
                {files.map((file, index) => (
                  <CommitFile
                    key={`${file.sha ?? file.path}:${file.path}:${index}`}
                    file={file}
                    index={index}
                    viewType={viewType}
                    target={commentTarget}
                    repository={contentRepository}
                    comments={comments}
                    canCreateComment={canCreateComment}
                    onOpenFile={
                      onOpenFile
                        ? (selectedFile) =>
                            onOpenFile(
                              selectedFile,
                              selectedFile.status === "removed"
                                ? (commit.parents[0]?.sha ?? commit.sha)
                                : commit.sha
                            )
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <Empty className="min-h-48 border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileDiff />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.repositories.noCommitFiles")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}

            {laterError ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.commitNextPageFailed")}</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{laterError.message}</span>
                  {isRetryableCommitDetailError(laterError) ? (
                    <Button variant="outline" size="xs" onClick={() => void result.fetchNextPage()}>
                      <RefreshCw data-icon="inline-start" />
                      {t("workspace.repositories.retry")}
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {result.hasNextPage && !pageMismatch && !laterError ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={result.isFetchingNextPage}
                  onClick={() => void result.fetchNextPage()}
                >
                  {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                  {t(
                    result.isFetchingNextPage
                      ? "workspace.repositories.loadingMoreCommitFiles"
                      : "workspace.repositories.loadMoreCommitFiles"
                  )}
                </Button>
              </div>
            ) : null}

            {filesAtLimit ? (
              <Alert>
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.commitFileLimit")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.commitFileLimitDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </GitHubCommitCommentsWorkspace>
    </div>
  );
}
