import { WorkspacePageHeader } from "@/features/workspace/workspace-page-header";
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import {
  Archive,
  BarChart3,
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Code2,
  ExternalLink,
  FolderGit2,
  GitFork,
  Github,
  GitPullRequest,
  LockKeyhole,
  MessageCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Book,
  Rocket,
  Search,
  ShieldAlert,
  Star,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError, type IpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import { GitHubActionsView } from "./github-actions-view";
import type { GitHubRepository, GitHubStarredRepositorySort } from "./github-data";
import { formatIssueDate } from "./github-issue-shared";
import { GitHubIssueView } from "./github-issue-view";
import { GitHubPullRequestView } from "./github-pull-request-view";
import {
  repositoriesQueryOptions,
  repositoryRelationshipQueryOptions,
  starredRepositoriesQueryOptions,
} from "./github-queries";
import { GitHubRepositoryCreateDialog } from "./github-repository-create-dialog";
import { GitHubRepositoryRelationshipActions } from "./github-repository-relationship-actions";

const GitHubDiscussionView = lazy(() =>
  import("./github-discussion-view").then((module) => ({ default: module.GitHubDiscussionView }))
);

const GitHubCodeView = lazy(() =>
  import("./github-code-view").then((module) => ({ default: module.GitHubCodeView }))
);

const GitHubReleaseView = lazy(() =>
  import("./github-release-view").then((module) => ({ default: module.GitHubReleaseView }))
);

const GitHubWikiView = lazy(() =>
  import("./github-wiki-view").then((module) => ({ default: module.GitHubWikiView }))
);

const GitHubSecurityView = lazy(() =>
  import("./github-security-view").then((module) => ({ default: module.GitHubSecurityView }))
);

const GitHubInsightsView = lazy(() =>
  import("./github-insights-view").then((module) => ({ default: module.GitHubInsightsView }))
);

const GitHubRepositorySettingsView = lazy(() =>
  import("./github-repository-settings-view").then((module) => ({
    default: module.GitHubRepositorySettingsView,
  }))
);

type RepositoryTab =
  | "code"
  | "wiki"
  | "releases"
  | "issues"
  | "pullRequests"
  | "discussions"
  | "actions"
  | "security"
  | "insights"
  | "settings";

type RepositorySource = "mine" | "starred";

type GitHubRepositoryBrowserProps = {
  onSelectRepository: (repository: GitHubRepository | null) => void;
};

function RepositorySkeletons() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-md px-3 py-3">
          <Skeleton className="size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RepositoryRow({
  repository,
  starredAt,
  locale,
  selected,
  onSelect,
}: {
  repository: GitHubRepository;
  starredAt?: string;
  locale: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          onClick={onSelect}
          aria-label={repository.fullName}
          aria-current={selected ? "true" : undefined}
          className={cn(
            "harbor-result-row h-auto min-h-24 w-full items-start justify-start gap-3 rounded-md px-3 py-3 text-left whitespace-normal",
            selected && "bg-[var(--harbor-selected-fill)] hover:bg-[var(--harbor-selected-fill)]"
          )}
        >
          <Book className="text-muted-foreground mt-0.5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-medium">{repository.name}</span>
              {repository.isPrivate ? <LockKeyhole className="text-muted-foreground" /> : null}
            </span>
            <span className="text-muted-foreground truncate text-[11px] leading-4 font-normal">
              {repository.owner}
            </span>
            {repository.description ? (
              <span className="text-muted-foreground line-clamp-2 text-[11px] leading-4 font-normal [overflow-wrap:anywhere]">
                {repository.description}
              </span>
            ) : null}
            {starredAt ? (
              <span className="text-muted-foreground/80 flex items-center gap-1 text-[11px] font-normal">
                <Star className="text-attention size-3 fill-current" />
                {t("workspace.repositories.starredAt", {
                  date: formatIssueDate(starredAt, locale),
                })}
              </span>
            ) : null}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-80 [overflow-wrap:anywhere]">
        {repository.fullName}
      </TooltipContent>
    </Tooltip>
  );
}

