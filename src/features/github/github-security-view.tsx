import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, CircleAlert, KeyRound, RefreshCw, ScanSearch, ShieldCheck } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type {
  GitHubRepository,
  GitHubSecurityAlertKind,
  GitHubSecurityAlertSeverityFilter,
  GitHubSecurityAlertSort,
  GitHubSecurityAlertStateFilter,
  GitHubSecurityAlertSummary,
} from "./github-data";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import { securityAlertsQueryOptions } from "./github-queries";
import { GitHubSecurityAlertDetail } from "./github-security-detail";
import {
  SecuritySeverityBadge,
  SecurityStateBadge,
  severityRailClass,
} from "./github-security-shared";

function SecurityListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex gap-3 border-b px-4 py-4">
          <Skeleton className="h-14 w-1 shrink-0 rounded-none" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

function SecurityAlertRow({
  alert,
  locale,
  onOpen,
}: {
  alert: GitHubSecurityAlertSummary;
  locale: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const details = securityAlertDetails(alert, t);
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      className="relative h-auto w-full justify-start gap-0 overflow-hidden rounded-none border-b px-0 py-0 text-left whitespace-normal hover:bg-white/[0.025]"
    >
      <span className={cn("w-1 self-stretch", severityRailClass(alert))} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 items-start gap-4 px-4 py-3.5">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="text-foreground line-clamp-2 text-[13px] leading-5 font-medium">
            {alert.title}
          </span>
          <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-normal">
            {details.map((detail) => (
              <span key={detail} className="max-w-full truncate">
                {detail}
              </span>
            ))}
          </span>
          <span className="text-muted-foreground text-[10px] font-normal">
            {t("workspace.security.alertNumber", { number: alert.number })}
            {" · "}
            {formatIssueDate(alert.updatedAt ?? alert.createdAt, locale)}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {alert.kind !== "secretScanning" ? (
            <SecuritySeverityBadge severity={alert.severity} />
          ) : alert.validity === "active" ? (
            <Badge variant="destructive" className="h-6 rounded-md px-2">
              {t("workspace.security.activeSecret")}
            </Badge>
          ) : null}
          <SecurityStateBadge alert={alert} />
        </span>
      </span>
    </Button>
  );
}

