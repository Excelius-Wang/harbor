import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListFilter, PlayCircle, RefreshCw, Workflow as WorkflowIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { workflowStateLabel } from "./github-actions-mutations";
import type { GitHubRepository, GitHubWorkflow } from "./github-data";
import { repositoryWorkflowsQueryOptions } from "./github-queries";

const ALL_WORKFLOWS_VALUE = "all";

function WorkflowLabel({ workflow }: { workflow: GitHubWorkflow }) {
  const { t } = useTranslation();
  const stateLabel = workflowStateLabel(workflow.state);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
      <span className="min-w-0 flex-1 truncate">{workflow.name}</span>
      {stateLabel ? (
        <Badge variant="outline" className="shrink-0">
          {t(stateLabel)}
        </Badge>
      ) : null}
    </span>
  );
}

function WorkflowNavigationSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function GitHubActionsWorkflowNavigation({
  repository,
  selectedWorkflowId,
  onSelect,
}: {
  repository: GitHubRepository;
  selectedWorkflowId: number | null;
  onSelect: (workflow: GitHubWorkflow | null) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const result = useQuery(
    repositoryWorkflowsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    })
  );
  const workflows = result.data ?? [];
  const visibleWorkflows = useMemo(() => {
    const normalizedFilter = filter.trim().toLocaleLowerCase();
    if (!normalizedFilter) return workflows;
    return workflows.filter((workflow) =>
      workflow.name.toLocaleLowerCase().includes(normalizedFilter)
    );
  }, [filter, workflows]);
  const error = result.error ? parseIpcError(result.error) : null;
  const selectedValue =
    selectedWorkflowId === null ? ALL_WORKFLOWS_VALUE : String(selectedWorkflowId);

  useEffect(() => {
    setFilter("");
  }, [repository.id]);

  function selectValue(value: string) {
    onSelect(
      value === ALL_WORKFLOWS_VALUE
        ? null
        : (workflows.find((workflow) => workflow.id === Number(value)) ?? null)
    );
  }

  return (
    <>
      <aside
        className="flex min-h-0 min-w-0 flex-col border-r @max-[760px]/actions:hidden"
        aria-label={t("workspace.repositories.workflowNavigation")}
      >
        <div className="flex flex-col gap-2 border-b p-3">
          <span className="text-muted-foreground text-[11px] font-medium">
            {t("workspace.repositories.workflows")}
          </span>
          <Field>
            <FieldLabel htmlFor="workflow-navigation-filter" className="sr-only">
              {t("workspace.repositories.filterWorkflows")}
            </FieldLabel>
            <Input
              id="workflow-navigation-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("workspace.repositories.filterWorkflows")}
              className="h-8"
            />
          </Field>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {result.isPending ? <WorkflowNavigationSkeleton /> : null}
          {error ? (
            <Alert variant="destructive" className="m-2">
              <AlertTitle>{t("workspace.repositories.workflowsLoadFailed")}</AlertTitle>
              <AlertDescription>
                <span>{error.message}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void result.refetch()}
                >
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {!result.isPending && !error ? (
            <div className="flex flex-col gap-1 p-2">
              <Button
                type="button"
                variant={selectedWorkflowId === null ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start px-2"
                aria-current={selectedWorkflowId === null ? "page" : undefined}
                onClick={() => onSelect(null)}
              >
                <ListFilter data-icon="inline-start" />
                <span className="truncate">{t("workspace.repositories.allWorkflows")}</span>
              </Button>
              {visibleWorkflows.map((workflow) => (
                <Button
                  key={workflow.id}
                  type="button"
                  variant={selectedWorkflowId === workflow.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-auto min-h-8 w-full justify-start px-2"
                  aria-current={selectedWorkflowId === workflow.id ? "page" : undefined}
                  onClick={() => onSelect(workflow)}
                >
                  <WorkflowIcon data-icon="inline-start" />
                  <WorkflowLabel workflow={workflow} />
                </Button>
              ))}
              {workflows.length === 0 ? (
                <Empty className="px-2 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PlayCircle />
                    </EmptyMedia>
                    <EmptyTitle>{t("workspace.repositories.noWorkflows")}</EmptyTitle>
                    <EmptyDescription>
                      {t("workspace.repositories.noWorkflowsDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : visibleWorkflows.length === 0 ? (
                <p className="text-muted-foreground px-2 py-6 text-center text-xs">
                  {t("workspace.repositories.noFilteredWorkflows")}
                </p>
              ) : null}
            </div>
          ) : null}
        </ScrollArea>
      </aside>

      <div className="hidden min-w-0 items-center gap-2 border-b px-4 py-2 @max-[760px]/actions:flex">
        <Select
          value={selectedValue}
          onValueChange={selectValue}
          disabled={result.isPending || Boolean(error)}
        >
          <SelectTrigger
            size="sm"
            className="min-w-0 flex-1"
            aria-label={t("workspace.repositories.selectWorkflow")}
          >
            <SelectValue placeholder={t("workspace.repositories.selectWorkflow")} />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              <SelectItem value={ALL_WORKFLOWS_VALUE}>
                <ListFilter />
                {t("workspace.repositories.allWorkflows")}
              </SelectItem>
              {workflows.map((workflow) => (
                <SelectItem key={workflow.id} value={String(workflow.id)}>
                  <WorkflowIcon />
                  <WorkflowLabel workflow={workflow} />
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {error ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("workspace.repositories.retry")}
            onClick={() => void result.refetch()}
          >
            <RefreshCw />
          </Button>
        ) : null}
      </div>
    </>
  );
}
