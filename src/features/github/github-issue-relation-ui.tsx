import { CheckCircle2, CircleAlert, CircleDot, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
      className="h-auto w-full min-w-0 justify-start gap-2 rounded-md px-2.5 py-2 text-left"
      onClick={() => onNavigate(summary)}
    >
      <StateIcon data-icon="inline-start" className="text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{summary.issue.title}</span>
        <span className="text-muted-foreground block truncate text-[10px] font-normal">
          {summary.repository.fullName} #{summary.issue.number}
        </span>
      </span>
    </Button>
  );
}

export function GitHubIssueRelationLoadError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: ReturnType<typeof parseIpcError> | null;
  onRetry: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <span>{error?.message}</span>
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" />
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