export function GitHubSecurityView({ repository }: { repository: GitHubRepository }) {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<GitHubSecurityAlertKind>("dependabot");
  const [state, setState] = useState<GitHubSecurityAlertStateFilter>("open");
  const [severity, setSeverity] = useState<GitHubSecurityAlertSeverityFilter>("all");
  const [sort, setSort] = useState<GitHubSecurityAlertSort>("updated");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{
    kind: GitHubSecurityAlertKind;
    number: number;
  } | null>(null);
  const result = useQuery({
    ...securityAlertsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      kind,
      state,
      severity: kind === "secretScanning" ? "all" : severity,
      sort,
      page,
    }),
    placeholderData: (previous) => previous,
  });
  const data = result.data;
  const error = !data && result.error ? parseIpcError(result.error) : null;
  const supplementalError = data && result.error ? parseIpcError(result.error) : null;

  if (selected) {
    return (
      <GitHubSecurityAlertDetail
        repository={repository}
        kind={selected.kind}
        alertNumber={selected.number}
        backLabel={t("workspace.security.back")}
        onBack={() => setSelected(null)}
      />
    );
  }

  const changeKind = (nextKind: GitHubSecurityAlertKind) => {
    setKind(nextKind);
    setSeverity("all");
    setPage(1);
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-white/[0.065] px-4 py-2.5">
        <Tabs value={kind} onValueChange={(value) => changeKind(value as GitHubSecurityAlertKind)}>
          <TabsList variant="line" className="h-9 gap-3 p-0">
            <TabsTrigger value="dependabot" className="px-1.5 text-xs">
              <Bot /> {t("workspace.security.kinds.dependabot")}
            </TabsTrigger>
            <TabsTrigger value="codeScanning" className="px-1.5 text-xs">
              <ScanSearch /> {t("workspace.security.kinds.codeScanning")}
            </TabsTrigger>
            <TabsTrigger value="secretScanning" className="px-1.5 text-xs">
              <KeyRound /> {t("workspace.security.kinds.secretScanning")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("workspace.security.refresh")}
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          {result.isFetching ? <Spinner /> : <RefreshCw />}
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.055] px-4 py-2.5">
        <Select
          value={state}
          onValueChange={(value) => {
            setState(value as GitHubSecurityAlertStateFilter);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("workspace.security.filters.state")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(["open", "closed", "all"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`workspace.security.filters.states.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={severity}
          disabled={kind === "secretScanning"}
          onValueChange={(value) => {
            setSeverity(value as GitHubSecurityAlertSeverityFilter);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("workspace.security.filters.severity")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(["all", "critical", "high", "medium", "low"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`workspace.security.filters.severities.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(value) => {
            setSort(value as GitHubSecurityAlertSort);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("workspace.security.filters.sort")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="updated">{t("workspace.security.filters.updated")}</SelectItem>
              <SelectItem value="created">{t("workspace.security.filters.created")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground ml-auto text-[10px]">
          {data ? t("workspace.security.pageCount", { count: data.alerts.length }) : null}
        </span>
      </div>

      {supplementalError ? (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 px-4 py-2">
          <CircleAlert />
          <AlertDescription className="flex min-w-0 items-center gap-3 text-[11px]">
            <span className="min-w-0 flex-1 truncate">{supplementalError.message}</span>
            <Button variant="ghost" size="xs" onClick={() => void result.refetch()}>
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {result.isPending && !data ? (
          <SecurityListSkeleton />
        ) : error ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>{t(securityErrorTitle(error.code))}</EmptyTitle>
              <EmptyDescription>
                {error.code === "githubPermission" || error.code === "githubSecurityUnavailable"
                  ? t("workspace.security.permissionDescription")
                  : error.message}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void result.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : data?.alerts.length ? (
          <div className={cn("transition-opacity", result.isFetching && "opacity-60")}>
            {data.alerts.map((alert) => (
              <SecurityAlertRow
                key={`${alert.kind}-${alert.number}`}
                alert={alert}
                locale={i18n.language}
                onOpen={() => setSelected({ kind: alert.kind, number: alert.number })}
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.security.empty")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.security.emptyDescription", {
                  kind: t(`workspace.security.kinds.${kind}`),
                })}
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
            ariaLabel={t("workspace.security.pagination")}
          />
        ) : null}
      </ScrollArea>
    </section>
  );
}

function securityAlertDetails(
  alert: GitHubSecurityAlertSummary,
  t: ReturnType<typeof useTranslation>["t"]
) {
  switch (alert.kind) {
    case "dependabot":
      return [
        `${alert.ecosystem} / ${alert.packageName}`,
        alert.manifestPath,
        alert.scope
          ? t(`workspace.security.scopes.${alert.scope}`, { defaultValue: alert.scope })
          : null,
      ].filter((value): value is string => Boolean(value));
    case "codeScanning":
      return [
        alert.toolName,
        alert.path ? `${alert.path}${alert.startLine ? `:${alert.startLine}` : ""}` : null,
        alert.reference,
      ].filter((value): value is string => Boolean(value));
    case "secretScanning":
      return [
        alert.secretType,
        t(`workspace.security.validity.${alert.validity}`, { defaultValue: alert.validity }),
        alert.assignee ? t("workspace.security.assignedTo", { login: alert.assignee.login }) : null,
      ].filter((value): value is string => Boolean(value));
  }
}

function securityErrorTitle(code: string) {
  if (code === "githubNotConnected") return "workspace.security.connectTitle";
  if (code === "githubPermission") return "workspace.security.permissionTitle";
  if (code === "githubSecurityUnavailable") return "workspace.security.unavailableTitle";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.security.loadFailed";
}
