import { CircleAlert, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function GitHubPullRequestFilesErrorAlert({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
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
