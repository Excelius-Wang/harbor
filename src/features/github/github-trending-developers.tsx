import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { BookMarked, CircleAlert, ExternalLink, RefreshCw, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import {
  trendingDevelopersQueryOptions,
  type GitHubTrendingDeveloper,
  type GitHubTrendingFilters,
  type GitHubTrendingLanguage,
  type GitHubTrendingPeriod,
} from "./github-trending";
import { GitHubTrendingFilterControls } from "./github-trending-filters";

function DeveloperRow({
  developer,
  onSelect,
}: {
  developer: GitHubTrendingDeveloper;
  onSelect: (login: string) => void;
}) {
  const repository = developer.popularRepository;
  const repositoryLabel = repository?.fullName
    .toLowerCase()
    .startsWith(`${developer.login.toLowerCase()}/`)
    ? repository.fullName.slice(developer.login.length + 1)
    : repository?.fullName;

  return (
    <li className="harbor-result-row grid grid-cols-[24px_40px_minmax(0,1fr)] items-start gap-3 px-5 py-4">
      <span className="text-muted-foreground pt-0.5 text-right text-xs leading-5 tabular-nums">
        {developer.rank}
      </span>
      <Button
        variant="ghost"
        size="icon"
        tabIndex={-1}
        aria-label={`@${developer.login}`}
        onClick={() => onSelect(developer.login)}
        className="size-10 rounded-full"
      >
        <Avatar size="lg" aria-hidden="true">
          <AvatarImage
            src={developer.avatarUrl ?? undefined}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <AvatarFallback>{developer.login.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </Button>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Button
          variant="ghost"
          aria-label={`${developer.name} (@${developer.login})`}
          onClick={() => onSelect(developer.login)}
          className="h-auto max-w-full justify-start p-0 text-left"
        >
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-5">
            <span className="max-w-full truncate text-sm font-semibold">{developer.name}</span>
            <span className="text-muted-foreground max-w-full truncate text-xs font-normal">
              @{developer.login}
            </span>
          </span>
        </Button>
        {repository ? (
          <div className="flex w-full min-w-0 flex-col items-start gap-1">
            <Button
              variant="link"
              size="sm"
              aria-label={repository.fullName}
              title={repository.fullName}
              className="h-auto max-w-full justify-start p-0 has-[>svg]:px-0"
              onClick={() => void openExternalUrl(repository.url)}
            >
              <BookMarked data-icon="inline-start" />
              <span className="truncate text-[13px] leading-5">{repositoryLabel}</span>
              <ExternalLink data-icon="inline-end" className="text-muted-foreground size-3" />
            </Button>
            {repository.description ? (
              <p className="text-muted-foreground line-clamp-2 max-w-[72ch] text-xs leading-5 break-words">
                {repository.description}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function GitHubTrendingDevelopers({
  period,
  filters,
  onFiltersChange,
  onSelectDeveloper,
}: {
  period: GitHubTrendingPeriod;
  filters: GitHubTrendingFilters;
  onFiltersChange: (filters: GitHubTrendingFilters) => void;
  onSelectDeveloper: (login: string) => void;
}) {
  const { t } = useTranslation();
  const desktop = isTauri();
  const result = useQuery({ ...trendingDevelopersQueryOptions(period, filters), enabled: desktop });
  const [knownLanguages, setKnownLanguages] = useState<GitHubTrendingLanguage[]>([]);
  useEffect(() => {
    if (result.data?.languages.length) setKnownLanguages(result.data.languages);
  }, [result.data?.languages]);
  const data = result.data;
  const error = !desktop
    ? t("workspace.discovery.desktopOnly")
    : result.error
      ? parseIpcError(result.error).message
      : null;
  const fallbackActions = desktop ? (
    <EmptyContent>
      <Button
        variant="outline"
        size="sm"
        disabled={result.isFetching}
        onClick={() => void result.refetch()}
      >
        <RefreshCw data-icon="inline-start" />
        {t("common.retry")}
      </Button>
    </EmptyContent>
  ) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" aria-busy={result.isFetching}>
      <div className="text-muted-foreground flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 text-[11px]">
        <span>{t("workspace.discovery.developers.source")}</span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <GitHubTrendingFilterControls
            filters={filters}
            languages={data?.languages.length ? data.languages : knownLanguages}
            disabled={!desktop}
            onChange={onFiltersChange}
          />
          {data ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!desktop || result.isFetching}
                  aria-label={t("workspace.discovery.developers.refresh")}
                  onClick={() => void result.refetch()}
                >
                  <RefreshCw />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("workspace.discovery.developers.refresh")}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      {error && data ? (
        <Alert className="mx-5 mb-2 w-auto">
          <CircleAlert />
          <AlertTitle>{t("workspace.discovery.developers.refreshFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
        {error && !data ? (
          <Empty className="min-h-[340px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.discovery.developers.failed")}</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            {fallbackActions}
          </Empty>
        ) : !data ? (
          <div role="status" aria-label={t("workspace.discovery.developers.loading")}>
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="harbor-result-row grid grid-cols-[24px_40px_minmax(0,1fr)] items-start gap-3 px-5 py-4"
                aria-hidden="true"
              >
                <Skeleton className="mt-1 h-3 w-4 justify-self-end" />
                <Skeleton className="size-10 rounded-full" />
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex h-5 items-center gap-2">
                    <Skeleton className="h-3.5 w-28 max-w-full" />
                    <Skeleton className="h-3 w-16 max-w-full" />
                  </div>
                  <div className="flex h-5 items-center">
                    <Skeleton className="h-3 w-36 max-w-full" />
                  </div>
                  <div className="flex h-10 flex-col justify-around">
                    <Skeleton className="h-3 w-full max-w-[54ch]" />
                    <Skeleton className="h-3 w-1/2 max-w-[36ch]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : data.developers.length ? (
          <ol aria-label={t("workspace.discovery.developers.list")}>
            {data.developers.map((developer) => (
              <DeveloperRow
                key={developer.login}
                developer={developer}
                onSelect={onSelectDeveloper}
              />
            ))}
          </ol>
        ) : (
          <Empty className="min-h-[340px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRound />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.discovery.developers.empty")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.discovery.developers.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
            {fallbackActions}
          </Empty>
        )}
      </ScrollArea>
      {result.isFetching && data ? (
        <div
          role="status"
          aria-label={t("workspace.discovery.developers.loading")}
          className="pointer-events-none absolute inset-x-0 top-0"
        >
          <Progress aria-hidden="true" className="h-0.5 rounded-none bg-transparent" />
        </div>
      ) : null}
    </div>
  );
}
