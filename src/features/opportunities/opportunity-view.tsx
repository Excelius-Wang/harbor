import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Inbox,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { WorkspacePageHeader } from "@/features/workspace/workspace-page-header";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { useListScroll } from "@/hooks/use-list-scroll";
import { openExternalUrl } from "@/lib/window";
import { cn } from "@/lib/utils";
import {
  checkMonitor,
  filterOpportunities,
  monitorError,
  monitorKey,
  readMonitor,
  setMonitorEnabled,
  type MonitorSnapshot,
} from "./opportunity-data";
import { OpportunitySettings } from "./opportunity-settings";

export function OpportunityView() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: monitorKey,
    queryFn: readMonitor,
    refetchInterval: 2000,
    retry: false,
  });
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState("");
  const [repository, setRepository] = useState("");
  const [decision, setDecision] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const scroll = useListScroll(JSON.stringify([search, repository, decision]));
  const data = query.data;
  const action = useMutation({
    mutationFn: (work: () => Promise<MonitorSnapshot>) => work(),
    onSuccess: (value) => client.setQueryData(monitorKey, value),
  });
  const items = filterOpportunities(data?.items ?? [], search, repository, decision);
  const selected = items.find((i) => i.id === selectedId) ?? items[0];
  const analysis = selected?.analysis;
  const configured = !!data?.config.repositories.length && data.hasApiKey;
  const disabled = action.isPending || !!data?.busy;
  const failure = action.error
    ? monitorError(action.error)
    : query.error
      ? monitorError(query.error)
      : data?.error;
  const errorText = failure
    ? t(`opportunities.errors.${failure}`, { defaultValue: t("opportunities.errors.network") })
    : "";
  const date = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleString(i18n.language, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("opportunities.never");
  const openWeb = () => {
    if (selected)
      void openExternalUrl(
        `https://github.com/${selected.repository}/issues/${selected.number}`
      ).catch(() => toast.error(t("opportunities.errors.open")));
  };
  const copy = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis.claimDraft);
      toast.success(t("opportunities.copied"));
    } catch {
      toast.error(t("opportunities.errors.copy"));
    }
  };
  return (
    <section
      className="harbor-content flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={t("opportunities.title")}
    >
      <WorkspacePageHeader
        title={t("opportunities.title")}
        description={t("opportunities.subtitle", {
          count: data?.config.repositories.length ?? 0,
          time: date(data?.lastCheckedAt),
        })}
      >
        <span role="status" className="text-muted-foreground mr-1 text-xs">
          {t(
            data?.busy
              ? "opportunities.checking"
              : data?.enabled
                ? "opportunities.running"
                : "opportunities.paused"
          )}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!configured || action.isPending || false}
          onClick={() => action.mutate(() => setMonitorEnabled(!(data?.enabled || data?.busy)))}
        >
          {data?.enabled || data?.busy ? (
            <Pause data-icon="inline-start" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          {t(data?.enabled || data?.busy ? "opportunities.pause" : "opportunities.start")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!configured || disabled}
          onClick={() => action.mutate(() => checkMonitor())}
        >
          <RefreshCw data-icon="inline-start" />
          {t("opportunities.check")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!data || disabled}
          onClick={() => setSettings(true)}
        >
          <Settings data-icon="inline-start" />
          {t("opportunities.settings")}
        </Button>
      </WorkspacePageHeader>
      {failure && data ? (
        <WorkspaceStaleNotice
          message={errorText}
          retryDisabled={disabled}
          onRetry={() => {
            action.reset();
            if (query.error) void query.refetch();
            else action.mutate(() => checkMonitor());
          }}
        />
      ) : null}
      {query.isPending ? (
        <div
          aria-label={t("opportunities.loading")}
          role="status"
          className="flex min-h-0 flex-1 gap-6 p-5"
        >
          <div className="workspace-wide:w-80 flex w-full flex-col gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="workspace-wide:block hidden flex-1" />
        </div>
      ) : !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm">
          <p role="alert">{errorText}</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : !configured ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <Inbox className="text-muted-foreground size-8" />
          <h2 className="font-medium">{t("opportunities.setupTitle")}</h2>
          <p className="text-muted-foreground max-w-md text-sm leading-6">
            {t("opportunities.setupDescription")}
          </p>
          <Button onClick={() => setSettings(true)}>{t("opportunities.settings")}</Button>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          <aside
            className={cn(
              "harbor-subtle-divider workspace-wide:flex workspace-wide:w-[330px] workspace-wide:border-r min-h-0 w-full shrink-0 flex-col",
              detailOpen && selected ? "hidden" : "flex"
            )}
          >
            <div className="flex shrink-0 flex-col gap-3 p-4">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
                <Input
                  className="pl-9"
                  aria-label={t("opportunities.search")}
                  placeholder={t("opportunities.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex min-w-0 gap-2">
                <Select
                  value={repository || "all"}
                  onValueChange={(v) => setRepository(v === "all" ? "" : v)}
                >
                  <SelectTrigger
                    size="sm"
                    className="harbor-filter-trigger min-w-0 flex-1"
                    aria-label={t("opportunities.repositoryFilter")}
                  >
                    <SelectValue placeholder={t("opportunities.allRepositories")} />
                  </SelectTrigger>
                  <SelectContent className="harbor-popover">
                    <SelectGroup>
                      <SelectItem value="all">{t("opportunities.allRepositories")}</SelectItem>
                      {data.config.repositories.map((repo) => (
                        <SelectItem key={repo} value={repo}>
                          {repo}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  value={decision || "all"}
                  onValueChange={(v) => setDecision(v === "all" ? "" : v)}
                >
                  <SelectTrigger
                    size="sm"
                    className="harbor-filter-trigger min-w-0 flex-1"
                    aria-label={t("opportunities.decisionFilter")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="harbor-popover">
                    <SelectGroup>
                      <SelectItem value="all">{t("opportunities.allDecisions")}</SelectItem>
                      <SelectItem value="recommend">{t("opportunities.recommend")}</SelectItem>
                      <SelectItem value="clarify">{t("opportunities.clarify")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
                <span>{t("opportunities.count", { count: items.length })}</span>
                {data.pendingCount > 0 ? (
                  <span>{t("opportunities.pendingCount", { count: data.pendingCount })}</span>
                ) : null}
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1" constrainContentWidth {...scroll}>
              <div className="flex flex-col gap-1 px-2 pb-4">
                {items.map((item) => (
                  <Button
                    key={item.id}
                    ref={selected?.id === item.id ? selectedButton : undefined}
                    variant="ghost"
                    aria-pressed={selected?.id === item.id}
                    className={cn(
                      "harbor-result-row h-auto min-h-24 w-full flex-col items-start gap-1.5 rounded-md px-3 py-3 text-left whitespace-normal",
                      selected?.id === item.id && "bg-[var(--harbor-selected-fill)]"
                    )}
                    onClick={() => {
                      setSelectedId(item.id);
                      setDetailOpen(true);
                    }}
                  >
                    <span
                      className="text-muted-foreground w-full truncate text-xs font-normal"
                      title={item.repository}
                    >
                      {item.repository} · #{item.number}
                    </span>
                    <span className="line-clamp-2 w-full text-[13px] leading-5 font-medium break-words">
                      {item.title}
                    </span>
                    <span className="text-muted-foreground text-[11px] font-normal">
                      {t(
                        item.pending
                          ? "opportunities.updating"
                          : `opportunities.${item.analysis?.decision}`
                      )}{" "}
                      · {date(item.checkedAt)}
                    </span>
                  </Button>
                ))}
                {!items.length ? (
                  <div className="flex flex-col items-center gap-3 p-5 text-center">
                    <Inbox className="text-muted-foreground size-6" />
                    <p className="text-sm">{t("opportunities.empty")}</p>
                    <p className="text-muted-foreground text-xs leading-5">
                      {t(
                        search || repository || decision
                          ? "opportunities.emptyFiltered"
                          : "opportunities.emptyHelp"
                      )}
                    </p>
                    {!search && !repository && !decision ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() => action.mutate(() => checkMonitor(7))}
                      >
                        {t("opportunities.history")}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearch("");
                          setRepository("");
                          setDecision("");
                        }}
                      >
                        {t("opportunities.clearFilters")}
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </aside>
          <div
            className={cn(
              "workspace-wide:flex min-h-0 min-w-0 flex-1 flex-col",
              detailOpen && selected ? "flex" : "hidden"
            )}
          >
            {selected && analysis ? (
              <ScrollArea key={selected.id} className="min-h-0 flex-1" constrainContentWidth>
                <article className="mx-auto flex max-w-[900px] flex-col gap-6 p-5 lg:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="workspace-wide:hidden"
                      onClick={() => {
                        setDetailOpen(false);
                        requestAnimationFrame(() => selectedButton.current?.focus());
                      }}
                    >
                      <ArrowLeft data-icon="inline-start" />
                      {t("opportunities.back")}
                    </Button>
                    <span className="text-muted-foreground min-w-0 text-xs break-all">
                      {selected.repository} · #{selected.number}
                    </span>
                    <Button variant="link" size="sm" onClick={openWeb}>
                      {t("opportunities.openWeb")}
                      <ExternalLink data-icon="inline-end" />
                    </Button>
                  </div>
                  <header className="harbor-subtle-divider flex flex-col gap-3 border-b pb-5">
                    <h2 className="text-xl leading-7 font-semibold tracking-tight break-words">
                      {selected.title}
                    </h2>
                    <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span>{t(`opportunities.${analysis.decision}`)}</span>
                      <span>{t("opportunities.unverified")}</span>
                      <span>{t("opportunities.checked", { time: date(selected.checkedAt) })}</span>
                    </p>
                  </header>
                  {selected.pending ? (
                    <p role="status" className="text-attention text-xs">
                      {t("opportunities.staleItem")}
                    </p>
                  ) : null}
                  <BriefSection title={t("opportunities.summary")}>
                    <p>{analysis.summary}</p>
                  </BriefSection>
                  <BriefSection title={t("opportunities.reasons")}>
                    <ul className="list-disc pl-4">
                      {analysis.reasons.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </BriefSection>
                  <BriefSection title={t("opportunities.uncertainties")}>
                    <ul className="list-disc pl-4">
                      {analysis.uncertainties.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </BriefSection>
                  <BriefSection title={t("opportunities.firstStep")}>
                    <p>{analysis.firstStep}</p>
                  </BriefSection>
                  <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[13px] font-medium">
                        {t("opportunities.draft")}
                        <span className="text-muted-foreground ml-3 text-xs font-normal">
                          {t("opportunities.notSent")}
                        </span>
                      </h3>
                      <Button
                        size="sm"
                        variant="link"
                        disabled={selected.pending || !analysis.claimDraft}
                        onClick={() => void copy()}
                      >
                        <Copy data-icon="inline-start" />
                        {t("opportunities.copy")}
                      </Button>
                    </div>
                    <p className="harbor-reading rounded-lg p-4 text-[13px] leading-6 break-words whitespace-pre-wrap select-text">
                      {analysis.claimDraft}
                    </p>
                    <p className="text-muted-foreground text-xs leading-5">
                      {t("opportunities.draftHelp")}
                    </p>
                  </section>
                  <p className="text-muted-foreground text-xs leading-5">
                    {t("opportunities.scope")}
                  </p>
                </article>
              </ScrollArea>
            ) : (
              <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
                {t("opportunities.select")}
              </div>
            )}
          </div>
        </div>
      )}
      {settings && data ? (
        <OpportunitySettings snapshot={data} onClose={() => setSettings(false)} />
      ) : null}
    </section>
  );
}
function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">{title}</h3>
      <div className="text-[13px] leading-6 break-words select-text">{children}</div>
    </section>
  );
}
