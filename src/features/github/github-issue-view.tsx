import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleDot,
  Plus,
  RefreshCw,
  Search,
  Tags,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type {
  GitHubIssueAssignment,
  GitHubIssueSort,
  GitHubIssueState,
  GitHubRepository,
} from "./github-data";
import { GitHubIssueCreate } from "./github-issue-create";
import { GitHubIssueDetail } from "./github-issue-detail";
import { GitHubIssueRow } from "./github-issue-row";
import { GitHubIssuePagination } from "./github-issue-shared";
import { GitHubPinnedIssues } from "./github-pinned-issues";
import {
  repositoryIssueDetailQueryOptions,
  repositoryIssueLabelsQueryOptions,
  repositoryIssuesQueryOptions,
} from "./github-queries";

const ALL_LABELS = "__all__";

const GitHubIssueTaxonomyView = lazy(() =>
  import("./github-issue-taxonomy-view").then((module) => ({
    default: module.GitHubIssueTaxonomyView,
  }))
);

function IssueSkeletons() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 border-b p-4">
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

function issueListErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.issuePermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.issueLoadFailed";
}

export function GitHubIssueView({ repository }: { repository: GitHubRepository }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<GitHubIssueState>("open");
  const [assignment, setAssignment] = useState<GitHubIssueAssignment>("all");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [sort, setSort] = useState<GitHubIssueSort>("updated");
  const [page, setPage] = useState(1);
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [managingTaxonomy, setManagingTaxonomy] = useState(false);
  const issuesResult = useQuery({
    ...repositoryIssuesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      state,
      assignment,
      query,
      label,
      sort,
      page,
    }),
    placeholderData: (previous) => previous,
  });
  const labelsResult = useQuery(
    repositoryIssueLabelsQueryOptions({ owner: repository.owner, repository: repository.name })
  );
  const issuePage = issuesResult.data;
  const error = !issuePage && issuesResult.error ? parseIpcError(issuesResult.error) : null;
  const supplementalError =
    issuePage && issuesResult.error
      ? { source: "issues" as const, error: parseIpcError(issuesResult.error) }
      : labelsResult.error
        ? { source: "labels" as const, error: parseIpcError(labelsResult.error) }
        : null;

  useEffect(() => {
    setState("open");
    setAssignment("all");
    setDraftQuery("");
    setQuery("");
    setLabel("");
    setSort("updated");
    setPage(1);
    setSelectedIssueNumber(null);
    setCreatingIssue(false);
    setManagingTaxonomy(false);
  }, [repository.id]);

  if (managingTaxonomy) {
    return (
      <Suspense fallback={<IssueSkeletons />}>
        <GitHubIssueTaxonomyView
          repository={repository}
          onBack={() => setManagingTaxonomy(false)}
        />
      </Suspense>
    );
  }

  if (creatingIssue) {
    return (
      <GitHubIssueCreate
        repository={repository}
        onCancel={() => setCreatingIssue(false)}
        onCreated={(issue) => {
          setCreatingIssue(false);
          setSelectedIssueNumber(issue.number);
        }}
      />
    );
  }

  if (selectedIssueNumber !== null) {
    return (
      <GitHubIssueDetail
        repository={repository}
        issueNumber={selectedIssueNumber}
        onBack={() => setSelectedIssueNumber(null)}
      />
    );
  }

  const resetPage = (update: () => void) => {
    update();
    setPage(1);
  };

  return (
    <div className="@container/issues flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Tabs
            value={state}
            onValueChange={(value) => resetPage(() => setState(value as GitHubIssueState))}
          >
            <TabsList className="h-8">
              <TabsTrigger value="open" className="text-xs">
                <CircleDot /> {t("workspace.repositories.openIssues")}
              </TabsTrigger>
              <TabsTrigger value="closed" className="text-xs">
                <CheckCircle2 /> {t("workspace.repositories.closedIssues")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground flex items-center gap-2 text-[10px]">
              {issuesResult.isFetching ? <RefreshCw className="size-3 animate-spin" /> : null}
              {issuePage
                ? t("workspace.repositories.issueCount", { count: issuePage.totalCount })
                : null}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setManagingTaxonomy(true)}
            >
              <Tags data-icon="inline-start" />
              {t("workspace.repositories.manageTaxonomy")}
            </Button>
            <Button type="button" size="sm" onClick={() => setCreatingIssue(true)}>
              <Plus data-icon="inline-start" />
              {t("workspace.repositories.newIssue")}
            </Button>
          </div>
        </div>
        <form
          className="grid min-w-0 grid-cols-1 gap-2 @min-[480px]/issues:grid-cols-3 @min-[720px]/issues:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(128px,144px))]"
          onSubmit={(event) => {
            event.preventDefault();
            resetPage(() => setQuery(draftQuery.trim()));
          }}
        >
          <div className="relative min-w-0 @min-[480px]/issues:col-span-3 @min-[720px]/issues:col-span-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t("workspace.repositories.searchIssues")}
              aria-label={t("workspace.repositories.searchIssues")}
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
            value={assignment}
            onValueChange={(value) =>
              resetPage(() => setAssignment(value as GitHubIssueAssignment))
            }
          >
            <SelectTrigger size="sm" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("workspace.repositories.allAssignees")}</SelectItem>
                <SelectItem value="unassigned">
                  {t("workspace.repositories.unassignedIssues")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={label || ALL_LABELS}
            onValueChange={(value) => resetPage(() => setLabel(value === ALL_LABELS ? "" : value))}
          >
            <SelectTrigger size="sm" className="w-full min-w-0" disabled={labelsResult.isPending}>
              <SelectValue placeholder={t("workspace.repositories.allLabels")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_LABELS}>{t("workspace.repositories.allLabels")}</SelectItem>
                {(labelsResult.data?.labels ?? []).map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value) => resetPage(() => setSort(value as GitHubIssueSort))}
          >
            <SelectTrigger size="sm" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="updated">{t("workspace.repositories.sortUpdated")}</SelectItem>
                <SelectItem value="created">{t("workspace.repositories.sortCreated")}</SelectItem>
                <SelectItem value="comments">{t("workspace.repositories.sortComments")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </form>
      </div>
      {supplementalError ? (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 px-4 py-2">
          <TriangleAlert />
          <AlertDescription className="flex w-full min-w-0 flex-row items-center gap-3 text-[11px]">
            <span className="min-w-0 flex-1 truncate">{supplementalError.error.message}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() =>
                void (supplementalError.source === "issues"
                  ? issuesResult.refetch()
                  : labelsResult.refetch())
              }
            >
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <GitHubPinnedIssues
          repository={repository}
          onSelect={(issueNumber) => setSelectedIssueNumber(issueNumber)}
        />
        {issuesResult.isPending ? (
          <IssueSkeletons />
        ) : error ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleDot />
              </EmptyMedia>
              <EmptyTitle>{t(issueListErrorTitle(error.code))}</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void issuesResult.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : issuePage?.issues.length ? (
          <div className={cn("transition-opacity", issuesResult.isFetching && "opacity-60")}>
            {issuePage.issues.map((issue) => {
              const detailOptions = repositoryIssueDetailQueryOptions({
                owner: repository.owner,
                repository: repository.name,
                issueNumber: issue.number,
                timelinePage: 1,
              });
              return (
                <GitHubIssueRow
                  key={issue.id}
                  issue={issue}
                  locale={i18n.language}
                  onSelect={() => setSelectedIssueNumber(issue.number)}
                  onPrefetch={() => void queryClient.prefetchQuery(detailOptions)}
                />
              );
            })}
          </div>
        ) : (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleDot />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.noIssues")}</EmptyTitle>
              <EmptyDescription>{t("workspace.repositories.noIssuesDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ScrollArea>
      {issuePage ? (
        <GitHubIssuePagination
          page={issuePage.page}
          hasPrevious={issuePage.hasPrevious}
          hasMore={issuePage.hasMore}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
