import { CheckCircle2, ChevronRight, CircleDot, MessageSquare, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { GitHubIssue, GitHubIssueRepository } from "./github-data";
import { formatIssueDate, GitHubIssueLabelBadge } from "./github-issue-shared";

export function GitHubIssueRow({
  issue,
  repository,
  locale,
  showRepository = false,
  onSelect,
  onPrefetch,
}: {
  issue: GitHubIssue;
  repository?: GitHubIssueRepository;
  locale: string;
  showRepository?: boolean;
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
        {issue.state === "open" ? (
          <CircleDot className="text-primary mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 className="text-muted-foreground mt-0.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          {showRepository && repository ? (
            <span className="text-muted-foreground mb-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-normal">
              <span className="truncate font-medium">{repository.fullName}</span>
              <span className="shrink-0">#{issue.number}</span>
            </span>
          ) : null}
          <span className="text-foreground/95 block text-[13px] leading-5 font-medium">
            {issue.title}
          </span>
          <span className="text-muted-foreground mt-1 line-clamp-2 block text-[11px] leading-5 font-normal">
            {issue.body || t("workspace.repositories.noIssueBody")}
          </span>
        </span>
        {!showRepository ? (
          <span className="text-muted-foreground shrink-0 text-[10px] font-normal">
            #{issue.number}
          </span>
        ) : null}
      </span>
      {issue.labels.length ? (
        <span className="flex flex-wrap gap-1.5 pl-6">
          {issue.labels.slice(0, 5).map((label) => (
            <GitHubIssueLabelBadge key={label.name} {...label} />
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
        <span>
          {t("workspace.repositories.updated", {
            date: formatIssueDate(issue.updatedAt, locale),
          })}
        </span>
        <ChevronRight className="ml-auto" />
      </span>
    </Button>
  );
}
