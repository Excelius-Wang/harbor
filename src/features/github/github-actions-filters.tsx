import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubRepository,
  GitHubWorkflowRunFilters,
  GitHubWorkflowRunStatusFilter,
} from "./github-data";
import { repositoryWorkflowRunFilterOptionsQueryOptions } from "./github-queries";

const ALL_FILTER_VALUE = "harbor:all";

const WORKFLOW_STATUS_FILTERS: GitHubWorkflowRunStatusFilter[] = [
  "all",
  "queued",
  "inProgress",
  "completed",
  "success",
  "failure",
  "cancelled",
];

function orderedValues(values: string[], selected: string, preferred?: string) {
  const result = new Set(values);
  if (selected) result.add(selected);
  return [...result].sort((left, right) => {
    if (left === preferred) return -1;
    if (right === preferred) return 1;
    return left.localeCompare(right);
  });
}

function WorkflowRunFilterSelect({
  value,
  values,
  allLabel,
  allValue = "",
  ariaLabel,
  loading,
  disabled,
  renderValue = (candidate) => candidate,
  onValueChange,
}: {
  value: string;
  values: string[];
  allLabel: string;
  allValue?: string;
  ariaLabel: string;
  loading: boolean;
  disabled: boolean;
  renderValue?: (value: string) => string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select
      value={value === allValue ? ALL_FILTER_VALUE : value}
      onValueChange={(nextValue) =>
        onValueChange(nextValue === ALL_FILTER_VALUE ? allValue : nextValue)
      }
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className="w-full min-w-0"
        aria-label={ariaLabel}
        aria-busy={loading}
      >
        <SelectValue />
        {loading ? <Spinner aria-hidden="true" /> : null}
      </SelectTrigger>
      <SelectContent position="popper" className="max-w-[calc(100vw-2rem)]">
        <SelectGroup>
          <SelectItem value={ALL_FILTER_VALUE}>{allLabel}</SelectItem>
          {values.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              <span className="block max-w-[min(28rem,calc(100vw-5rem))] truncate">
                {renderValue(candidate)}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function filterOptionsErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.repositories.workflowPermissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.workflowRunFilterOptionsLoadFailed";
}

export function GitHubActionsRunFilters({
  repository,
  workflowId,
  value,
  onValueChange,
}: {
  repository: GitHubRepository;
  workflowId: number | null;
  value: GitHubWorkflowRunFilters;
  onValueChange: (value: GitHubWorkflowRunFilters) => void;
}) {
  const { t } = useTranslation();
  const result = useQuery(
    repositoryWorkflowRunFilterOptionsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      workflowId,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;
  const branches = useMemo(
    () => orderedValues(result.data?.branches ?? [], value.branch, repository.defaultBranch),
    [repository.defaultBranch, result.data?.branches, value.branch]
  );
  const events = useMemo(
    () => orderedValues(result.data?.events ?? [], value.event),
    [result.data?.events, value.event]
  );
  const actors = useMemo(
    () => orderedValues(result.data?.actors ?? [], value.actor),
    [result.data?.actors, value.actor]
  );
  const optionFiltersDisabled = result.isPending || Boolean(error);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid min-w-0 grid-cols-4 gap-2 @max-[760px]/actions:grid-cols-2 @max-[520px]/actions:grid-cols-1">
        <WorkflowRunFilterSelect
          value={value.status}
          values={WORKFLOW_STATUS_FILTERS.filter((filter) => filter !== "all")}
          allLabel={t("workspace.repositories.workflowRunFilters.all")}
          allValue="all"
          ariaLabel={t("workspace.repositories.workflowStatusFilter")}
          loading={false}
          disabled={false}
          renderValue={(filter) => t(`workspace.repositories.workflowRunFilters.${filter}`)}
          onValueChange={(status) =>
            onValueChange({ ...value, status: status as GitHubWorkflowRunStatusFilter })
          }
        />
        <WorkflowRunFilterSelect
          value={value.branch}
          values={branches}
          allLabel={t("workspace.repositories.allWorkflowBranches")}
          ariaLabel={t("workspace.repositories.workflowBranchFilter")}
          loading={result.isPending}
          disabled={optionFiltersDisabled}
          onValueChange={(branch) => onValueChange({ ...value, branch })}
        />
        <WorkflowRunFilterSelect
          value={value.event}
          values={events}
          allLabel={t("workspace.repositories.allWorkflowEvents")}
          ariaLabel={t("workspace.repositories.workflowEventFilter")}
          loading={result.isPending}
          disabled={optionFiltersDisabled}
          onValueChange={(event) => onValueChange({ ...value, event })}
        />
        <WorkflowRunFilterSelect
          value={value.actor}
          values={actors}
          allLabel={t("workspace.repositories.allWorkflowActors")}
          ariaLabel={t("workspace.repositories.workflowActorFilter")}
          loading={result.isPending}
          disabled={optionFiltersDisabled}
          renderValue={(actor) => `@${actor}`}
          onValueChange={(actor) => onValueChange({ ...value, actor })}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t(filterOptionsErrorTitle(error.code))}</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
