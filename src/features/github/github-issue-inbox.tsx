import { useListScroll } from "@/hooks/use-list-scroll";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { WorkspacePageHeader } from "@/features/workspace/workspace-page-header";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  CheckCircle2,
  CircleDot,
  Github,
  RefreshCw,
  Search,
  UserCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { cn } from "@/lib/utils";
import type {
  GitHubIssueInboxScope,
  GitHubIssueRepository,
  GitHubIssueSort,
  GitHubIssueState,
  GitHubIssueSummary,
} from "./github-data";
import { GitHubIssueDetail } from "./github-issue-detail";
import { GitHubIssueRow } from "./github-issue-row";
import { GitHubPagination } from "./github-issue-shared";
import { issueInboxQueryOptions, repositoryIssueDetailQueryOptions } from "./github-queries";

function IssueInboxSkeletons() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 border-b px-4 py-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

function inboxErrorTitle(code: string) {
  if (code === "desktopOnly") return "workspace.issues.desktopOnlyTitle";
  if (code === "githubNotConnected") return "workspace.issues.connectTitle";
  if (code === "githubPermission") return "workspace.issues.permissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.issues.loadFailed";
}

export function GitHubIssueInbox({
  onSelectRepository,
}: {
  onSelectRepository: (repository: GitHubIssueRepository | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const desktopRuntime = isTauri();
  const [scope, setScope] = useState<GitHubIssueInboxScope>("authored");
  const [state, setState] = useState<GitHubIssueState>("open");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GitHubIssueSort>("updated");
  const [page, setPage] = useState(1);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssueSummary | null>(null);
  const listScroll = useListScroll(JSON.stringify([scope, state, query, sort, page]));
  const result = useQuery({
    ...issueInboxQueryOptions({ scope, state, query, sort, page }),
    enabled: desktopRuntime,
    placeholderData: (previous) => previous,
  });
  const data = result.data;
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.issues.desktopOnly") }
    : !data && result.error
      ? parseIpcError(result.error)
      : null;
  const supplementalError = data && result.error ? parseIpcError(result.error) : null;

  useEffect(() => {
    onSelectRepository(selectedIssue?.repository ?? null);
  }, [onSelectRepository, selectedIssue]);

  useEffect(() => () => onSelectRepository(null), [onSelectRepository]);

  if (selectedIssue) {
    return (
      <GitHubIssueDetail
        repository={selectedIssue.repository}
        issueNumber={selectedIssue.issue.number}
        onBack={() => setSelectedIssue(null)}
        backLabel={t("workspace.issues.back")}
      />
    );
  }

  const resetPage = (update: () => void) => {
    update();
    setPage(1);
  };

  const prefetchIssue = (summary: GitHubIssueSummary) => {
    void queryClient.prefetchQuery(
      repositoryIssueDetailQueryOptions({
        owner: summary.repository.owner,
        repository: summary.repository.name,
        issueNumber: summary.issue.number,
        timelinePage: 1,
      })
    );
  };

  return (
    <section className="harbor-content flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkspacePageHeader
        title={t("workspace.nav.issues")}
        description={t("workspace.issues.eyebrow")}
        contained
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void result.refetch()}
          disabled={result.isFetching || !desktopRuntime}
        >
          {result.isFetching ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {t("workspace.issues.refresh")}
        </Button>
      </WorkspacePageHeader>

      <div className="harbor-subtle-divider mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 flex-col border-x">
        <Tabs
          value={scope}
          onValueChange={(value) => resetPage(() => setScope(value as GitHubIssueInboxScope))}
          className="gap-0"
        >
          <div className="harbor-subtle-divider border-b px-4">
            <TabsList variant="line" className="h-11 gap-5 p-0">
              <TabsTrigger value="authored" className="px-1.5 text-xs">
                <CircleDot /> {t("workspace.issues.authored")}
              </TabsTrigger>
              <TabsTrigger value="assigned" className="px-1.5 text-xs">
                <UserCheck /> {t("workspace.issues.assigned")}
              </TabsTrigger>
              <TabsTrigger value="mentioned" className="px-1.5 text-xs">
                <AtSign /> {t("workspace.issues.mentioned")}
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        <div className="harbor-subtle-divider flex flex-col gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <Select
              value={state}
              onValueChange={(value) => resetPage(() => setState(value as GitHubIssueState))}
            >
              <SelectTrigger size="sm" className="w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="open">{t("workspace.repositories.openIssues")}</SelectItem>
                  <SelectItem value="closed">{t("workspace.repositories.closedIssues")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground flex min-h-6 items-center gap-2 text-[11px]">
              {result.isFetching && data ? <RefreshCw className="size-3 animate-spin" /> : null}
              {data ? t("workspace.issues.count", { count: data.totalCount }) : null}
            </span>
          </div>
          <form
            className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_176px]"
            onSubmit={(event) => {
              event.preventDefault();
              resetPage(() => setQuery(draftQuery.trim()));
            }}
          >
            <div className="relative min-w-0">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder={t("workspace.issues.search")}
                aria-label={t("workspace.issues.search")}
                className="h-8 pr-14 pl-8 text-xs"
              />
              <Button
                type="submit"
                variant="ghost"
                size="xs"
                className="absolute top-1/2 right-1 -translate-y-1/2"
              >
                {t("workspace.repositories.searchAction")}
              </Button>
            </div>
            <Select
              value={sort}
              onValueChange={(value) => resetPage(() => setSort(value as GitHubIssueSort))}
            >
              <SelectTrigger
                size="sm"
                className="w-full min-w-0"
                aria-label={t("workspace.repositories.sort")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="updated">{t("workspace.repositories.sortUpdated")}</SelectItem>
                  <SelectItem value="updatedAscending">
                    {t("workspace.repositories.sortUpdatedAscending")}
                  </SelectItem>
                  <SelectItem value="created">{t("workspace.repositories.sortCreated")}</SelectItem>
                  <SelectItem value="createdAscending">
                    {t("workspace.repositories.sortCreatedAscending")}
                  </SelectItem>
                  <SelectItem value="comments">
                    {t("workspace.repositories.sortComments")}
                  </SelectItem>
                  <SelectItem value="commentsAscending">
                    {t("workspace.repositories.sortCommentsAscending")}
                  </SelectItem>
                  <SelectItem value="reactions">
                    {t("workspace.repositories.sortReactions")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </form>
        </div>

        {supplementalError ? (
          <WorkspaceStaleNotice
            message={supplementalError.message}
            onRetry={() => void result.refetch()}
          />
        ) : null}

        <ScrollArea className="min-h-0 flex-1" {...listScroll}>
          {result.isPending && !data ? (
            <IssueInboxSkeletons />
          ) : error ? (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {error.code === "githubNotConnected" ? <Github /> : <CircleDot />}
                </EmptyMedia>
                <EmptyTitle>{t(inboxErrorTitle(error.code))}</EmptyTitle>
                <EmptyDescription>{error.message}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void result.refetch()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : data?.issues.length ? (
            <div className={cn("transition-opacity", result.isFetching && "opacity-60")}>
              {data.issues.map((summary) => (
                <GitHubIssueRow
                  key={`${summary.repository.fullName}:${summary.issue.id}`}
                  issue={summary.issue}
                  repository={summary.repository}
                  locale={i18n.language}
                  showRepository
                  onSelect={() => setSelectedIssue(summary)}
                  onPrefetch={() => prefetchIssue(summary)}
                />
              ))}
            </div>
          ) : (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {state === "closed" ? <CheckCircle2 /> : <CircleDot />}
                </EmptyMedia>
                <EmptyTitle>{t("workspace.issues.empty")}</EmptyTitle>
                <EmptyDescription>
                  {t(`workspace.issues.emptyDescriptions.${scope}`)}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {data ? (
            <GitHubPagination
              page={data.page}
              hasPrevious={data.hasPrevious}
              hasMore={data.hasMore}
              onPageChange={setPage}
              ariaLabel={t("workspace.issues.pagination")}
            />
          ) : null}
        </ScrollArea>
      </div>
    </section>
  );
}