function RepositoryDescription({ description }: { description?: string }) {
  const { t } = useTranslation();
  const contentId = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      setCanExpand(element.scrollHeight > lineHeight * 3 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, expanded]);

  return (
    <div className="min-w-0">
      <ScrollArea
        id={contentId}
        type="auto"
        role="region"
        viewportRef={(viewport) => {
          if (viewport) viewport.tabIndex = expanded ? 0 : -1;
        }}
        constrainContentWidth
        className="min-w-0 [&>[data-slot=scroll-area-viewport]]:max-h-24 @min-[480px]/repository-pane:[&>[data-slot=scroll-area-viewport]]:max-h-28"
        aria-label={t("workspace.repositories.descriptionLabel")}
      >
        <p
          ref={textRef}
          className={cn(
            "text-muted-foreground pr-2 text-xs leading-5 [overflow-wrap:anywhere]",
            !expanded && "line-clamp-3"
          )}
        >
          {description || t("workspace.repositories.noDescription")}
        </p>
      </ScrollArea>
      {canExpand || expanded ? (
        <Button
          variant="ghost"
          size="xs"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1"
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {t(
            expanded
              ? "workspace.repositories.collapseDescription"
              : "workspace.repositories.expandDescription"
          )}
        </Button>
      ) : null}
    </div>
  );
}

