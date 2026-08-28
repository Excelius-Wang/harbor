import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { executionBucket } from "./github-execution-state";
import { GitHubExecutionStatusIcon } from "./github-execution-status";
import type { GitHubWorkflowJob } from "./github-data";
import { useTranslation } from "react-i18next";

const STATUS_KEYS: Record<string, string> = {
  action_required: "actionRequired",
  cancelled: "cancelled",
  completed: "completed",
  failure: "failure",
  in_progress: "inProgress",
  neutral: "neutral",
  pending: "pending",
  queued: "queued",
  requested: "requested",
  skipped: "skipped",
  stale: "stale",
  startup_failure: "startupFailure",
  success: "success",
  timed_out: "timedOut",
  waiting: "waiting",
};

export function workflowStatusValue(status: string, conclusion?: string | null) {
  return conclusion || status;
}

export function GitHubWorkflowStatusBadge({
  status,
  conclusion,
}: {
  status: string;
  conclusion?: string | null;
}) {
  const { t } = useTranslation();
  const bucket = executionBucket(status, conclusion);
  const value = workflowStatusValue(status, conclusion);
  const statusKey = STATUS_KEYS[value];

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-md px-2 font-medium",
        bucket === "pass" && "border-success/30 bg-success/10 text-success",
        bucket === "fail" && "border-destructive/30 bg-destructive/10 text-destructive",
        bucket === "pending" && "border-primary/30 bg-primary/10 text-primary",
        bucket === "skipped" && "bg-secondary text-secondary-foreground"
      )}
    >
      <GitHubExecutionStatusIcon status={status} conclusion={conclusion} />
      {statusKey ? t(`workspace.repositories.workflowStatuses.${statusKey}`) : value}
    </Badge>
  );
}

export function workflowDuration(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder ? `${hours}h ${minuteRemainder}m` : `${hours}h`;
}

export function workflowJobHasLog(job: GitHubWorkflowJob) {
  return job.status === "completed" && job.conclusion !== "skipped";
}
