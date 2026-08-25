import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  CircleDot,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError, type IpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubIssue, GitHubIssuePage, GitHubRepository } from "./github-data";

type IssueFilter = "all" | "unassigned";

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

export function GitHubIssueView({ repository }: { repository: GitHubRepository }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState<GitHubIssuePage | null>(null);
  const [filter, setFilter] = useState<IssueFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<IpcError | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const request = useRef(0);

  const loadIssues = useCallback(async () => {
    const currentRequest = ++request.current;
    setLoading(true);
    setError(null);
    setSelectedIssue(null);
    try {
      const nextPage = await invoke<GitHubIssuePage>("github_list_repository_issues", {
        owner: repository.owner,
        repository: repository.name,
      });
      if (request.current === currentRequest) setPage(nextPage);
    } catch (reason) {
      if (request.current === currentRequest) setError(parseIpcError(reason));
    } finally {
      if (request.current === currentRequest) setLoading(false);
    }
  }, [repository.name, repository.owner]);

  useEffect(() => {
    setPage(null);
    void loadIssues();
    return () => {
      request.current += 1;
    };
  }, [loadIssues]);

  const issues = useMemo(() => {
    const allIssues = page?.issues ?? [];
    return filter === "unassigned"
      ? allIssues.filter((issue) => issue.assignees.length === 0)
      : allIssues;
  }, [filter, page]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.065] px-4 py-2">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as IssueFilter)}>
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
            {t("workspace.repositories.issueCount", { count: issues.length })}
            {page?.hasMore ? ` · ${t("workspace.repositories.firstPage")}` : ""}
          </span>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <IssueSkeletons />
          ) : error ? (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleDot />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.repositories.issueLoadFailed")}</EmptyTitle>
                <EmptyDescription>{error.message}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void loadIssues()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : issues.length ? (
            issues.map((issue) => (
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
      </div>

      <Sheet open={Boolean(selectedIssue)} onOpenChange={(open) => !open && setSelectedIssue(null)}>
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