export function GitHubRepositoryBrowser({ onSelectRepository }: GitHubRepositoryBrowserProps) {
  const { t, i18n } = useTranslation();
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number | null>(null);
  const [repositoryQuery, setRepositoryQuery] = useState("");
  const [repositorySource, setRepositorySource] = useState<RepositorySource>("mine");
  const [starredSort, setStarredSort] = useState<GitHubStarredRepositorySort>("starred");
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<RepositoryTab>("code");
  const desktopRuntime = isTauri();
  const repositoriesResult = useInfiniteQuery({
    ...repositoriesQueryOptions(),
    enabled: desktopRuntime && repositorySource === "mine",
  });
  const starredRepositoriesResult = useInfiniteQuery({
    ...starredRepositoriesQueryOptions({ sort: starredSort }),
    enabled: desktopRuntime && repositorySource === "starred",
  });
  const repositories = useMemo(() => {
    const byId = new Map<number, GitHubRepository>();
    if (repositorySource === "mine") {
      for (const page of repositoriesResult.data?.pages ?? []) {
        for (const repository of page.repositories) {
          if (!byId.has(repository.id)) byId.set(repository.id, repository);
        }
      }
    } else {
      for (const page of starredRepositoriesResult.data?.pages ?? []) {
        for (const starred of page.repositories) {
          if (!byId.has(starred.repository.id)) byId.set(starred.repository.id, starred.repository);
        }
      }
    }
    return [...byId.values()];
  }, [repositoriesResult.data?.pages, repositorySource, starredRepositoriesResult.data?.pages]);
  const starredAtByRepositoryId = useMemo(() => {
    const values = new Map<number, string>();
    for (const page of starredRepositoriesResult.data?.pages ?? []) {
      for (const starred of page.repositories) {
        if (!values.has(starred.repository.id)) {
          values.set(starred.repository.id, starred.starredAt);
        }
      }
    }
    return values;
  }, [starredRepositoriesResult.data?.pages]);
  const activeResult = repositorySource === "mine" ? repositoriesResult : starredRepositoriesResult;
  const repositoriesLoaded = activeResult.data !== undefined;
  const repositoryLoading = activeResult.isPending;
  const repositoryError: IpcError | null = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.repositories.desktopOnly") }
    : activeResult.error
      ? parseIpcError(activeResult.error)
      : null;

  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.id === selectedRepositoryId) ?? null,
    [repositories, selectedRepositoryId]
  );
  const selectedRelationshipResult = useQuery({
    ...repositoryRelationshipQueryOptions({
      owner: selectedRepository?.owner ?? "unselected",
      repository: selectedRepository?.name ?? "unselected",
    }),
    enabled: desktopRuntime && selectedRepository !== null,
  });

  useEffect(() => {
    if (!repositoriesLoaded) return;
    setSelectedRepositoryId((current) => {
      if (current && repositories.some((repository) => repository.id === current)) {
        return current;
      }
      return repositories[0]?.id ?? null;
    });
  }, [repositories, repositoriesLoaded]);

  useEffect(() => {
    if (
      repositorySource !== "mine" ||
      !desktopRuntime ||
      !repositoriesResult.hasNextPage ||
      repositoriesResult.isFetchingNextPage ||
      repositoriesResult.isFetchNextPageError
    ) {
      return;
    }
    void repositoriesResult.fetchNextPage();
  }, [desktopRuntime, repositoriesResult, repositorySource]);

  useEffect(() => {
    if (
      repositorySource !== "starred" ||
      !desktopRuntime ||
      !starredRepositoriesResult.hasNextPage ||
      starredRepositoriesResult.isFetchingNextPage ||
      starredRepositoriesResult.isFetchNextPageError
    ) {
      return;
    }
    void starredRepositoriesResult.fetchNextPage();
  }, [desktopRuntime, repositorySource, starredRepositoriesResult]);

  useEffect(() => {
    onSelectRepository(selectedRepository);
  }, [onSelectRepository, selectedRepository]);

  useEffect(() => {
    setTab("code");
  }, [selectedRepository?.id]);

  const filteredRepositories = useMemo(() => {
    const query = repositoryQuery.trim().toLocaleLowerCase();
    if (!query) return repositories;
    return repositories.filter((repository) =>
      `${repository.fullName} ${repository.description ?? ""} ${repository.language ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [repositories, repositoryQuery]);

  if (repositoryError && !repositoriesLoaded) {
    const disconnected = repositoryError.code === "githubNotConnected";
    return (
      <section className="harbor-content grid min-w-0 flex-1 place-items-center p-6">
        <Empty className="harbor-subtle-divider max-w-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Github />
            </EmptyMedia>
            <EmptyTitle>
              {t(
                disconnected
                  ? "workspace.repositories.connectTitle"
                  : "workspace.repositories.loadFailed"
              )}
            </EmptyTitle>
            <EmptyDescription>
              {disconnected
                ? t("workspace.repositories.connectDescription")
                : repositoryError.message}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void activeResult.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      </section>
    );
  }

  return (
    <section className="harbor-content flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkspacePageHeader
        title={t("workspace.nav.repositories")}
        description={t("workspace.repositories.eyebrow")}
      >
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          {t("workspace.repositories.settings.newRepository")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void activeResult.refetch()}
          disabled={activeResult.isFetching}
        >
          {activeResult.isFetching ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {t("workspace.repositories.refresh")}
        </Button>
      </WorkspacePageHeader>

      {repositoryError && repositoriesLoaded ? (
        <Alert variant="destructive" className="m-3 mb-0">
          <Github />
          <AlertTitle>{t("workspace.repositories.loadFailed")}</AlertTitle>
          <AlertDescription>
            <p>{repositoryError.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void (activeResult.isFetchNextPageError
                  ? activeResult.fetchNextPage()
                  : activeResult.refetch())
              }
            >
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="workspace-wide:w-[280px] harbor-subtle-divider flex w-[240px] shrink-0 flex-col border-r max-[680px]:w-full max-[680px]:border-r-0 xl:w-[320px] 2xl:w-[360px]">
          <div className="harbor-subtle-divider border-b p-3">
            <div className="harbor-surface mb-2 grid grid-cols-2 gap-1 rounded-md p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "harbor-choice h-8 text-[13px] max-xl:[&_svg]:hidden",
                  repositorySource === "mine" && "harbor-row-selected"
                )}
                aria-pressed={repositorySource === "mine"}
                onClick={() => setRepositorySource("mine")}
              >
                <FolderGit2 />
                {t("workspace.repositories.sources.mine")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "harbor-choice h-8 text-[13px] max-xl:[&_svg]:hidden",
                  repositorySource === "starred" && "harbor-row-selected"
                )}
                aria-pressed={repositorySource === "starred"}
                onClick={() => setRepositorySource("starred")}
              >
                <BookMarked />
                {t("workspace.repositories.sources.starred")}
              </Button>
            </div>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={repositoryQuery}
                onChange={(event) => setRepositoryQuery(event.currentTarget.value)}
                placeholder={t(
                  repositorySource === "mine"
                    ? "workspace.repositories.search"
                    : "workspace.repositories.searchStarred"
                )}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-muted-foreground min-w-0 truncate text-[11px]">
                {t(
                  repositorySource === "mine"
                    ? "workspace.repositories.repositoryCount"
                    : "workspace.repositories.starredRepositoryCount",
                  { count: repositories.length }
                )}
                {activeResult.isFetchingNextPage
                  ? ` · ${t("workspace.repositories.loadingMore")}`
                  : ""}
              </p>
              {repositorySource === "starred" ? (
                <Select
                  value={starredSort}
                  onValueChange={(value) => setStarredSort(value as GitHubStarredRepositorySort)}
                >
                  <SelectTrigger size="sm" className="h-7 max-w-32 min-w-0 px-2 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="starred">
                      {t("workspace.repositories.starredSort.starred")}
                    </SelectItem>
                    <SelectItem value="updated">
                      {t("workspace.repositories.starredSort.updated")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>
          <ScrollArea type="always" className="min-h-0 min-w-0 flex-1" constrainContentWidth>
            {repositoryLoading && !repositoriesLoaded ? (
              <RepositorySkeletons />
            ) : filteredRepositories.length ? (
              <div className="flex w-full min-w-0 flex-col gap-0.5 p-2 pr-3">
                {filteredRepositories.map((repository) => (
                  <RepositoryRow
                    key={repository.id}
                    repository={repository}
                    starredAt={starredAtByRepositoryId.get(repository.id)}
                    locale={i18n.language}
                    selected={repository.id === selectedRepositoryId}
                    onSelect={() => setSelectedRepositoryId(repository.id)}
                  />
                ))}
                {activeResult.isFetchingNextPage ? (
                  <div
                    role="status"
                    className="text-muted-foreground flex items-center justify-center gap-2 px-3 py-4 text-[11px]"
                  >
                    <Spinner />
                    {t("workspace.repositories.loadingMore")}
                  </div>
                ) : null}
              </div>
            ) : (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>
                    {t(
                      repositorySource === "mine"
                        ? "workspace.repositories.noRepositories"
                        : "workspace.repositories.noStarredRepositories"
                    )}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t(
                      repositorySource === "mine"
                        ? "workspace.repositories.noRepositoriesDescription"
                        : "workspace.repositories.noStarredRepositoriesDescription"
                    )}
                  </EmptyDescription>
                </EmptyHeader>
                {activeResult.isFetchingNextPage ? (
                  <EmptyContent>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Spinner />
                      {t("workspace.repositories.loadingMore")}
                    </span>
                  </EmptyContent>
                ) : null}
              </Empty>
            )}
          </ScrollArea>
        </aside>

        <div className="@container/repository-pane flex min-w-0 flex-1 flex-col overflow-hidden max-[680px]:hidden">
          {selectedRepository ? (
            <>
              <div className="harbor-subtle-divider flex shrink-0 flex-col gap-2 border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 text-sm font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
                      <span className="text-muted-foreground font-normal">
                        {selectedRepository.owner}/
                      </span>
                      {selectedRepository.name}
                    </h2>
                    {selectedRepository.isPrivate ? (
                      <Badge variant="secondary">
                        <LockKeyhole /> {t("workspace.repositories.private")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t("workspace.repositories.public")}</Badge>
                    )}
                    {selectedRepository.isFork ? (
                      <Badge variant="outline">
                        <GitFork /> {t("workspace.repositories.fork")}
                      </Badge>
                    ) : null}
                    {selectedRepository.isArchived ? (
                      <Badge variant="outline">
                        <Archive /> {t("workspace.repositories.archived")}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <RepositoryDescription
                  key={selectedRepository.id}
                  description={selectedRepository.description}
                />
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-[11px]">
                    {selectedRepository.language ? (
                      <span>{selectedRepository.language}</span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <CircleDot />
                      {t("workspace.repositories.openItems", {
                        count: selectedRepository.openIssues,
                      })}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <GitHubRepositoryRelationshipActions repository={selectedRepository} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={t("workspace.openOnGitHub")}
                          onClick={() => void openExternalUrl(selectedRepository.url)}
                        >
                          <ExternalLink />
                          <span className="@max-[480px]/repository-pane:sr-only">
                            {t("workspace.openOnGitHub")}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("workspace.openOnGitHub")}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as RepositoryTab)}
                className="min-h-0 min-w-0 flex-1 gap-0"
              >
                <div className="harbor-subtle-divider overflow-x-auto border-b px-4">
                  <TabsList variant="line" className="h-10 min-w-max gap-2 p-0 xl:gap-4">
                    <TabsTrigger value="code" className="px-1.5 text-xs">
                      <Code2 /> {t("workspace.repositories.tabs.code")}
                    </TabsTrigger>
                    <TabsTrigger value="wiki" className="px-1.5 text-xs">
                      <BookOpen /> {t("workspace.repositories.tabs.wiki")}
                    </TabsTrigger>
                    <TabsTrigger value="releases" className="px-1.5 text-xs">
                      <Rocket /> {t("workspace.repositories.tabs.releases")}
                    </TabsTrigger>
                    <TabsTrigger value="issues" className="px-1.5 text-xs">
                      <CircleDot /> {t("workspace.repositories.tabs.issues")}
                    </TabsTrigger>
                    <TabsTrigger value="pullRequests" className="px-1.5 text-xs">
                      <GitPullRequest /> {t("workspace.repositories.tabs.pullRequests")}
                    </TabsTrigger>
                    <TabsTrigger value="discussions" className="px-1.5 text-xs">
                      <MessageCircle /> {t("workspace.repositories.tabs.discussions")}
                    </TabsTrigger>
                    <TabsTrigger value="actions" className="px-1.5 text-xs">
                      <PlayCircle /> {t("workspace.repositories.tabs.actions")}
                    </TabsTrigger>
                    <TabsTrigger value="security" className="px-1.5 text-xs">
                      <ShieldAlert /> {t("workspace.repositories.tabs.security")}
                    </TabsTrigger>
                    <TabsTrigger value="insights" className="px-1.5 text-xs">
                      <BarChart3 /> {t("workspace.repositories.tabs.insights")}
                    </TabsTrigger>
                    {selectedRelationshipResult.data?.viewerOwnsRepository ? (
                      <TabsTrigger value="settings" className="px-1.5 text-xs">
                        <Settings2 /> {t("workspace.repositories.tabs.settings")}
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                </div>
                <TabsContent value="code" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <Suspense fallback={<RepositoryTabSkeleton />}>
                    <GitHubCodeView key={selectedRepository.id} repository={selectedRepository} />
                  </Suspense>
                </TabsContent>
                <TabsContent value="wiki" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <Suspense fallback={<RepositoryTabSkeleton />}>
                    <GitHubWikiView repository={selectedRepository} />
                  </Suspense>
                </TabsContent>
                <TabsContent
                  value="releases"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <Suspense fallback={<RepositoryTabSkeleton />}>
                    <GitHubReleaseView repository={selectedRepository} />
                  </Suspense>
                </TabsContent>
                <TabsContent
                  value="issues"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <GitHubIssueView repository={selectedRepository} />
                </TabsContent>
                <TabsContent
                  value="pullRequests"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <GitHubPullRequestView repository={selectedRepository} />
                </TabsContent>
                <TabsContent
                  value="discussions"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <Suspense fallback={<RepositoryTabSkeleton />}>
                    <GitHubDiscussionView repository={selectedRepository} />
                  </Suspense>
                </TabsContent>
                <TabsContent
                  value="actions"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <GitHubActionsView repository={selectedRepository} />
                </TabsContent>
                <TabsContent
                  value="security"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <Suspense fallback={<RepositoryTabSkeleton />}>
                    <GitHubSecurityView repository={selectedRepository} />
                  </Suspense>
                </TabsContent>
                <TabsContent
                  value="insights"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  <Suspense fallback={<RepositoryTabSkeleton />}>
                    <GitHubInsightsView repository={selectedRepository} />
                  </Suspense>
                </TabsContent>
                {selectedRelationshipResult.data?.viewerOwnsRepository ? (
                  <TabsContent
                    value="settings"
                    className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                  >
                    <Suspense fallback={<RepositoryTabSkeleton />}>
                      <GitHubRepositorySettingsView
                        repository={selectedRepository}
                        onOpenActions={() => setTab("actions")}
                      />
                    </Suspense>
                  </TabsContent>
                ) : null}
              </Tabs>
            </>
          ) : null}
        </div>
      </div>
      <GitHubRepositoryCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(repository) => {
          setRepositorySource("mine");
          setSelectedRepositoryId(repository.id);
        }}
      />
    </section>
  );
}

function RepositoryTabSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex gap-2 border-b p-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="ml-auto h-8 w-28" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}
