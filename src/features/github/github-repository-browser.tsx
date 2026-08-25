import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Archive,
  ChevronRight,
  CircleDot,
  ExternalLink,
  GitFork,
  Github,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  UserRound,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { parseIpcError, type IpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubIssue,
  GitHubIssuePage,
  GitHubRepository,
  GitHubRepositoryPage,
} from "./github-data";

type IssueFilter = "all" | "unassigned";

type GitHubRepositoryBrowserProps = {
  onSelectRepository: (repository: GitHubRepository | null) => void;
};

function RepositorySkeletons() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-md p-2.5">
          <Skeleton className="size-8 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueSkeletons() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 border-b border-white/[0.065] p-4">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RepositoryRow({
  repository,
  selected,
  onSelect,
}: {
  repository: GitHubRepository;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full justify-start gap-3 rounded-md px-2.5 py-2.5 text-left whitespace-normal",
        selected && "bg-primary/10 text-foreground hover:bg-primary/12"
      )}
    >
      <span className="border-primary/25 bg-primary/8 text-primary grid size-8 shrink-0 place-items-center rounded-md border text-xs font-semibold uppercase">
        {repository.name.charAt(0)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium">{repository.fullName}</span>
          {repository.isPrivate ? <LockKeyhole className="text-muted-foreground" /> : null}
        </span>
        <span className="text-muted-foreground line-clamp-1 text-[10px] font-normal">
          {repository.description ?? repository.url}
        </span>
      </span>
    </Button>
  );
}

function IssueRow({
  issue,
  locale,
  onSelect,
}: {
  issue: GitHubIssue;
  locale: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const updatedAt = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(issue.updatedAt));

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className="h-auto w-full flex-col items-stretch gap-2.5 rounded-none border-b border-white/[0.065] px-4 py-3.5 text-left whitespace-normal hover:bg-white/[0.035]"
    >
      <span className="flex items-start gap-2.5">
        <CircleDot className="text-primary mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="text-foreground/95 block text-[13px] leading-5 font-medium">
            {issue.title}
          </span>
          <span className="text-muted-foreground mt-1 line-clamp-2 block text-[11px] leading-5 font-normal">
            {issue.body || t("workspace.repositories.noIssueBody")}
          </span>
        </span>
        <span className="text-muted-foreground text-[10px] font-normal">#{issue.number}</span>
      </span>

      {issue.labels.length ? (
        <span className="flex flex-wrap gap-1.5 pl-6">
          {issue.labels.slice(0, 5).map((label) => (
            <Badge key={label.name} variant="outline" className="h-5 rounded-md px-1.5 font-normal">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: `#${label.color}` }}
                aria-hidden="true"
              />
              {label.name}
            </Badge>
          ))}
        </span>
      ) : null}

      <span className="text-muted-foreground flex flex-wrap items-center gap-3 pl-6 text-[10px] font-normal">
        <span>@{issue.author}</span>
        <span className="flex items-center gap-1">
          <UserRound />
          {issue.assignees.length
            ? issue.assignees.map((assignee) => `@${assignee}`).join(", ")
            : t("workspace.repositories.unassigned")}
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare /> {issue.comments}
        </span>
        <span>{t("workspace.repositories.updated", { date: updatedAt })}</span>
        <ChevronRight className="ml-auto" />
      </span>
    </Button>
  );
}

