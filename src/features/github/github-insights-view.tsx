import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileQuestion,
  RefreshCw,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubCodeFrequencyWeek,
  GitHubCommitActivityWeek,
  GitHubInsightsStatisticStatus,
  GitHubInsightsTrafficPeriod,
  GitHubRepository,
  GitHubRepositoryInsightsContributors,
  GitHubRepositoryInsightsOverview,
  GitHubRepositoryInsightsTraffic,
  GitHubTrafficPath,
  GitHubTrafficReferrer,
  GitHubTrafficSeries,
} from "./github-data";
import {
  repositoryInsightsContributorsQueryOptions,
  repositoryInsightsOverviewQueryOptions,
  repositoryInsightsTrafficQueryOptions,
} from "./github-queries";

type InsightsTab = "overview" | "contributors" | "traffic";

function InsightsSkeleton() {
  return (
    <div className="grid gap-4 p-4 @min-[820px]/insights:grid-cols-2">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-72 w-full @min-[820px]/insights:col-span-2" />
    </div>
  );
}

function InsightsError({
  error,
  traffic,
  onRetry,
}: {
  error: unknown;
  traffic?: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const parsed = parseIpcError(error);
  const permission = traffic && parsed.code === "githubPermission";
  return (
    <Empty className="min-h-72">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>
          {permission
            ? t("workspace.repositories.insights.trafficPermissionTitle")
            : t("workspace.repositories.insights.loadFailed")}
        </EmptyTitle>
        <EmptyDescription>
          {permission
            ? t("workspace.repositories.insights.trafficPermissionDescription")
            : parsed.message}
        </EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw data-icon="inline-start" />
        {t("workspace.repositories.retry")}
      </Button>
    </Empty>
  );
}

function SupplementalError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <CircleAlert />
      <AlertTitle>{t("workspace.repositories.insights.refreshFailed")}</AlertTitle>
      <AlertDescription className="flex min-w-0 items-center gap-3">
        <span className="min-w-0 flex-1 truncate">{parseIpcError(error).message}</span>
        <Button variant="ghost" size="xs" onClick={onRetry}>
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function StatisticNotice({ status }: { status: Exclude<GitHubInsightsStatisticStatus, "ready"> }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex min-h-44 flex-col items-center justify-center gap-2 px-4 text-center">
      {status === "building" ? (
        <Spinner className="text-primary" />
      ) : (
        <FileQuestion className="size-5" />
      )}
      <p className="text-foreground text-xs font-medium">
        {t(`workspace.repositories.insights.statistics.${status}.title`)}
      </p>
      <p className="max-w-sm text-[11px] leading-5">
        {t(`workspace.repositories.insights.statistics.${status}.description`)}
      </p>
    </div>
  );
}

function formatWeek(week: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    new Date(week * 1_000)
  );
}

function commitChartData(weeks: GitHubCommitActivityWeek[], locale: string) {
  return weeks.map((week) => ({
    label: formatWeek(week.week, locale),
    commits: week.total,
  }));
}

function frequencyChartData(weeks: GitHubCodeFrequencyWeek[], locale: string) {
  return weeks.map((week) => ({
    label: formatWeek(week.week, locale),
    additions: week.additions,
    deletions: week.deletions,
  }));
}

