import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleX, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/hooks/use-app-translation";
import type { GitHubIssueCloseReason, GitHubIssueState } from "./github-data";
import type { GitHubIssueStateChoice } from "./github-issue-mutations";

export function GitHubIssueStateAction({
  state,
  pending,
  loading = false,
  disabled = false,
  onChange,
}: {
  state: GitHubIssueState;
  pending: boolean;
  loading?: boolean;
  disabled?: boolean;
  onChange: (choice: GitHubIssueStateChoice) => void;
}) {
  const { t } = useAppTranslation();
  const [closeReason, setCloseReason] = useState<GitHubIssueCloseReason>("completed");

  useEffect(() => {
    if (state === "open") setCloseReason("completed");
  }, [state]);

  if (state === "closed") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || loading || disabled}
        onClick={() => onChange({ desiredState: "open", closeReason: null })}
        aria-busy={pending || loading}
      >
        {pending || loading ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <RotateCcw data-icon="inline-start" />
        )}
        {t(
          pending
            ? "workspace.repositories.reopeningIssue"
            : loading
              ? "workspace.repositories.loadingIssueActions"
              : "workspace.repositories.reopenIssue"
        )}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("workspace.repositories.closeIssue")}
      aria-busy={pending || loading}
      aria-live="polite"
      className="flex"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-r-none border-r-0"
        disabled={pending || loading || disabled}
        onClick={() => onChange({ desiredState: "closed", closeReason })}
      >
        {pending || loading ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <CircleX data-icon="inline-start" />
        )}
        {t(
          pending
            ? "workspace.repositories.closingIssue"
            : loading
              ? "workspace.repositories.loadingIssueActions"
              : closeReason === "completed"
                ? "workspace.repositories.closeIssueAsCompleted"
                : "workspace.repositories.closeIssueAsNotPlanned"
        )}
      </Button>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-l-none"
                disabled={pending || loading || disabled}
                aria-label={t("workspace.repositories.chooseIssueCloseReason")}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.repositories.chooseIssueCloseReason")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem className="items-start" onSelect={() => setCloseReason("completed")}>
            <Check className={closeReason === "completed" ? "opacity-100" : "opacity-0"} />
            <span className="flex flex-col gap-0.5">
              <span>{t("workspace.repositories.closeIssueAsCompleted")}</span>
              <span className="text-muted-foreground text-xs font-normal">
                {t("workspace.repositories.closeIssueCompletedDescription")}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem className="items-start" onSelect={() => setCloseReason("notPlanned")}>
            <Check className={closeReason === "notPlanned" ? "opacity-100" : "opacity-0"} />
            <span className="flex flex-col gap-0.5">
              <span>{t("workspace.repositories.closeIssueAsNotPlanned")}</span>
              <span className="text-muted-foreground text-xs font-normal">
                {t("workspace.repositories.closeIssueNotPlannedDescription")}
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
