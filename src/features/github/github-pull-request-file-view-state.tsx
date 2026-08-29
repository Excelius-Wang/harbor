import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import type { GitHubPullRequestFileViewedState } from "./github-data";

export function getPullRequestFileViewPresentation(state: GitHubPullRequestFileViewedState) {
  return {
    checked: state === "viewed",
    changedSinceViewed: state === "dismissed",
  };
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
  const { t } = useTranslation();
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
