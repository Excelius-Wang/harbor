import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleX, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
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
  const { t } = useTranslation();
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
          <Spinner data-icon="inline-start" />
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
          <Spinner data-icon="inline-start" />
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
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setCloseReason("completed")}>
            <Check className={closeReason === "completed" ? "opacity-100" : "opacity-0"} />
            {t("workspace.repositories.closeIssueAsCompleted")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCloseReason("notPlanned")}>
            <Check className={closeReason === "notPlanned" ? "opacity-100" : "opacity-0"} />
            {t("workspace.repositories.closeIssueAsNotPlanned")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
