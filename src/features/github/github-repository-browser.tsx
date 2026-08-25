import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Archive,
  CircleDot,
  Code2,
  ExternalLink,
  GitFork,
  Github,
  GitPullRequest,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  Search,
  Star,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError, type IpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import { GitHubCodeView } from "./github-code-view";
import type { GitHubRepository, GitHubRepositoryPage } from "./github-data";
import { GitHubIssueView } from "./github-issue-view";

type RepositoryTab = "code" | "issues" | "pullRequests" | "actions";

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

function WorkflowPlaceholder({
  tab,
  repository,
}: {
  tab: "pullRequests" | "actions";
  repository: GitHubRepository;
}) {
  const { t } = useTranslation();
  const pullRequests = tab === "pullRequests";
  const Icon = pullRequests ? GitPullRequest : PlayCircle;

  return (
    <Empty className="min-h-[360px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>
          {t(`workspace.repositories.${pullRequests ? "pullRequestsNext" : "actionsNext"}`)}
        </EmptyTitle>
        <EmptyDescription>
          {t(
            `workspace.repositories.${pullRequests ? "pullRequestsDescription" : "actionsDescription"}`
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          onClick={() =>
            void openExternalUrl(`${repository.url}/${pullRequests ? "pulls" : "actions"}`)
          }
        >
          <ExternalLink data-icon="inline-end" />
          {t("workspace.openOnGitHub")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function GitHubRepositoryBrowser({ onSelectRepository }: GitHubRepositoryBrowserProps) {
  const { t } = useTranslation();
  const [repositoryPage, setRepositoryPage] = useState<GitHubRepositoryPage | null>(null);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number | null>(null);
  const [repositoryQuery, setRepositoryQuery] = useState("");
  const [repositoryLoading, setRepositoryLoading] = useState(true);
  const [repositoryError, setRepositoryError] = useState<IpcError | null>(null);
  const [tab, setTab] = useState<RepositoryTab>("code");

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

  useEffect(() => {
    void loadRepositories();
  }, [loadRepositories]);

  useEffect(() => {
    onSelectRepository(selectedRepository);
    setTab("code");
  }, [onSelectRepository, selectedRepository]);

  const filteredRepositories = useMemo(() => {
    const query = repositoryQuery.trim().toLocaleLowerCase();
    if (!query) return repositoryPage?.repositories ?? [];
    return (repositoryPage?.repositories ?? []).filter((repository) =>
      `${repository.fullName} ${repository.description ?? ""} ${repository.language ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [repositoryPage, repositoryQuery]);

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
          onClick={() => void loadRepositories()}
          disabled={repositoryLoading}
        >
          {repositoryLoading ? (
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

              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as RepositoryTab)}
                className="min-h-0 flex-1 gap-0"
              >
                <div className="border-b border-white/[0.065] px-4">
                  <TabsList variant="line" className="h-10 gap-4 p-0">
                    <TabsTrigger value="code" className="px-1.5 text-xs">
                      <Code2 /> {t("workspace.repositories.tabs.code")}
                    </TabsTrigger>
                    <TabsTrigger value="issues" className="px-1.5 text-xs">
                      <CircleDot /> {t("workspace.repositories.tabs.issues")}
                    </TabsTrigger>
                    <TabsTrigger value="pullRequests" className="px-1.5 text-xs">
                      <GitPullRequest /> {t("workspace.repositories.tabs.pullRequests")}
                    </TabsTrigger>
                    <TabsTrigger value="actions" className="px-1.5 text-xs">
                      <PlayCircle /> {t("workspace.repositories.tabs.actions")}
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="code" className="min-h-0">
                  <GitHubCodeView key={selectedRepository.id} repository={selectedRepository} />
                </TabsContent>
                <TabsContent value="issues" className="min-h-0">
                  <GitHubIssueView repository={selectedRepository} />
                </TabsContent>
                <TabsContent value="pullRequests" className="min-h-0 overflow-auto">
                  <WorkflowPlaceholder tab="pullRequests" repository={selectedRepository} />
                </TabsContent>
                <TabsContent value="actions" className="min-h-0 overflow-auto">
                  <WorkflowPlaceholder tab="actions" repository={selectedRepository} />
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