function CommunityCard({ overview }: { overview: GitHubRepositoryInsightsOverview }) {
  const { t } = useTranslation();
  const community = overview.community;
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{t("workspace.repositories.insights.community")}</CardTitle>
        <CardDescription className="text-xs">
          {community.description ?? t("workspace.repositories.insights.communityDescription")}
        </CardDescription>
        <CardAction className="font-mono text-lg font-semibold tabular-nums">
          {community.healthPercentage}%
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <Progress
          value={community.healthPercentage}
          aria-label={t("workspace.repositories.insights.communityHealthLabel", {
            percentage: community.healthPercentage,
          })}
        />
        <div className="grid gap-1.5 @min-[600px]/insights:grid-cols-2">
          {community.files.map((file) => (
            <Button
              key={file.key}
              type="button"
              variant="ghost"
              size="sm"
              disabled={!file.url}
              onClick={() => {
                if (file.url) void openExternalUrl(file.url);
              }}
              className="justify-start"
            >
              {file.present ? (
                <CheckCircle2 data-icon="inline-start" />
              ) : (
                <FileQuestion data-icon="inline-start" />
              )}
              <span className="truncate">
                {t(`workspace.repositories.insights.communityFiles.${file.key}`, {
                  defaultValue: file.name,
                })}
              </span>
              {file.url ? <ExternalLink data-icon="inline-end" /> : null}
            </Button>
          ))}
        </div>
        {community.documentation ? (
          <p className="text-muted-foreground text-[10px]">
            {t("workspace.repositories.insights.documentation", {
              documentation: community.documentation,
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CommitActivityCard({ overview }: { overview: GitHubRepositoryInsightsOverview }) {
  const { t, i18n } = useTranslation();
  const activity = overview.commitActivity;
  const chartConfig = {
    commits: {
      label: t("workspace.repositories.insights.commits"),
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;
  const data = useMemo(
    () => commitChartData(activity.weeks, i18n.language),
    [activity.weeks, i18n.language]
  );
  const total = activity.weeks.reduce((sum, week) => sum + week.total, 0);
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">
          {t("workspace.repositories.insights.commitActivity")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("workspace.repositories.insights.lastYear")}
        </CardDescription>
        {activity.status === "ready" ? (
          <CardAction className="font-mono text-lg font-semibold tabular-nums">{total}</CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-2 @min-[600px]/insights:px-4">
        {activity.status === "ready" ? (
          data.length ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-[210px] w-full">
              <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="commits" fill="var(--color-commits)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <StatisticNotice status="unavailable" />
          )
        ) : (
          <StatisticNotice status={activity.status} />
        )}
      </CardContent>
    </Card>
  );
}

function CodeFrequencyCard({ overview }: { overview: GitHubRepositoryInsightsOverview }) {
  const { t, i18n } = useTranslation();
  const frequency = overview.codeFrequency;
  const chartConfig = {
    additions: {
      label: t("workspace.repositories.insights.additions"),
      color: "var(--chart-1)",
    },
    deletions: {
      label: t("workspace.repositories.insights.deletions"),
      color: "var(--chart-4)",
    },
  } satisfies ChartConfig;
  const data = useMemo(
    () => frequencyChartData(frequency.weeks, i18n.language),
    [frequency.weeks, i18n.language]
  );
  return (
    <Card className="gap-4 py-4 @min-[820px]/insights:col-span-2">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">
          {t("workspace.repositories.insights.codeFrequency")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("workspace.repositories.insights.codeFrequencyDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 @min-[600px]/insights:px-4">
        {frequency.status === "ready" ? (
          data.length ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
              <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="additions" fill="var(--color-additions)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="deletions" fill="var(--color-deletions)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <StatisticNotice status="unavailable" />
          )
        ) : (
          <StatisticNotice status={frequency.status} />
        )}
      </CardContent>
    </Card>
  );
}

function OverviewPanel({ overview }: { overview: GitHubRepositoryInsightsOverview }) {
  return (
    <div className="grid gap-4 p-4 @min-[820px]/insights:grid-cols-2">
      <CommunityCard overview={overview} />
      <CommitActivityCard overview={overview} />
      <CodeFrequencyCard overview={overview} />
    </div>
  );
}

function ContributorsPanel({ data }: { data: GitHubRepositoryInsightsContributors }) {
  const { t, i18n } = useTranslation();
  if (data.status !== "ready") return <StatisticNotice status={data.status} />;
  if (!data.contributors.length) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>{t("workspace.repositories.insights.noContributors")}</EmptyTitle>
          <EmptyDescription>
            {t("workspace.repositories.insights.noContributorsDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const topContributors = data.contributors.slice(0, 10);
  const chartData = topContributors.map((contributor, index) => ({
    login:
      contributor.login ?? t("workspace.repositories.insights.anonymous", { number: index + 1 }),
    commits: contributor.total,
  }));
  const number = new Intl.NumberFormat(i18n.language);
  const chartConfig = {
    commits: {
      label: t("workspace.repositories.insights.commits"),
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">
            {t("workspace.repositories.insights.topContributors")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("workspace.repositories.insights.contributorsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 @min-[600px]/insights:px-4">
          <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
            <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="login" type="category" tickLine={false} axisLine={false} width={90} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="commits" fill="var(--color-commits)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">
            {t("workspace.repositories.insights.contributorTotals")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("workspace.repositories.insights.statisticsExcludeMerges")}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 @min-[600px]/insights:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.repositories.insights.contributor")}</TableHead>
                <TableHead className="text-right">
                  {t("workspace.repositories.insights.commits")}
                </TableHead>
                <TableHead className="text-right">
                  {t("workspace.repositories.insights.additions")}
                </TableHead>
                <TableHead className="text-right">
                  {t("workspace.repositories.insights.deletions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topContributors.map((contributor, index) => {
                const login =
                  contributor.login ??
                  t("workspace.repositories.insights.anonymous", { number: index + 1 });
                return (
                  <TableRow key={`${login}-${index}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          {contributor.avatarUrl ? (
                            <AvatarImage src={contributor.avatarUrl} alt={`@${login}`} />
                          ) : null}
                          <AvatarFallback>{login.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {contributor.login ? (
                          <Button
                            type="button"
                            variant="link"
                            size="xs"
                            onClick={() => void openExternalUrl(`https://github.com/${login}`)}
                          >
                            {login}
                          </Button>
                        ) : (
                          <span className="text-xs">{login}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {number.format(contributor.total)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {number.format(contributor.additions)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {number.format(contributor.deletions)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TrafficSeriesCard({
  title,
  description,
  series,
}: {
  title: string;
  description: string;
  series: GitHubTrafficSeries;
}) {
  const { t, i18n } = useTranslation();
  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }),
    [i18n.language]
  );
  const data = series.points.map((point) => ({
    label: formatter.format(new Date(point.timestamp)),
    count: point.count,
    uniques: point.uniques,
  }));
  const chartConfig = {
    count: {
      label: title,
      color: "var(--chart-1)",
    },
    uniques: {
      label: t("workspace.repositories.insights.unique"),
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
        <CardAction className="text-right">
          <p className="font-mono text-lg font-semibold tabular-nums">
            {new Intl.NumberFormat(i18n.language).format(series.count)}
          </p>
          <p className="text-muted-foreground text-[10px]">
            {t("workspace.repositories.insights.uniqueCount", {
              value: new Intl.NumberFormat(i18n.language).format(series.uniques),
            })}
          </p>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 @min-[600px]/insights:px-4">
        {data.length ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-[210px] w-full">
            <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis hide />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Line
                dataKey="count"
                type="monotone"
                stroke="var(--color-count)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="uniques"
                type="monotone"
                stroke="var(--color-uniques)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <StatisticNotice status="unavailable" />
        )}
      </CardContent>
    </Card>
  );
}

function ReferrersTable({ rows }: { rows: GitHubTrafficReferrer[] }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{t("workspace.repositories.insights.referrers")}</CardTitle>
        <CardDescription className="text-xs">
          {t("workspace.repositories.insights.referrersDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 @min-[600px]/insights:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("workspace.repositories.insights.source")}</TableHead>
              <TableHead className="text-right">
                {t("workspace.repositories.insights.views")}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.repositories.insights.unique")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.referrer}>
                  <TableCell className="max-w-56 truncate">{row.referrer}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {number.format(row.count)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {number.format(row.uniques)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground h-24 text-center">
                  {t("workspace.repositories.insights.noTrafficRows")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PathsTable({ rows }: { rows: GitHubTrafficPath[] }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">
          {t("workspace.repositories.insights.popularContent")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("workspace.repositories.insights.popularContentDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 @min-[600px]/insights:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("workspace.repositories.insights.content")}</TableHead>
              <TableHead className="text-right">
                {t("workspace.repositories.insights.views")}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.repositories.insights.unique")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.path}>
                  <TableCell className="max-w-72">
                    {row.url ? (
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        onClick={() => void openExternalUrl(row.url!)}
                        className="max-w-full justify-start"
                      >
                        <span className="truncate">{row.title || row.path}</span>
                        <ExternalLink data-icon="inline-end" />
                      </Button>
                    ) : (
                      <span className="block truncate text-xs">{row.title || row.path}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {number.format(row.count)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {number.format(row.uniques)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground h-24 text-center">
                  {t("workspace.repositories.insights.noTrafficRows")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TrafficPanel({
  data,
  period,
  onPeriodChange,
}: {
  data: GitHubRepositoryInsightsTraffic;
  period: GitHubInsightsTrafficPeriod;
  onPeriodChange: (period: GitHubInsightsTrafficPeriod) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-end">
        <Select
          value={period}
          onValueChange={(value) => onPeriodChange(value as GitHubInsightsTrafficPeriod)}
        >
          <SelectTrigger size="sm" aria-label={t("workspace.repositories.insights.period")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="day">
                {t("workspace.repositories.insights.periods.day")}
              </SelectItem>
              <SelectItem value="week">
                {t("workspace.repositories.insights.periods.week")}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 @min-[820px]/insights:grid-cols-2">
        <TrafficSeriesCard
          title={t("workspace.repositories.insights.pageViews")}
          description={t("workspace.repositories.insights.pageViewsDescription")}
          series={data.views}
        />
        <TrafficSeriesCard
          title={t("workspace.repositories.insights.clones")}
          description={t("workspace.repositories.insights.clonesDescription")}
          series={data.clones}
        />
        <ReferrersTable rows={data.referrers} />
        <PathsTable rows={data.paths} />
      </div>
    </div>
  );
}

export function GitHubInsightsView({ repository }: { repository: GitHubRepository }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<InsightsTab>("overview");
  const [period, setPeriod] = useState<GitHubInsightsTrafficPeriod>("day");
  const target = { owner: repository.owner, repository: repository.name };
  const overviewResult = useQuery({
    ...repositoryInsightsOverviewQueryOptions(target),
    enabled: tab === "overview",
  });
  const contributorsResult = useQuery({
    ...repositoryInsightsContributorsQueryOptions(target),
    enabled: tab === "contributors",
  });
  const trafficResult = useQuery({
    ...repositoryInsightsTrafficQueryOptions({ ...target, period }),
    enabled: tab === "traffic",
  });

  const isFetching =
    tab === "overview"
      ? overviewResult.isFetching
      : tab === "contributors"
        ? contributorsResult.isFetching
        : trafficResult.isFetching;
  const refresh = () => {
    if (tab === "overview") return overviewResult.refetch();
    if (tab === "contributors") return contributorsResult.refetch();
    return trafficResult.refetch();
  };

  return (
    <section className="@container/insights flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-white/[0.065] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-md">
            <BarChart3 className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {t("workspace.repositories.insights.title")}
            </h2>
            <p className="text-muted-foreground truncate text-[10px]">
              {t("workspace.repositories.insights.description")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("workspace.repositories.insights.refresh")}
          disabled={isFetching}
          onClick={() => void refresh()}
        >
          {isFetching ? <Spinner /> : <RefreshCw />}
        </Button>
      </div>

      <div className="flex shrink-0 items-center border-b border-white/[0.055] px-4 py-2">
        <Tabs value={tab} onValueChange={(value) => setTab(value as InsightsTab)}>
          <TabsList variant="line" className="h-9 gap-3 p-0">
            <TabsTrigger value="overview" className="px-1.5 text-xs">
              <Activity /> {t("workspace.repositories.insights.tabs.overview")}
            </TabsTrigger>
            <TabsTrigger value="contributors" className="px-1.5 text-xs">
              <Users /> {t("workspace.repositories.insights.tabs.contributors")}
            </TabsTrigger>
            <TabsTrigger value="traffic" className="px-1.5 text-xs">
              <Clock3 /> {t("workspace.repositories.insights.tabs.traffic")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "overview" && overviewResult.data && overviewResult.error ? (
        <SupplementalError error={overviewResult.error} onRetry={() => void refresh()} />
      ) : null}
      {tab === "contributors" && contributorsResult.data && contributorsResult.error ? (
        <SupplementalError error={contributorsResult.error} onRetry={() => void refresh()} />
      ) : null}
      {tab === "traffic" && trafficResult.data && trafficResult.error ? (
        <SupplementalError error={trafficResult.error} onRetry={() => void refresh()} />
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[1360px]">
          {tab === "overview" ? (
            overviewResult.isPending ? (
              <InsightsSkeleton />
            ) : overviewResult.data ? (
              <OverviewPanel overview={overviewResult.data} />
            ) : (
              <InsightsError error={overviewResult.error} onRetry={() => void refresh()} />
            )
          ) : tab === "contributors" ? (
            contributorsResult.isPending ? (
              <InsightsSkeleton />
            ) : contributorsResult.data ? (
              <ContributorsPanel data={contributorsResult.data} />
            ) : (
              <InsightsError error={contributorsResult.error} onRetry={() => void refresh()} />
            )
          ) : trafficResult.isPending ? (
            <InsightsSkeleton />
          ) : trafficResult.data ? (
            <TrafficPanel data={trafficResult.data} period={period} onPeriodChange={setPeriod} />
          ) : (
            <InsightsError error={trafficResult.error} traffic onRetry={() => void refresh()} />
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
