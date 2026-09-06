import { CircleAlert, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";

export function GitHubPullRequestFilesErrorAlert({
  title,
  message,
  actionLabel,
  onAction,
  stale = false,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  stale?: boolean;
}) {
  if (stale) return <WorkspaceStaleNotice message={message} onRetry={onAction} />;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        <Button type="button" variant="outline" size="xs" onClick={onAction}>
          <RefreshCw data-icon="inline-start" />
          {actionLabel}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
