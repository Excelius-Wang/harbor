import { CircleAlert, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import type {
  GitHubPullRequestFile,
  GitHubPullRequestFileViewedState,
  GitHubPullRequestFileViewStateSnapshot,
} from "./github-data";

export function getPullRequestFileViewPresentation(state: GitHubPullRequestFileViewedState) {
  return {
    checked: state === "viewed",
    changedSinceViewed: state === "dismissed",
  };
}

export function hasUnmatchedPullRequestFileViewStates(
  files: Array<Pick<GitHubPullRequestFile, "path">>,
  snapshot: GitHubPullRequestFileViewStateSnapshot | undefined
) {
  if (!snapshot) return false;
  const statePaths = new Set(snapshot.files.map((file) => file.path));
  return files.some((file) => !statePaths.has(file.path));
}

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

export function GitHubPullRequestFileViewCheckbox({
  state,
  pending,
  disabled = false,
  onChange,
}: {
  state: GitHubPullRequestFileViewedState;
  pending: boolean;
  disabled?: boolean;
  onChange: (viewed: boolean) => void;
}) {
  const { t } = useAppTranslation();
  const presentation = getPullRequestFileViewPresentation(state);
  const unavailable = disabled || pending;

  return (
    <label
      data-file-view-state={state}
      data-disabled={unavailable || undefined}
      className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-[10px] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-60"
    >
      <Checkbox
        checked={presentation.checked}
        disabled={unavailable}
        aria-label={t(
          presentation.checked
            ? "workspace.repositories.markFileUnviewed"
            : "workspace.repositories.markFileViewed"
        )}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      <span>{t("workspace.repositories.fileViewed")}</span>
      {presentation.changedSinceViewed ? (
        <span className="text-warning">{t("workspace.repositories.fileChangedSinceViewed")}</span>
      ) : null}
      {pending ? <Spinner className="size-3" aria-hidden /> : null}
    </label>
  );
}
