import { CheckCircle2, CircleAlert, CircleDot, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssueSummary } from "./github-data";

export function GitHubIssueRelatedIssueRow({
  summary,
  onNavigate,
}: {
  summary: GitHubIssueSummary;
  onNavigate: (summary: GitHubIssueSummary) => void;
}) {
  const StateIcon = summary.issue.state === "open" ? CircleDot : CheckCircle2;
  return (
    <Button
      type="button"
      variant="ghost"
      className="harbor-result-row h-auto w-full min-w-0 shrink justify-start gap-2 rounded-md px-2.5 py-2 text-left whitespace-normal"
      onClick={() => onNavigate(summary)}
    >
      <StateIcon data-icon="inline-start" className="text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium break-words">{summary.issue.title}</span>
        <span className="text-muted-foreground block truncate text-[11px] font-normal">
          {summary.repository.fullName} #{summary.issue.number}
        </span>
      </span>
    </Button>
  );
}

export function GitHubIssueRelationLoadError({
  title,
  error,
  message,
  stale = false,
  onRetry,
}: {
  title: string;
  error: ReturnType<typeof parseIpcError> | null;
  message?: string;
  stale?: boolean;
  onRetry: () => void;
}) {
  const { t } = useAppTranslation();
  if (stale) {
    return <WorkspaceStaleNotice message={message ?? error?.message ?? title} onRetry={onRetry} />;
  }
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <span>{message ?? error?.message}</span>
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" />
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
