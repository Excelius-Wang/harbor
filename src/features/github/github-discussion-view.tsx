import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  CircleOff,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type {
  GitHubDiscussionAnsweredFilter,
  GitHubDiscussionSort,
  GitHubDiscussionStateFilter,
  GitHubDiscussionSummary,
  GitHubRepository,
} from "./github-data";
import { GitHubDiscussionDetail } from "./github-discussion-detail";
import { GitHubDiscussionFormDialog } from "./github-discussion-form-dialog";
import { formatIssueDate } from "./github-issue-shared";
import {
  discussionCategoriesQueryOptions,
  discussionDetailQueryOptions,
  discussionsQueryOptions,
} from "./github-queries";

const ALL_CATEGORIES = "__all__";

function DiscussionSkeletons() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 border-b p-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

function DiscussionRow({
  discussion,
  locale,
  onSelect,
  onPrefetch,
}: {
  discussion: GitHubDiscussionSummary;
  locale: string;
  onSelect: () => void;
  onPrefetch: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      className="hover:bg-accent/40 h-auto w-full flex-col items-stretch gap-2.5 rounded-none border-b px-4 py-3.5 text-left whitespace-normal"
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <span
          className="bg-muted/50 grid size-7 shrink-0 place-items-center rounded-md text-sm"
          aria-hidden="true"
        >
          {discussion.category.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground mb-0.5 flex flex-wrap items-center gap-2 text-[10px] font-normal">
            <span>{discussion.category.name}</span>
            <span>#{discussion.number}</span>
            {discussion.state === "closed" ? (
              <Badge variant="outline" className="h-4 rounded-sm px-1 text-[8px] font-normal">
                {t("workspace.repositories.discussionStates.closed")}
              </Badge>
            ) : null}
            {discussion.answerId ? (
              <Badge variant="secondary" className="h-4 rounded-sm px-1 text-[8px] font-normal">
                <CheckCircle2 /> {t("workspace.repositories.answered")}
              </Badge>
            ) : null}
          </span>
          <span className="text-foreground/95 block text-[13px] leading-5 font-medium">
            {discussion.title}
          </span>
          <span className="text-muted-foreground mt-1 line-clamp-2 block text-[11px] leading-5 font-normal">
            {discussion.body || t("workspace.repositories.noDiscussionBody")}
          </span>
        </span>
        <ChevronRight className="text-muted-foreground mt-1 shrink-0" />
      </span>
      <span className="text-muted-foreground flex flex-wrap items-center gap-3 pl-10 text-[10px] font-normal">
        <span>
          {discussion.author ? `@${discussion.author}` : t("workspace.repositories.unknownActor")}
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare /> {discussion.commentCount}
        </span>
        <span className="flex items-center gap-1">
          <ThumbsUp /> {discussion.upvoteCount}
        </span>
        <span>
          {t("workspace.repositories.updated", {
            date: formatIssueDate(discussion.updatedAt, locale),
          })}
        </span>
      </span>
    </Button>
  );
}

export function GitHubDiscussionView({ repository }: { repository: GitHubRepository }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [state, setState] = useState<GitHubDiscussionStateFilter>("open");
  const [answered, setAnswered] = useState<GitHubDiscussionAnsweredFilter>("all");
  const [sort, setSort] = useState<GitHubDiscussionSort>("updated");
  const [selectedDiscussionNumber, setSelectedDiscussionNumber] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const categoriesResult = useQuery(
    discussionCategoriesQueryOptions({ owner: repository.owner, repository: repository.name })
  );
  const result = useInfiniteQuery(
    discussionsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      categoryId,
      state,
      answered,
      sort,
    })
  );
  const discussions = useMemo(() => {
    const byId = new Map<string, GitHubDiscussionSummary>();
    for (const page of result.data?.pages ?? []) {
      for (const discussion of page.discussions) {
        if (!byId.has(discussion.id)) byId.set(discussion.id, discussion);
      }
    }
    return [...byId.values()];
  }, [result.data?.pages]);
  const categories = categoriesResult.data?.categories ?? [];
  const enabled = categoriesResult.data?.enabled ?? result.data?.pages[0]?.enabled;
  const totalCount = result.data?.pages[0]?.totalCount;
  const error = !result.data && result.error ? parseIpcError(result.error) : null;
  const supplementalError =
    result.data && result.error
      ? parseIpcError(result.error)
      : categoriesResult.error
        ? parseIpcError(categoriesResult.error)
        : null;

  if (selectedDiscussionNumber !== null) {
    return (
      <GitHubDiscussionDetail
        repository={repository}
        discussionNumber={selectedDiscussionNumber}
        categories={categories}
        onBack={() => setSelectedDiscussionNumber(null)}
      />
    );
  }

  const prefetchDiscussion = (discussion: GitHubDiscussionSummary) => {
    void queryClient.prefetchInfiniteQuery(
      discussionDetailQueryOptions({
        owner: repository.owner,
        repository: repository.name,
        discussionNumber: discussion.number,
      })
    );
  };

  return (
    <div className="@container/discussions flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select
              value={categoryId ?? ALL_CATEGORIES}
              onValueChange={(value) => setCategoryId(value === ALL_CATEGORIES ? null : value)}
            >
              <SelectTrigger size="sm" className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_CATEGORIES}>
                    {t("workspace.repositories.allDiscussionCategories")}
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.emoji} {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground flex min-h-6 items-center gap-2 text-[10px]">
              {result.isFetching && !result.isFetchingNextPage && result.data ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : null}
              {totalCount !== undefined
                ? t("workspace.repositories.discussionCount", { count: totalCount })
                : null}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!enabled || !categories.length}
            onClick={() => setCreating(true)}
          >
            <Plus data-icon="inline-start" />
            {t("workspace.repositories.newDiscussion")}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 @min-[560px]/discussions:grid-cols-3">
          <Select
            value={state}
            onValueChange={(value) => setState(value as GitHubDiscussionStateFilter)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="open">{t("workspace.repositories.openDiscussions")}</SelectItem>
                <SelectItem value="closed">
                  {t("workspace.repositories.closedDiscussions")}
                </SelectItem>
                <SelectItem value="all">
                  {t("workspace.repositories.allDiscussionStates")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={answered}
            onValueChange={(value) => setAnswered(value as GitHubDiscussionAnsweredFilter)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">
                  {t("workspace.repositories.allDiscussionAnswers")}
                </SelectItem>
                <SelectItem value="answered">
                  {t("workspace.repositories.answeredDiscussions")}
                </SelectItem>
                <SelectItem value="unanswered">
                  {t("workspace.repositories.unansweredDiscussions")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as GitHubDiscussionSort)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="updated">{t("workspace.repositories.sortUpdated")}</SelectItem>
                <SelectItem value="created">{t("workspace.repositories.sortCreated")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {supplementalError ? (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 px-4 py-2">
          <TriangleAlert />
          <AlertDescription className="flex min-w-0 items-center gap-3 text-[11px]">
            <span className="min-w-0 flex-1 truncate">{supplementalError.message}</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void Promise.all([result.refetch(), categoriesResult.refetch()])}
            >
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {result.isPending ? (
          <DiscussionSkeletons />
        ) : error ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircle />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.discussionLoadFailed")}</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void result.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : enabled === false ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleOff />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.discussionsDisabled")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.repositories.discussionsDisabledDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : discussions.length ? (
          <div
            className={cn(
              "transition-opacity",
              result.isFetching && !result.isFetchingNextPage && "opacity-60"
            )}
          >
            {discussions.map((discussion) => (
              <DiscussionRow
                key={discussion.id}
                discussion={discussion}
                locale={i18n.language}
                onSelect={() => setSelectedDiscussionNumber(discussion.number)}
                onPrefetch={() => prefetchDiscussion(discussion)}
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircle />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.noDiscussions")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.repositories.noDiscussionsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {result.hasNextPage ? (
          <div className="flex justify-center border-t px-4 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={result.isFetchingNextPage}
              onClick={() => void result.fetchNextPage()}
            >
              {result.isFetchingNextPage ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <MessageCircle data-icon="inline-start" />
              )}
              {t("workspace.repositories.loadMoreDiscussions")}
            </Button>
          </div>
        ) : null}
      </ScrollArea>

      <GitHubDiscussionFormDialog
        repository={repository}
        categories={categories}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(discussion) => setSelectedDiscussionNumber(discussion.number)}
      />
    </div>
  );
}
