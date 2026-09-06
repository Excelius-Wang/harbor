import { lazy, Suspense, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { RadioGroup } from "@/components/ui/radio-group";
import { isTauri } from "@tauri-apps/api/core";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BookMarked,
  CircleAlert,
  CircleDot,
  Code2,
  ExternalLink,
  FileCode2,
  Flame,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Search,
  Star,
  Tag,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useListScroll } from "@/hooks/use-list-scroll";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubDeveloperFeedEvent,
  GitHubDiscoveryCodeResult,
  GitHubDiscoverySearchKind,
  GitHubDiscoverySearchPage,
  GitHubDiscoverySearchSort,
  GitHubIssueRepository,
  GitHubIssueSummary,
  GitHubPullRequestRepository,
  GitHubPullRequestSummary,
  GitHubRepository,
  GitHubUserSummary,
} from "./github-data";
import { GitHubIssueRow } from "./github-issue-row";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import { repositoryLanguageColor } from "./github-language-color";
import { GitHubPullRequestRow } from "./github-pull-request-row";
import {
  developerFeedQueryOptions,
  discoverySearchQueryOptions,
  repositoryIssueDetailQueryOptions,
  repositoryPullRequestDetailQueryOptions,
} from "./github-queries";
import { GitHubTrendingDevelopers } from "./github-trending-developers";
import {
  DEFAULT_TRENDING_FILTERS,
  trendingWebUrl,
  type GitHubTrendingKind,
  type GitHubTrendingPeriod as TrendingPeriod,
} from "./github-trending";

const GitHubCodeView = lazy(() =>
  import("./github-code-view").then((module) => ({ default: module.GitHubCodeView }))
);
const GitHubIssueDetail = lazy(() =>
  import("./github-issue-detail").then((module) => ({ default: module.GitHubIssueDetail }))
);
const GitHubPullRequestDetail = lazy(() =>
  import("./github-pull-request-detail").then((module) => ({
    default: module.GitHubPullRequestDetail,
  }))
);
const GitHubProfileView = lazy(() =>
  import("./github-profile-view").then((module) => ({ default: module.GitHubProfileView }))
);

type DiscoveryMode = "trending" | "feed" | "search";

type DiscoverySelection =
  | { kind: "repository"; repository: GitHubRepository }
  | { kind: "code"; result: GitHubDiscoveryCodeResult }
  | { kind: "issue"; repository: GitHubIssueRepository; number: number }
  | { kind: "pullRequest"; repository: GitHubPullRequestRepository; number: number }
  | { kind: "user"; user: Pick<GitHubUserSummary, "login"> };

export type GitHubDiscoveryRepositoryTarget = {
  owner: string;
  name: string;
  fullName: string;
  url: string;
};

const SEARCH_TABS: GitHubDiscoverySearchKind[] = [
  "repositories",
  "code",
  "issues",
  "pullRequests",
  "users",
];

const TRENDING_PERIOD_DAYS: Record<TrendingPeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

function trendingSearchQuery(period: TrendingPeriod, now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - TRENDING_PERIOD_DAYS[period]);
  return `created:>=${start.toISOString().slice(0, 10)} fork:false archived:false`;
}

const SORTS: Record<
  GitHubDiscoverySearchKind,
  Array<{ value: GitHubDiscoverySearchSort; label: string }>
> = {
  repositories: [
    { value: "bestMatch", label: "bestMatch" },
    { value: "stars", label: "stars" },
    { value: "forks", label: "forks" },
    { value: "updated", label: "updated" },
  ],
  code: [
    { value: "bestMatch", label: "bestMatch" },
    { value: "indexed", label: "indexed" },
  ],
  issues: [
    { value: "bestMatch", label: "bestMatch" },
    { value: "updated", label: "updated" },
    { value: "comments", label: "comments" },
  ],
  pullRequests: [
    { value: "bestMatch", label: "bestMatch" },
    { value: "updated", label: "updated" },
    { value: "comments", label: "comments" },
  ],
  users: [
    { value: "bestMatch", label: "bestMatch" },
    { value: "followers", label: "followers" },
    { value: "repositories", label: "repositories" },
    { value: "joined", label: "joined" },
  ],
};