export function GitHubRepositoryBrowser({ onSelectRepository }: GitHubRepositoryBrowserProps) {
  const { t, i18n } = useTranslation();
  const [repositoryPage, setRepositoryPage] = useState<GitHubRepositoryPage | null>(null);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number | null>(null);
  const [repositoryQuery, setRepositoryQuery] = useState("");
  const [repositoryLoading, setRepositoryLoading] = useState(true);
  const [repositoryError, setRepositoryError] = useState<IpcError | null>(null);
  const [issuePage, setIssuePage] = useState<GitHubIssuePage | null>(null);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<IpcError | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const issueRequest = useRef(0);

  const loadRepositories = useCallback(async () => {
    if (!isTauri()) {
      setRepositoryError({
        code: "desktopOnly",
        message: t("workspace.repositories.desktopOnly"),
      });
      onSelectRepository(null);
      setRepositoryLoading(false);
      return;
    }

    setRepositoryLoading(true);
    setRepositoryError(null);
    try {
      const nextPage = await invoke<GitHubRepositoryPage>("github_list_repositories");
      setRepositoryPage(nextPage);
      setSelectedRepositoryId((current) => {
        if (current && nextPage.repositories.some((repository) => repository.id === current)) {
          return current;
        }
        return nextPage.repositories[0]?.id ?? null;
      });
    } catch (reason) {
      const error = parseIpcError(reason);
      setRepositoryError(error);
      if (error.code === "githubNotConnected") {
        setRepositoryPage(null);
        setSelectedRepositoryId(null);
        onSelectRepository(null);
      }
    } finally {
      setRepositoryLoading(false);
    }
  }, [onSelectRepository, t]);

  const selectedRepository = useMemo(
    () =>
      repositoryPage?.repositories.find((repository) => repository.id === selectedRepositoryId) ??
      null,
    [repositoryPage, selectedRepositoryId]
  );

  const loadIssues = useCallback(async (repository: GitHubRepository) => {
    const request = ++issueRequest.current;
    setIssueLoading(true);
    setIssueError(null);
    setIssuePage(null);
    setSelectedIssue(null);
    try {
      const nextPage = await invoke<GitHubIssuePage>("github_list_repository_issues", {
        owner: repository.owner,
        repository: repository.name,
      });
      if (request === issueRequest.current) setIssuePage(nextPage);
    } catch (reason) {
      if (request === issueRequest.current) setIssueError(parseIpcError(reason));
    } finally {
      if (request === issueRequest.current) setIssueLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRepositories();
  }, [loadRepositories]);

  useEffect(() => {
    if (!selectedRepository) {
      issueRequest.current += 1;
      setIssuePage(null);
      setIssueLoading(false);
      onSelectRepository(null);
      return;
    }
    onSelectRepository(selectedRepository);
    void loadIssues(selectedRepository);
  }, [loadIssues, onSelectRepository, selectedRepository]);

  const filteredRepositories = useMemo(() => {
    const query = repositoryQuery.trim().toLocaleLowerCase();
    if (!query) return repositoryPage?.repositories ?? [];
    return (repositoryPage?.repositories ?? []).filter((repository) =>
      `${repository.fullName} ${repository.description ?? ""} ${repository.language ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [repositoryPage, repositoryQuery]);

  const filteredIssues = useMemo(() => {
    const issues = issuePage?.issues ?? [];
    if (issueFilter === "unassigned") {
      return issues.filter((issue) => issue.assignees.length === 0);
    }
    return issues;
  }, [issueFilter, issuePage]);

  const handleRefresh = async () => loadRepositories();

  if (repositoryError && !repositoryPage) {
    const disconnected = repositoryError.code === "githubNotConnected";
    return (
      <section className="grid min-w-0 flex-1 place-items-center bg-[color-mix(in_oklch,var(--background)_95%,transparent)] p-6">
        <Empty className="max-w-lg border border-white/[0.075] bg-white/[0.02]">
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
            <Button variant="outline" onClick={() => void loadRepositories()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      </section>
    );
  }

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col bg-[color-mix(in_oklch,var(--background)_95%,transparent)]">
        <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b border-white/[0.075] px-5">
          <div>
            <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
              {t("workspace.repositories.eyebrow")}
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em]">
              {t("workspace.nav.repositories")}
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={repositoryLoading || issueLoading}
          >
            {repositoryLoading || issueLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {t("workspace.repositories.refresh")}
          </Button>
        </header>

        {repositoryError ? (
          <Alert variant="destructive" className="m-3 mb-0">
            <Github />
            <AlertTitle>{t("workspace.repositories.loadFailed")}</AlertTitle>
            <AlertDescription>{repositoryError.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/[0.075] max-[820px]:w-[260px] max-[680px]:w-full max-[680px]:border-r-0">
            <div className="border-b border-white/[0.065] p-3">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                <Input
                  value={repositoryQuery}
                  onChange={(event) => setRepositoryQuery(event.currentTarget.value)}
                  placeholder={t("workspace.repositories.search")}
                  className="h-8 bg-white/[0.025] pl-8 text-xs"
                />
              </div>
              <p className="text-muted-foreground mt-2 text-[10px]">
                {t("workspace.repositories.repositoryCount", {
                  count: repositoryPage?.repositories.length ?? 0,
                })}
                {repositoryPage?.hasMore ? ` · ${t("workspace.repositories.firstPage")}` : ""}
              </p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {repositoryLoading && !repositoryPage ? (
                <RepositorySkeletons />
              ) : filteredRepositories.length ? (
                <div className="flex flex-col gap-0.5 p-2">
                  {filteredRepositories.map((repository) => (
                    <RepositoryRow
                      key={repository.id}
                      repository={repository}
                      selected={repository.id === selectedRepositoryId}
                      onSelect={() => setSelectedRepositoryId(repository.id)}
                    />
                  ))}
                </div>
              ) : (
                <Empty className="min-h-64">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>{t("workspace.repositories.noRepositories")}</EmptyTitle>
                    <EmptyDescription>
                      {t("workspace.repositories.noRepositoriesDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </ScrollArea>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col max-[680px]:hidden">
            {selectedRepository ? (
              <>
                <div className="flex min-h-[76px] items-center justify-between gap-4 border-b border-white/[0.065] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-sm font-semibold tracking-[-0.01em]">
                        {selectedRepository.fullName}
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
                    <p className="text-muted-foreground mt-1 line-clamp-1 text-[11px]">
                      {selectedRepository.description ?? t("workspace.repositories.noDescription")}
                    </p>
                    <div className="text-muted-foreground mt-1.5 flex items-center gap-3 text-[10px]">
                      {selectedRepository.language ? (
                        <span>{selectedRepository.language}</span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Star /> {selectedRepository.stars.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork /> {selectedRepository.forks.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <CircleDot />
                        {t("workspace.repositories.openItems", {
                          count: selectedRepository.openIssues,
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openExternalUrl(selectedRepository.url)}
                  >
                    <ExternalLink data-icon="inline-end" />
                    {t("workspace.openOnGitHub")}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-white/[0.065] px-4 py-2">
                  <Tabs
                    value={issueFilter}
                    onValueChange={(value) => setIssueFilter(value as IssueFilter)}
                  >
                    <TabsList className="h-8">
                      <TabsTrigger value="all" className="text-xs">
                        {t("workspace.repositories.allIssues")}
                      </TabsTrigger>
                      <TabsTrigger value="unassigned" className="text-xs">
                        {t("workspace.repositories.unassignedIssues")}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <span className="text-muted-foreground text-[10px]">
                    {t("workspace.repositories.issueCount", {
                      count: filteredIssues.length,
                    })}
                    {issuePage?.hasMore ? ` · ${t("workspace.repositories.firstPage")}` : ""}
                  </span>
                </div>

                <ScrollArea className="min-h-0 flex-1">
                  {issueLoading ? (
                    <IssueSkeletons />
                  ) : issueError ? (
                    <Empty className="min-h-80">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CircleDot />
                        </EmptyMedia>
                        <EmptyTitle>{t("workspace.repositories.issueLoadFailed")}</EmptyTitle>
                        <EmptyDescription>{issueError.message}</EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button
                          variant="outline"
                          onClick={() => void loadIssues(selectedRepository)}
                        >
                          <RefreshCw data-icon="inline-start" />
                          {t("workspace.repositories.retry")}
                        </Button>
                      </EmptyContent>
                    </Empty>
                  ) : filteredIssues.length ? (
                    filteredIssues.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        locale={i18n.language}
                        onSelect={() => setSelectedIssue(issue)}
                      />
                    ))
                  ) : (
                    <Empty className="min-h-80">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CircleDot />
                        </EmptyMedia>
                        <EmptyTitle>{t("workspace.repositories.noIssues")}</EmptyTitle>
                        <EmptyDescription>
                          {t("workspace.repositories.noIssuesDescription")}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </ScrollArea>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <Sheet
        open={Boolean(selectedIssue)}
        onOpenChange={(open) => {
          if (!open) setSelectedIssue(null);
        }}
      >
        <SheetContent className="harbor-sheet w-[min(92vw,520px)] border-white/10 p-0 sm:max-w-[520px]">
          {selectedIssue ? (
            <>
              <SheetHeader className="border-b border-white/8 p-5 pr-12">
                <p className="text-primary text-[10px] font-semibold tracking-[0.14em] uppercase">
                  {t("workspace.repositories.issueDetail")}
                </p>
                <SheetTitle className="text-base leading-6 tracking-[-0.015em]">
                  {selectedIssue.title}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  #{selectedIssue.number} · @{selectedIssue.author}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
                {selectedIssue.labels.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedIssue.labels.map((label) => (
                      <Badge key={label.name} variant="outline" className="rounded-md font-normal">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: `#${label.color}` }}
                          aria-hidden="true"
                        />
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <ScrollArea className="min-h-0 flex-1 pr-3">
                  <p className="text-foreground/90 text-[13px] leading-6 whitespace-pre-wrap">
                    {selectedIssue.body || t("workspace.repositories.noIssueBody")}
                  </p>
                </ScrollArea>

                <div className="text-muted-foreground flex flex-wrap items-center gap-3 border-t border-white/8 pt-4 text-[11px]">
                  <span className="flex items-center gap-1">
                    <UserRound />
                    {selectedIssue.assignees.length
                      ? selectedIssue.assignees.map((assignee) => `@${assignee}`).join(", ")
                      : t("workspace.repositories.unassigned")}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare /> {selectedIssue.comments}
                  </span>
                </div>

                <Button onClick={() => void openExternalUrl(selectedIssue.url)}>
                  <ExternalLink data-icon="inline-end" />
                  {t("workspace.openOnGitHub")}
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
