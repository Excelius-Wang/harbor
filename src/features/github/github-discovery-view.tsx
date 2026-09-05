import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CircleAlert,
  CircleDot,
  Code2,
  ExternalLink,
  FileCode2,
  FolderGit2,
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
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { GitHubPullRequestRow } from "./github-pull-request-row";
import {
  developerFeedQueryOptions,
  discoverySearchQueryOptions,
  repositoryIssueDetailQueryOptions,
  repositoryPullRequestDetailQueryOptions,
} from "./github-queries";

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

type DiscoveryTab = "feed" | GitHubDiscoverySearchKind;

type DiscoverySelection =
  | { kind: "repository"; repository: GitHubRepository }
  | { kind: "code"; result: GitHubDiscoveryCodeResult }
  | { kind: "issue"; repository: GitHubIssueRepository; number: number }
  | { kind: "pullRequest"; repository: GitHubPullRequestRepository; number: number }
  | { kind: "user"; user: GitHubUserSummary };

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

function SearchSkeletons() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-start gap-3 border-b px-4 py-4">
          <Skeleton className="size-9 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
        </div>
      ))}
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

function DeveloperFeed({ onSelect }: { onSelect: (selection: DiscoverySelection) => void }) {
  const { t, i18n } = useTranslation();
  const desktopRuntime = isTauri();
  const result = useInfiniteQuery({
    ...developerFeedQueryOptions(),
    enabled: desktopRuntime,
  });
  const events = result.data?.pages.flatMap((page) => page.events) ?? [];
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.discovery.desktopOnly") }
    : result.error
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

  if (result.isPending) return <SearchSkeletons />;

  if (error) {
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
    <div className="flex flex-col">
      {events.map((event) => {
        const Icon = eventIcon(event.eventType);
        const action = event.action
          ? t(`workspace.profile.actions.${event.action}`, { defaultValue: event.action })
          : undefined;
        return (
          <article
            key={event.id}
            className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 border-b px-4 py-3.5"
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              aria-label={t("workspace.discovery.openProfile", { username: event.actor.login })}
              onClick={() => onSelect({ kind: "user", user: event.actor })}
            >
              <Avatar className="size-8">
                <AvatarImage src={event.actor.avatarUrl} alt={`@${event.actor.login}`} />
                <AvatarFallback>{initials(event.actor.login)}</AvatarFallback>
              </Avatar>
            </Button>
            <Button
              variant="ghost"
              className="h-auto min-w-0 justify-start rounded-md px-2 py-1 text-left whitespace-normal"
              onClick={() => openEvent(event)}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2 text-xs">
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
                  <span className="text-muted-foreground truncate text-[10px] font-normal">
                    {event.resourceTitle}
                  </span>
                ) : null}
                <span className="text-muted-foreground flex items-center gap-2 text-[10px] font-normal">
                  <span className="truncate">{event.repository.fullName}</span>
                  {!event.public ? (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                      <LockKeyhole /> {t("workspace.discovery.privateEvent")}
                    </Badge>
                  ) : null}
                </span>
              </span>
            </Button>
            <time className="text-muted-foreground pt-2 text-[10px] whitespace-nowrap">
              {formatIssueDate(event.createdAt, i18n.language)}
            </time>
          </article>
        );
      })}
      {result.hasNextPage ? (
        <div className="flex justify-center p-4">
          <Button
            variant="outline"
            size="sm"
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
            {t("common.loadMore")}
          </Button>
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
      className="h-auto w-full items-start justify-start gap-3 rounded-none border-b px-4 py-3.5 text-left whitespace-normal"
    >
      <span className="border-primary/25 bg-primary/8 text-primary grid size-9 shrink-0 place-items-center rounded-md border text-xs font-semibold uppercase">
        {repository.name.charAt(0)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{repository.fullName}</span>
          {repository.isPrivate ? <LockKeyhole className="text-muted-foreground" /> : null}
          {repository.isArchived ? (
            <Badge variant="secondary" className="h-5 px-1.5 font-normal">
              <Archive /> {t("workspace.repositories.archived")}
            </Badge>
          ) : null}
        </span>
        <span className="text-muted-foreground line-clamp-2 text-[11px] leading-5 font-normal">
          {repository.description ?? t("workspace.repositories.noDescription")}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-3 text-[10px] font-normal">
          {repository.language ? <span>{repository.language}</span> : null}
          <span className="flex items-center gap-1">
            <Star /> {repository.stars.toLocaleString(i18n.language)}
          </span>
          <span className="flex items-center gap-1">
            <GitFork /> {repository.forks.toLocaleString(i18n.language)}
          </span>
          {repository.updatedAt ? (
            <span>{formatIssueDate(repository.updatedAt, i18n.language)}</span>
          ) : null}
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
      className="h-auto w-full items-start justify-start gap-3 rounded-none border-b px-4 py-3.5 text-left whitespace-normal"
    >
      <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
        <Code2 />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-[13px] font-medium">{result.path}</span>
        <span className="text-muted-foreground truncate text-[10px] font-normal">
          {result.repository.fullName}
        </span>
        {result.fragment ? (
          <code className="bg-muted/45 text-muted-foreground line-clamp-3 rounded-md px-2.5 py-2 font-mono text-[10px] leading-4 whitespace-pre-wrap">
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
      className="h-auto w-full justify-start gap-3 rounded-none border-b px-4 py-3.5 text-left"
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
      return data.results.map((repository) => (
        <RepositoryResultRow
          key={repository.id}
          repository={repository}
          onSelect={() => onSelect({ kind: "repository", repository })}
        />
      ));
    case "code":
      return data.results.map((result) => (
        <CodeResultRow
          key={`${result.repository.id}:${result.path}:${result.sha}`}
          result={result}
          onSelect={() => onSelect({ kind: "code", result })}
        />
      ));
    case "issues":
      return data.results.map((summary: GitHubIssueSummary) => (
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
      ));
    case "pullRequests":
      return data.results.map((pullRequest: GitHubPullRequestSummary) => (
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
      ));
    case "users":
      return data.results.map((user) => (
        <UserResultRow
          key={user.id}
          user={user}
          onSelect={() => onSelect({ kind: "user", user })}
        />
      ));
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
  const [tab, setTab] = useState<DiscoveryTab>("feed");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GitHubDiscoverySearchSort>("bestMatch");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<DiscoverySelection | null>(null);
  const kind = tab === "feed" ? "repositories" : tab;
  const search = useQuery({
    ...discoverySearchQueryOptions({ kind, query, sort, page }),
    enabled: desktopRuntime && tab !== "feed" && query.length > 0 && selection === null,
    placeholderData: (previous) => previous,
  });
  const data = search.data;
  const searchError = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.discovery.desktopOnly") }
    : !data && search.error
      ? parseIpcError(search.error)
      : null;
  const sorts = SORTS[kind];

  useEffect(() => {
    const repository =
      selection?.kind === "repository"
        ? selection.repository
        : selection?.kind === "code"
          ? selection.result.repository
          : selection?.kind === "issue" || selection?.kind === "pullRequest"
            ? selection.repository
            : null;
    onSelectRepository(repository);
  }, [onSelectRepository, selection]);

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
    if (tab === "feed") setTab("repositories");
  };

  const changeTab = (value: string) => {
    setTab(value as DiscoveryTab);
    setSort("bestMatch");
    setPage(1);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--background)_95%,transparent)]">
      <header className="shrink-0 border-b border-white/[0.075] px-5 pt-4">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3">
          <div className="flex items-end justify-between gap-5 max-[760px]:items-start">
            <div className="shrink-0">
              <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
                {t("workspace.discovery.eyebrow")}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em]">
                {t("workspace.nav.discover")}
              </h1>
            </div>
            <form
              onSubmit={submitSearch}
              role="search"
              className="flex w-full max-w-[680px] items-center gap-2 max-[760px]:max-w-none"
            >
              <div className="relative min-w-0 flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.currentTarget.value)}
                  aria-label={t("workspace.discovery.searchLabel")}
                  placeholder={t("workspace.discovery.searchPlaceholder")}
                  className="h-9 pl-9 font-mono text-xs"
                />
              </div>
              <Button type="submit" size="sm" disabled={!draftQuery.trim()}>
                <Search data-icon="inline-start" />
                {t("workspace.discovery.search")}
              </Button>
            </form>
          </div>
          <div className="flex items-end justify-between gap-3">
            <Tabs value={tab} onValueChange={changeTab} className="min-w-0 gap-0">
              <TabsList
                variant="line"
                className="scrollbar-none h-9 max-w-full justify-start gap-4 overflow-x-auto overflow-y-hidden p-0"
              >
                <TabsTrigger value="feed" className="px-1.5 text-xs after:bottom-0!">
                  <UsersRound /> {t("workspace.discovery.tabs.feed")}
                </TabsTrigger>
                {SEARCH_TABS.map((searchKind) => {
                  const Icon =
                    searchKind === "repositories"
                      ? FolderGit2
                      : searchKind === "code"
                        ? Code2
                        : searchKind === "issues"
                          ? CircleDot
                          : searchKind === "pullRequests"
                            ? GitPullRequest
                            : UserRound;
                  return (
                    <TabsTrigger
                      key={searchKind}
                      value={searchKind}
                      className="px-1.5 text-xs after:bottom-0!"
                    >
                      <Icon /> {t(`workspace.discovery.tabs.${searchKind}`)}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            {tab === "feed" ? (
              <span className="text-muted-foreground hidden pb-2 text-[10px] min-[1240px]:block">
                {t("workspace.discovery.feedWindow")}
              </span>
            ) : (
              <Select
                value={sort}
                onValueChange={(value) => {
                  setSort(value as GitHubDiscoverySearchSort);
                  setPage(1);
                }}
              >
                <SelectTrigger size="sm" className="mb-1 w-40 shrink-0">
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
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col border-x border-white/[0.055]">
        {tab === "feed" ? (
          <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
            <DeveloperFeed onSelect={setSelection} />
          </ScrollArea>
        ) : !query ? (
          <Empty className="min-h-[420px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.discovery.startSearch")}</EmptyTitle>
              <EmptyDescription>{t("workspace.discovery.queryHelp")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : searchError ? (
          <Empty className="min-h-[420px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.discovery.searchFailed")}</EmptyTitle>
              <EmptyDescription>{searchError.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => void search.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("common.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : search.isPending || !data ? (
          <SearchSkeletons />
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="text-muted-foreground flex min-h-9 shrink-0 items-center gap-3 border-b px-4 text-[10px]">
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
                  onClick={() =>
                    void openExternalUrl(
                      `https://github.com/search?q=${encodeURIComponent(query)}&type=${
                        tab === "pullRequests" ? "pullrequests" : tab
                      }`
                    )
                  }
                >
                  <ExternalLink />
                </Button>
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
              <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
                {data.results.length ? (
                  <SearchResults data={data} locale={i18n.language} onSelect={setSelection} />
                ) : (
                  <Empty className="min-h-[340px]">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Search />
                      </EmptyMedia>
                      <EmptyTitle>{t("workspace.discovery.noResults")}</EmptyTitle>
                      <EmptyDescription>
                        {t("workspace.discovery.noResultsDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
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
      </div>
    </section>
  );
}