function SearchSkeletons({ kind = "repositories" }: { kind?: GitHubDiscoverySearchKind | "feed" }) {
  const { t } = useTranslation();
  const avatar = kind === "users" || kind === "feed";
  const icon = kind === "issues" || kind === "pullRequests";
  return (
    <div role="status" aria-label={t("workspace.discovery.loading")}>
      <div className="flex flex-col p-2" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="harbor-result-row flex items-start gap-3 px-4 py-4">
            {avatar ? (
              <Skeleton className="size-9 shrink-0 rounded-full" />
            ) : kind === "code" ? (
              <Skeleton className="size-9 shrink-0" />
            ) : icon ? (
              <Skeleton className="mt-1 size-4 shrink-0 rounded-full" />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              {kind !== "users" ? (
                <>
                  {kind === "code" ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <>
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                    </>
                  )}
                  <div className="flex gap-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function eventIcon(eventType: string) {
  if (eventType === "PushEvent") return GitCommitHorizontal;
  if (eventType.includes("PullRequest")) return GitPullRequest;
  if (eventType === "IssuesEvent") return CircleDot;
  if (eventType === "ForkEvent") return GitFork;
  if (eventType === "WatchEvent") return Star;
  if (eventType === "CreateEvent" || eventType === "DeleteEvent") return Tag;
  if (eventType.includes("Comment") || eventType.includes("Discussion")) {
    return MessageSquareText;
  }
  return FileCode2;
}

function feedRepository(event: GitHubDeveloperFeedEvent): GitHubRepository {
  return {
    id: event.repository.id,
    owner: event.repository.owner,
    name: event.repository.name,
    fullName: event.repository.fullName,
    url: event.repository.url,
    stars: 0,
    forks: 0,
    openIssues: 0,
    defaultBranch: "HEAD",
    isPrivate: false,
    isFork: false,
    isArchived: false,
  };
}

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

function DeveloperFeed({
  onSelect,
  scroll,
}: {
  onSelect: (selection: DiscoverySelection) => void;
  scroll: ReturnType<typeof useListScroll>;
}) {
  const { t, i18n } = useTranslation();
  const desktopRuntime = isTauri();
  const result = useInfiniteQuery({
    ...developerFeedQueryOptions(),
    enabled: desktopRuntime,
  });
  const events = result.data?.pages.flatMap((page) => page.events) ?? [];
  const nextPageError = result.isFetchNextPageError ? parseIpcError(result.error).message : null;
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.discovery.desktopOnly") }
    : result.error && !result.isFetchNextPageError
      ? parseIpcError(result.error)
      : null;

  const openEvent = (event: GitHubDeveloperFeedEvent) => {
    if (event.eventType === "IssuesEvent" && event.resourceNumber) {
      onSelect({
        kind: "issue",
        number: event.resourceNumber,
        repository: {
          owner: event.repository.owner,
          name: event.repository.name,
          fullName: event.repository.fullName,
          url: event.repository.url,
          defaultBranch: "HEAD",
        },
      });
      return;
    }
    if (event.eventType.includes("PullRequest") && event.resourceNumber) {
      onSelect({
        kind: "pullRequest",
        number: event.resourceNumber,
        repository: {
          owner: event.repository.owner,
          name: event.repository.name,
          fullName: event.repository.fullName,
          url: event.repository.url,
        },
      });
      return;
    }
    onSelect({ kind: "repository", repository: feedRepository(event) });
  };

  const renderEvents = () => {
    if (result.isPending && !error) return <SearchSkeletons kind="feed" />;

    if (error && !result.data) {
      return (
        <Empty className="min-h-[360px]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleAlert />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.discovery.feedFailed")}</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("common.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    if (!events.length) {
      return (
        <Empty className="min-h-[360px]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.discovery.emptyFeed")}</EmptyTitle>
            <EmptyDescription>{t("workspace.discovery.emptyFeedDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <div className="@container/discovery-feed flex flex-col">
        {events.map((event) => {
          const Icon = eventIcon(event.eventType);
          const action = event.action
            ? t(`workspace.profile.actions.${event.action}`, { defaultValue: event.action })
            : undefined;
          return (
            <article
              key={event.id}
              className="harbor-result-row grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 gap-y-1 px-6 py-4 @min-[960px]/discovery-feed:grid-cols-[36px_minmax(0,1fr)_auto]"
            >
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full"
                aria-label={t("workspace.discovery.openProfile", { username: event.actor.login })}
                title={t("workspace.discovery.openProfile", { username: event.actor.login })}
                onClick={() => onSelect({ kind: "user", user: event.actor })}
              >
                <Avatar className="size-8">
                  <AvatarImage src={event.actor.avatarUrl} alt={`@${event.actor.login}`} />
                  <AvatarFallback>{initials(event.actor.login)}</AvatarFallback>
                </Avatar>
              </Button>
              <Button
                variant="ghost"
                className="h-auto min-w-0 justify-start rounded-[8px] px-2 py-1 text-left whitespace-normal"
                onClick={() => openEvent(event)}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2 text-[13px]">
                    <Icon className="text-primary shrink-0" />
                    <span className="min-w-0 leading-5">
                      {t(`workspace.discovery.events.${event.eventType}`, {
                        defaultValue: t("workspace.discovery.events.fallback"),
                        action,
                        actor: event.actor.login,
                        count: event.commitCount ?? 0,
                        number: event.resourceNumber,
                        reference: event.reference,
                        repository: event.repository.fullName,
                        title: event.resourceTitle,
                        type: event.eventType,
                      })}
                    </span>
                  </span>
                  {event.resourceTitle ? (
                    <span className="text-muted-foreground text-[13px] leading-5 font-normal wrap-anywhere">
                      {event.resourceTitle}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground flex items-center gap-2 text-[11px] font-normal">
                    <span className="truncate">{event.repository.fullName}</span>
                    {!event.public ? (
                      <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                        <LockKeyhole /> {t("workspace.discovery.privateEvent")}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </Button>
              <time className="text-muted-foreground col-start-2 px-2 text-[11px] @min-[960px]/discovery-feed:col-start-3 @min-[960px]/discovery-feed:row-start-1 @min-[960px]/discovery-feed:pt-2">
                {formatIssueDate(event.createdAt, i18n.language)}
              </time>
            </article>
          );
        })}
        {nextPageError ? (
          <Alert variant="destructive" className="mx-6 mt-3 w-auto">
            <CircleAlert />
            <AlertTitle>{t("workspace.discovery.feedMoreFailed")}</AlertTitle>
            <AlertDescription>{nextPageError}</AlertDescription>
          </Alert>
        ) : null}
        {result.hasNextPage ? (
          <div className="flex justify-center p-4">
            <Button
              variant="outline"
              size="sm"
              disabled={result.isFetching}
              onClick={() => void result.fetchNextPage()}
            >
              {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
              {t("common.loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" aria-busy={result.isFetching}>
      <div className="text-muted-foreground flex min-h-11 shrink-0 flex-wrap items-center gap-3 px-6 py-2 text-[11px]">
        <span className="min-w-0 flex-1">{t("workspace.discovery.feedWindow")}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.refresh")}
          title={t("common.refresh")}
          disabled={!desktopRuntime || result.isFetching}
          onClick={() => void result.refetch()}
        >
          <RefreshCw />
        </Button>
      </div>
      {error && result.data ? (
        <WorkspaceStaleNotice
          message={error.message}
          onRetry={() => void result.refetch()}
          retryDisabled={result.isFetching}
        />
      ) : null}
      <ScrollArea className="min-h-0 flex-1" constrainContentWidth {...scroll}>
        {renderEvents()}
      </ScrollArea>
      {result.isFetching && result.data ? (
        <div
          role="status"
          aria-label={t("workspace.discovery.loading")}
          className="pointer-events-none absolute inset-x-0 top-0"
        >
          <Progress aria-hidden="true" className="h-0.5 rounded-none bg-transparent" />
        </div>
      ) : null}
    </div>
  );
}

function RepositoryResultRow({
  repository,
  onSelect,
}: {
  repository: GitHubRepository;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Button
      variant="ghost"
      onClick={onSelect}
      aria-label={repository.fullName}
      className="harbor-result-row h-auto w-full items-start justify-start rounded-none px-4 py-4 text-left whitespace-normal transition-[background-color,color]"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex min-w-0 items-baseline text-[14px] leading-5 tracking-[-0.015em]">
            <span className="text-muted-foreground max-w-[45%] truncate font-normal">
              {repository.owner}/
            </span>
            <span className="harbor-repository-name text-primary truncate font-semibold">
              {repository.name}
            </span>
          </span>
          {repository.isPrivate ? <LockKeyhole className="text-muted-foreground" /> : null}
          {repository.isArchived ? (
            <Badge variant="secondary" className="h-5 rounded-[4px] px-1.5 font-normal">
              <Archive /> {t("workspace.repositories.archived")}
            </Badge>
          ) : null}
        </span>
        <span className="text-foreground max-w-[80ch] text-[13px] leading-5 font-normal wrap-anywhere">
          {repository.description ?? t("workspace.repositories.noDescription")}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-3 text-[11px] font-normal">
          {repository.language ? (
            <Badge
              variant="outline"
              className="harbor-language-badge h-5 rounded-[4px] px-1.5 text-[11px] font-medium"
              style={
                {
                  "--harbor-language-color": repositoryLanguageColor(repository.language),
                } as CSSProperties
              }
              data-language={repository.language}
            >
              {repository.language}
            </Badge>
          ) : null}
          <span
            className="text-foreground flex h-5 items-center gap-1.5 font-mono font-normal tabular-nums"
            data-metric="stars"
          >
            <Star className="text-attention/85" />
            {repository.stars.toLocaleString(i18n.language)}
          </span>
          <span
            className="text-muted-foreground flex h-5 items-center gap-1.5 font-mono font-normal tabular-nums"
            data-metric="forks"
          >
            <GitFork className="text-muted-foreground" />
            {repository.forks.toLocaleString(i18n.language)}
          </span>
        </span>
      </span>
    </Button>
  );
}

function CodeResultRow({
  result,
  onSelect,
}: {
  result: GitHubDiscoveryCodeResult;
  onSelect: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onSelect}
      aria-label={result.path}
      className="harbor-result-row h-auto w-full items-start justify-start gap-3 rounded-none px-4 py-4 text-left whitespace-normal"
    >
      <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
        <Code2 />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-[13px] font-medium">{result.path}</span>
        <span className="text-muted-foreground truncate text-[11px] font-normal">
          {result.repository.fullName}
        </span>
        {result.fragment ? (
          <code className="harbor-reading text-foreground rounded-md px-2.5 py-2 font-mono text-[13px] leading-5 wrap-anywhere whitespace-pre-wrap">
            {result.fragment}
          </code>
        ) : null}
      </span>
    </Button>
  );
}

function UserResultRow({ user, onSelect }: { user: GitHubUserSummary; onSelect: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onSelect}
      className="harbor-result-row h-auto w-full justify-start gap-3 rounded-none px-4 py-4 text-left"
    >
      <Avatar className="size-9">
        <AvatarImage src={user.avatarUrl} alt={`@${user.login}`} />
        <AvatarFallback>{initials(user.login)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{user.login}</span>
      <UserRound className="text-muted-foreground" />
    </Button>
  );
}

function SearchResults({
  data,
  locale,
  onSelect,
}: {
  data: GitHubDiscoverySearchPage;
  locale: string;
  onSelect: (selection: DiscoverySelection) => void;
}) {
  const queryClient = useQueryClient();
  switch (data.kind) {
    case "repositories":
      return (
        <div className="flex flex-col p-2">
          {data.results.map((repository) => (
            <RepositoryResultRow
              key={repository.id}
              repository={repository}
              onSelect={() => onSelect({ kind: "repository", repository })}
            />
          ))}
        </div>
      );
    case "code":
      return (
        <div className="flex flex-col gap-1.5 p-2">
          {data.results.map((result) => (
            <CodeResultRow
              key={`${result.repository.id}:${result.path}:${result.sha}`}
              result={result}
              onSelect={() => onSelect({ kind: "code", result })}
            />
          ))}
        </div>
      );
    case "issues":
      return (
        <div className="px-2">
          {data.results.map((summary: GitHubIssueSummary) => (
            <GitHubIssueRow
              key={summary.issue.id}
              issue={summary.issue}
              repository={summary.repository}
              locale={locale}
              showRepository
              onSelect={() =>
                onSelect({
                  kind: "issue",
                  repository: summary.repository,
                  number: summary.issue.number,
                })
              }
              onPrefetch={() =>
                void queryClient.prefetchQuery(
                  repositoryIssueDetailQueryOptions({
                    owner: summary.repository.owner,
                    repository: summary.repository.name,
                    issueNumber: summary.issue.number,
                    timelinePage: 1,
                  })
                )
              }
            />
          ))}
        </div>
      );
    case "pullRequests":
      return (
        <div className="px-2">
          {data.results.map((pullRequest: GitHubPullRequestSummary) => (
            <GitHubPullRequestRow
              key={pullRequest.id}
              pullRequest={pullRequest}
              locale={locale}
              showRepository
              onSelect={() =>
                onSelect({
                  kind: "pullRequest",
                  repository: pullRequest.repository,
                  number: pullRequest.number,
                })
              }
              onPrefetch={() =>
                void queryClient.prefetchQuery(
                  repositoryPullRequestDetailQueryOptions({
                    owner: pullRequest.repository.owner,
                    repository: pullRequest.repository.name,
                    pullRequestNumber: pullRequest.number,
                    timelinePage: 1,
                  })
                )
              }
            />
          ))}
        </div>
      );
    case "users":
      return (
        <div className="flex flex-col gap-1.5 p-2">
          {data.results.map((user) => (
            <UserResultRow
              key={user.id}
              user={user}
              onSelect={() => onSelect({ kind: "user", user })}
            />
          ))}
        </div>
      );
  }
}

function SelectionDetail({
  selection,
  onBack,
}: {
  selection: DiscoverySelection;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const fallback = (
    <div className="flex min-w-0 flex-1 items-center justify-center">
      <Spinner className="text-muted-foreground" />
    </div>
  );
  if (selection.kind === "repository") {
    return (
      <Suspense fallback={fallback}>
        <GitHubCodeView
          key={selection.repository.id}
          repository={selection.repository}
          backLabel={t("workspace.discovery.backToDiscovery")}
          onBack={onBack}
        />
      </Suspense>
    );
  }
  if (selection.kind === "code") {
    return (
      <Suspense fallback={fallback}>
        <GitHubCodeView
          key={`${selection.result.repository.id}:${selection.result.path}`}
          repository={selection.result.repository}
          initialPath={selection.result.path}
          backLabel={t("workspace.discovery.backToDiscovery")}
          onBack={onBack}
        />
      </Suspense>
    );
  }
  if (selection.kind === "issue") {
    return (
      <Suspense fallback={fallback}>
        <GitHubIssueDetail
          repository={selection.repository}
          issueNumber={selection.number}
          backLabel={t("workspace.discovery.backToDiscovery")}
          onBack={onBack}
        />
      </Suspense>
    );
  }
  if (selection.kind === "pullRequest") {
    return (
      <Suspense fallback={fallback}>
        <GitHubPullRequestDetail
          repository={selection.repository}
          pullRequestNumber={selection.number}
          backLabel={t("workspace.discovery.backToDiscovery")}
          onBack={onBack}
        />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={fallback}>
      <GitHubProfileView
        initialUsername={selection.user.login}
        backLabel={t("workspace.discovery.backToDiscovery")}
        onBack={onBack}
      />
    </Suspense>
  );
}

export function GitHubDiscoveryView({
  onSelectRepository,
}: {
  onSelectRepository: (repository: GitHubDiscoveryRepositoryTarget | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const desktopRuntime = isTauri();
  const [mode, setMode] = useState<DiscoveryMode>("trending");
  const [searchKind, setSearchKind] = useState<GitHubDiscoverySearchKind>("repositories");
  const [trendingKind, setTrendingKind] = useState<GitHubTrendingKind>("repositories");
  const [trendingPeriod, setTrendingPeriod] = useState<TrendingPeriod>("weekly");
  const [trendingFilters, setTrendingFilters] = useState(DEFAULT_TRENDING_FILTERS);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GitHubDiscoverySearchSort>("bestMatch");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<DiscoverySelection | null>(null);
  const kind = mode === "search" ? searchKind : "repositories";
  const activeQuery = mode === "trending" ? trendingSearchQuery(trendingPeriod) : query;
  const activeSort = mode === "trending" ? "stars" : sort;
  const listScroll = useListScroll(
    JSON.stringify(
      mode === "feed"
        ? ["feed"]
        : mode === "trending" && trendingKind === "developers"
          ? ["developers", trendingPeriod, trendingFilters.language, trendingFilters.sponsorable]
          : ["search", kind, activeQuery, activeSort, page]
    )
  );
  const search = useQuery({
    ...discoverySearchQueryOptions({ kind, query: activeQuery, sort: activeSort, page }),
    enabled:
      desktopRuntime &&
      mode !== "feed" &&
      (mode !== "trending" || trendingKind === "repositories") &&
      (mode === "trending" || query.length > 0) &&
      selection === null,
    placeholderData: (previous) => previous,
  });
  const data = search.data?.kind === kind ? search.data : undefined;
  const backgroundLoading =
    (mode !== "trending" || trendingKind === "repositories") && search.isFetching && Boolean(data);
  const searchError = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.discovery.desktopOnly") }
    : !data && search.error
      ? parseIpcError(search.error)
      : null;
  const sorts = SORTS[searchKind];
  const selectionRepository =
    selection?.kind === "repository"
      ? selection.repository
      : selection?.kind === "code"
        ? selection.result.repository
        : selection?.kind === "issue" || selection?.kind === "pullRequest"
          ? selection.repository
          : null;

  useEffect(() => {
    onSelectRepository(selectionRepository);
  }, [selectionRepository, onSelectRepository]);

  useEffect(() => () => onSelectRepository(null), [onSelectRepository]);

  if (selection) {
    return <SelectionDetail selection={selection} onBack={() => setSelection(null)} />;
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = draftQuery.trim();
    if (!nextQuery) return;
    setQuery(nextQuery);
    setPage(1);
    setMode("search");
  };

  const changeMode = (value: string) => {
    setMode(value as DiscoveryMode);
    setPage(1);
  };

  const changeSearchKind = (value: string) => {
    setSearchKind(value as GitHubDiscoverySearchKind);
    setSort("bestMatch");
    setPage(1);
  };

  const selectResult = (nextSelection: DiscoverySelection) => {
    setSelection(nextSelection);
  };

  const openTrendingOnGitHub = () =>
    openExternalUrl(trendingWebUrl("repositories", trendingPeriod));

  const content = (
    <div
      className="relative mx-auto flex min-h-0 w-full max-w-[1120px] flex-1"
      aria-busy={backgroundLoading}
    >
      <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {mode === "trending" && trendingKind === "developers" ? (
            <GitHubTrendingDevelopers
              period={trendingPeriod}
              filters={trendingFilters}
              onFiltersChange={setTrendingFilters}
              onSelectDeveloper={(login) => setSelection({ kind: "user", user: { login } })}
              scroll={listScroll}
            />
          ) : mode === "feed" ? (
            <DeveloperFeed onSelect={setSelection} scroll={listScroll} />
          ) : mode === "search" && !query ? (
            <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
              <Empty className="min-h-[340px]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.discovery.startSearch")}</EmptyTitle>
                  <EmptyDescription>{t("workspace.discovery.queryHelp")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </ScrollArea>
          ) : searchError ? (
            <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
              <Empty className="min-h-[340px]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.discovery.searchFailed")}</EmptyTitle>
                  <EmptyDescription>{searchError.message}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void search.refetch()}>
                      <RefreshCw data-icon="inline-start" />
                      {t("common.retry")}
                    </Button>
                    {mode === "trending" ? (
                      <Button variant="ghost" size="sm" onClick={() => void openTrendingOnGitHub()}>
                        <ExternalLink data-icon="inline-start" />
                        {t("workspace.discovery.viewTrendingOnGitHub")}
                      </Button>
                    ) : null}
                  </div>
                </EmptyContent>
              </Empty>
            </ScrollArea>
          ) : search.isPending || !data ? (
            <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
              <SearchSkeletons kind={kind} />
            </ScrollArea>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col">
                {search.error && data ? (
                  <WorkspaceStaleNotice
                    message={parseIpcError(search.error).message}
                    onRetry={() => void search.refetch()}
                    retryDisabled={search.isFetching}
                  />
                ) : null}
                <div className="text-muted-foreground flex min-h-11 shrink-0 flex-wrap items-center gap-3 px-6 py-2 text-[11px]">
                  {mode === "trending" ? (
                    <span>{t("workspace.discovery.trendingMethod")}</span>
                  ) : (
                    <>
                      <span>
                        {t("workspace.discovery.resultCount", {
                          count: data.totalCount,
                        })}
                      </span>
                      <code className="bg-muted/50 min-w-0 truncate rounded px-1.5 py-0.5 font-mono">
                        {query}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto"
                        aria-label={t("workspace.discovery.openSearchOnGitHub")}
                        title={t("workspace.discovery.openSearchOnGitHub")}
                        onClick={() =>
                          void openExternalUrl(
                            `https://github.com/search?q=${encodeURIComponent(query)}&type=${
                              searchKind === "pullRequests" ? "pullrequests" : searchKind
                            }`
                          )
                        }
                      >
                        <ExternalLink />
                      </Button>
                    </>
                  )}
                </div>
                {data.incompleteResults ? (
                  <Alert className="m-3 mb-0">
                    <CircleAlert />
                    <AlertTitle>{t("workspace.discovery.incompleteTitle")}</AlertTitle>
                    <AlertDescription>
                      {t("workspace.discovery.incompleteDescription")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <ScrollArea className="min-h-0 flex-1" constrainContentWidth {...listScroll}>
                  {data.results.length ? (
                    <SearchResults data={data} locale={i18n.language} onSelect={selectResult} />
                  ) : (
                    <Empty className="min-h-[340px]">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          {mode === "trending" ? <Flame /> : <Search />}
                        </EmptyMedia>
                        <EmptyTitle>
                          {t(
                            mode === "trending"
                              ? "workspace.discovery.emptyTrending"
                              : "workspace.discovery.noResults"
                          )}
                        </EmptyTitle>
                        <EmptyDescription>
                          {t(
                            mode === "trending"
                              ? "workspace.discovery.emptyTrendingDescription"
                              : "workspace.discovery.noResultsDescription"
                          )}
                        </EmptyDescription>
                      </EmptyHeader>
                      {mode === "trending" ? (
                        <EmptyContent>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openTrendingOnGitHub()}
                          >
                            <ExternalLink data-icon="inline-start" />
                            {t("workspace.discovery.viewTrendingOnGitHub")}
                          </Button>
                        </EmptyContent>
                      ) : null}
                    </Empty>
                  )}
                </ScrollArea>
              </div>
              <GitHubPagination
                page={data.page}
                hasPrevious={data.hasPrevious}
                hasMore={data.hasMore}
                onPageChange={setPage}
                ariaLabel={t("workspace.discovery.pagination")}
              />
            </>
          )}
          {backgroundLoading ? (
            <div
              role="status"
              aria-label={t("workspace.discovery.loading")}
              className="pointer-events-none absolute inset-x-0 top-0"
            >
              <Progress aria-hidden="true" className="h-0.5 rounded-none bg-transparent" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <Tabs
      value={trendingKind}
      onValueChange={(value) => {
        setTrendingKind(value as GitHubTrendingKind);
        setPage(1);
      }}
      className="gap-0"
      asChild
    >
      <section className="harbor-content flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="harbor-subtle-divider shrink-0 border-b">
          <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-6 py-4">
            <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2.5">
              <h1 className="shrink-0 text-2xl font-semibold tracking-[-0.04em]">
                {t("workspace.nav.discover")}
              </h1>
              <RadioGroup
                value={mode}
                onValueChange={changeMode}
                aria-label={t("workspace.discovery.modes")}
                className="harbor-segmented bg-muted text-muted-foreground flex h-10 w-fit min-w-0 items-center justify-start gap-1 rounded-lg p-1"
              >
                {(["trending", "feed", "search"] as const).map((value) => {
                  const Icon =
                    value === "trending" ? Flame : value === "feed" ? UsersRound : Search;
                  return (
                    <RadioGroupPrimitive.Item key={value} value={value} asChild>
                      <Button variant="ghost" size="sm" className="h-full rounded-[6px] px-3.5">
                        <Icon /> {t(`workspace.discovery.tabs.${value}`)}
                      </Button>
                    </RadioGroupPrimitive.Item>
                  );
                })}
              </RadioGroup>

              {mode === "trending" ? (
                <div className="ml-auto shrink-0">
                  <Select
                    value={trendingPeriod}
                    onValueChange={(value) => {
                      setTrendingPeriod(value as TrendingPeriod);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="harbor-filter-trigger min-w-32"
                      aria-label={t("workspace.discovery.trendingPeriod")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(["daily", "weekly", "monthly"] as const).map((period) => (
                          <SelectItem key={period} value={period}>
                            {t(`workspace.discovery.period.${period}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {mode === "trending" ? (
              <TabsList variant="line" aria-label={t("workspace.discovery.trendingKind")}>
                <TabsTrigger value="repositories">
                  <BookMarked />
                  {t("workspace.discovery.tabs.repositories")}
                </TabsTrigger>
                <TabsTrigger value="developers">
                  <UsersRound />
                  {t("workspace.discovery.developers.tab")}
                </TabsTrigger>
              </TabsList>
            ) : null}
            {mode === "search" ? (
              <form
                onSubmit={submitSearch}
                role="search"
                className="harbor-surface rounded-[10px] p-2.5"
              >
                <FieldGroup className="flex-row flex-wrap gap-2">
                  <Field className="min-w-64 flex-1 gap-0">
                    <FieldLabel htmlFor="discovery-search" className="sr-only">
                      {t("workspace.discovery.searchLabel")}
                    </FieldLabel>
                    <Input
                      id="discovery-search"
                      value={draftQuery}
                      onChange={(event) => setDraftQuery(event.currentTarget.value)}
                      placeholder={t("workspace.discovery.searchPlaceholder")}
                      className="rounded-[8px] px-4"
                    />
                  </Field>
                  <Field className="w-40 shrink-0 gap-0">
                    <FieldLabel className="sr-only">
                      {t("workspace.discovery.searchKind")}
                    </FieldLabel>
                    <Select value={searchKind} onValueChange={changeSearchKind}>
                      <SelectTrigger
                        className="rounded-[8px] px-4"
                        aria-label={t("workspace.discovery.searchKind")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {SEARCH_TABS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {t(`workspace.discovery.tabs.${option}`)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="w-40 shrink-0 gap-0">
                    <FieldLabel className="sr-only">
                      {t("workspace.discovery.searchSort")}
                    </FieldLabel>
                    <Select
                      value={sort}
                      onValueChange={(value) => {
                        setSort(value as GitHubDiscoverySearchSort);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger
                        className="rounded-[8px] px-4"
                        aria-label={t("workspace.discovery.searchSort")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {sorts.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(`workspace.discovery.sort.${option.label}`)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button
                    type="submit"
                    className="rounded-[8px] px-4"
                    disabled={!draftQuery.trim()}
                  >
                    <Search data-icon="inline-start" />
                    {t("workspace.discovery.search")}
                  </Button>
                </FieldGroup>
              </form>
            ) : null}
          </div>
        </header>

        {mode === "trending" ? (
          <TabsContent value={trendingKind} className="flex min-h-0 flex-1 flex-col">
            {content}
          </TabsContent>
        ) : (
          content
        )}
      </section>
    </Tabs>
  );
}
