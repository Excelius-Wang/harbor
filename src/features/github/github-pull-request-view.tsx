import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GitPullRequest, Plus, RefreshCw, Search, TriangleAlert } from "lucide-react";
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
  GitHubPullRequestReviewFilter,
  GitHubPullRequestSort,
  GitHubPullRequestState,
  GitHubRepository,
} from "./github-data";
import { GitHubPullRequestDetail } from "./github-pull-request-detail";
import { GitHubPullRequestCreate } from "./github-pull-request-create";
import { GitHubPullRequestRow } from "./github-pull-request-row";
import { GitHubPagination } from "./github-issue-shared";
import {
  repositoryIssueLabelsQueryOptions,
  repositoryPullRequestDetailQueryOptions,
  repositoryPullRequestsQueryOptions,
} from "./github-queries";

const ALL_LABELS = "__all__";
const ALL_REVIEWS = "__all_reviews__";

function PullRequestSkeletons() {
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

function pullRequestErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.pullRequestPermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.pullRequestLoadFailed";
}

export function GitHubPullRequestView({ repository }: { repository: GitHubRepository }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<GitHubPullRequestState>("open");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [review, setReview] = useState<GitHubPullRequestReviewFilter | null>(null);
  const [sort, setSort] = useState<GitHubPullRequestSort>("updated");
  const [page, setPage] = useState(1);
  const [selectedPullRequestNumber, setSelectedPullRequestNumber] = useState<number | null>(null);
  const [creatingPullRequest, setCreatingPullRequest] = useState(false);
  const pullRequestsResult = useQuery({
    ...repositoryPullRequestsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      state,
      query,
      label,
      review,
      sort,
      page,
    }),
    placeholderData: (previous) => previous,
  });
  const labelsResult = useQuery(
    repositoryIssueLabelsQueryOptions({ owner: repository.owner, repository: repository.name })
  );
  const pullRequestPage = pullRequestsResult.data;
  const error =
    !pullRequestPage && pullRequestsResult.error ? parseIpcError(pullRequestsResult.error) : null;
  const supplementalError =
    pullRequestPage && pullRequestsResult.error
      ? { source: "pullRequests" as const, error: parseIpcError(pullRequestsResult.error) }
      : labelsResult.error
        ? { source: "labels" as const, error: parseIpcError(labelsResult.error) }
        : null;

  useEffect(() => {
    setState("open");
    setDraftQuery("");
    setQuery("");
    setLabel("");
    setReview(null);
    setSort("updated");
    setPage(1);
    setSelectedPullRequestNumber(null);
    setCreatingPullRequest(false);
  }, [repository.id]);

  if (creatingPullRequest) {
    return (
      <GitHubPullRequestCreate
        repository={repository}
        onCancel={() => setCreatingPullRequest(false)}
        onCreated={(pullRequest) => {
          setCreatingPullRequest(false);
          setSelectedPullRequestNumber(pullRequest.number);
        }}
      />
    );
  }

  if (selectedPullRequestNumber !== null) {
    return (
      <GitHubPullRequestDetail
        repository={repository}
        pullRequestNumber={selectedPullRequestNumber}
        onBack={() => setSelectedPullRequestNumber(null)}
      />
    );
  }

  const resetPage = (update: () => void) => {
    update();
    setPage(1);
  };

  return (
    <div className="@container/pulls flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Tabs
            value={state}
            onValueChange={(value) => resetPage(() => setState(value as GitHubPullRequestState))}
          >
            <TabsList className="h-8">
              <TabsTrigger value="open" className="text-xs">
                <GitPullRequest /> {t("workspace.repositories.openPullRequests")}
              </TabsTrigger>
              <TabsTrigger value="closed" className="text-xs">
                <CheckCircle2 /> {t("workspace.repositories.closedPullRequests")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground flex items-center gap-2 text-[10px]">
              {pullRequestsResult.isFetching ? <RefreshCw className="size-3 animate-spin" /> : null}
              {pullRequestPage
                ? t("workspace.repositories.pullRequestCount", {
                    count: pullRequestPage.totalCount,
                  })
                : null}
            </span>
            <Button type="button" size="sm" onClick={() => setCreatingPullRequest(true)}>
              <Plus data-icon="inline-start" />
              {t("workspace.repositories.newPullRequest")}
            </Button>
          </div>
        </div>
        <form
          className="grid min-w-0 grid-cols-1 gap-2 @min-[480px]/pulls:grid-cols-3 @min-[720px]/pulls:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(128px,144px))]"
          onSubmit={(event) => {
            event.preventDefault();
            resetPage(() => setQuery(draftQuery.trim()));
          }}
        >
          <div className="relative min-w-0 @min-[480px]/pulls:col-span-3 @min-[720px]/pulls:col-span-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t("workspace.repositories.searchPullRequests")}
              aria-label={t("workspace.repositories.searchPullRequests")}
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
            value={review ?? ALL_REVIEWS}
            onValueChange={(value) =>
              resetPage(() =>
                setReview(value === ALL_REVIEWS ? null : (value as GitHubPullRequestReviewFilter))
              )
            }
          >
            <SelectTrigger
              size="sm"
              className="w-full min-w-0"
              aria-label={t("workspace.repositories.pullRequestReviewFilter")}
            >
              <SelectValue placeholder={t("workspace.repositories.allPullRequestReviews")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_REVIEWS}>
                  {t("workspace.repositories.allPullRequestReviews")}
                </SelectItem>
                <SelectItem value="none">
                  {t("workspace.repositories.pullRequestReviewFilters.none")}
                </SelectItem>
                <SelectItem value="required">
                  {t("workspace.repositories.pullRequestReviewFilters.required")}
                </SelectItem>
                <SelectItem value="approved">
                  {t("workspace.repositories.pullRequestReviewFilters.approved")}
                </SelectItem>
                <SelectItem value="changesRequested">
                  {t("workspace.repositories.pullRequestReviewFilters.changesRequested")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value) => resetPage(() => setSort(value as GitHubPullRequestSort))}
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
                void (supplementalError.source === "pullRequests"
                  ? pullRequestsResult.refetch()
                  : labelsResult.refetch())
              }
            >
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {pullRequestsResult.isPending ? (
          <PullRequestSkeletons />
        ) : error ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitPullRequest />
              </EmptyMedia>
              <EmptyTitle>{t(pullRequestErrorTitle(error.code))}</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void pullRequestsResult.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : pullRequestPage?.pullRequests.length ? (
          <div className={cn("transition-opacity", pullRequestsResult.isFetching && "opacity-60")}>
            {pullRequestPage.pullRequests.map((pullRequest) => {
              const detailOptions = repositoryPullRequestDetailQueryOptions({
                owner: repository.owner,
                repository: repository.name,
                pullRequestNumber: pullRequest.number,
                timelinePage: 1,
              });
              return (
                <GitHubPullRequestRow
                  key={pullRequest.id}
                  pullRequest={pullRequest}
                  locale={i18n.language}
                  onSelect={() => setSelectedPullRequestNumber(pullRequest.number)}
                  onPrefetch={() => void queryClient.prefetchQuery(detailOptions)}
                />
              );
            })}
          </div>
        ) : (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitPullRequest />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.noPullRequests")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.repositories.noPullRequestsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ScrollArea>
      {pullRequestPage ? (
        <GitHubPagination
          page={pullRequestPage.page}
          hasPrevious={pullRequestPage.hasPrevious}
          hasMore={pullRequestPage.hasMore}
          onPageChange={setPage}
          ariaLabel={t("workspace.repositories.pullRequestPagination")}
        />
      ) : null}
    </div>
  );
}
