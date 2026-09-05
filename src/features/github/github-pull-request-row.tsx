import { ChevronRight, GitPullRequest, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GitHubPullRequestSummary } from "./github-data";
import { formatIssueDate, GitHubIssueLabelBadge } from "./github-issue-shared";
import { GitHubPullRequestStateBadge } from "./github-pull-request-shared";

export function GitHubPullRequestRow({
  pullRequest,
  locale,
  showRepository = false,
  onSelect,
  onPrefetch,
}: {
  pullRequest: GitHubPullRequestSummary;
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
        <GitPullRequest
          className={cn(
            "mt-0.5 shrink-0",
            pullRequest.merged
              ? "text-merged"
              : pullRequest.draft
                ? "text-muted-foreground"
                : pullRequest.state === "open"
                  ? "text-success"
                  : "text-destructive"
          )}
        />
        <span className="min-w-0 flex-1">
          {showRepository ? (
            <span className="text-muted-foreground mb-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[10px] font-normal">
              <span className="truncate font-medium">{pullRequest.repository.fullName}</span>
              <span className="shrink-0">#{pullRequest.number}</span>
            </span>
          ) : null}
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-card-foreground min-w-0 text-[13px] leading-5 font-semibold">
              {pullRequest.title}
            </span>
            {(pullRequest.draft || pullRequest.merged || pullRequest.state === "closed") && (
              <GitHubPullRequestStateBadge pullRequest={pullRequest} />
            )}
          </span>
        </span>
        {!showRepository ? (
          <span className="text-muted-foreground shrink-0 font-mono text-[10px] font-normal tabular-nums">
            #{pullRequest.number}
          </span>
        ) : null}
      </span>
      {pullRequest.labels.length ? (
        <span className="flex flex-wrap gap-1.5 pl-6">
          {pullRequest.labels.slice(0, 5).map((label) => (
            <GitHubIssueLabelBadge key={label.name} {...label} />
          ))}
        </span>
      ) : null}
      <span className="text-muted-foreground flex flex-wrap items-center gap-3 pl-6 text-[10px] font-normal">
        <span className="text-card-foreground/70 font-medium">@{pullRequest.author}</span>
        <span className="flex items-center gap-1 font-mono tabular-nums">
          <MessageSquare /> {pullRequest.comments}
        </span>
        <span className="font-mono tabular-nums">
          {t("workspace.repositories.updated", {
            date: formatIssueDate(pullRequest.updatedAt, locale),
          })}
        </span>
        <ChevronRight className="ml-auto" />
      </span>
    </Button>
  );
}
