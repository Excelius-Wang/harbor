import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PlayCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { GitHubActionsDetail } from "./github-actions-detail";
import type { GitHubRepository } from "./github-data";
import { repositoryWorkflowRunQueryOptions } from "./github-queries";

export function GitHubActionsRunDetail({
  repository,
  runId,
  backLabel,
  onBack,
}: {
  repository: GitHubRepository;
  runId: number;
  backLabel: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const result = useQuery(
    repositoryWorkflowRunQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      runId,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;

  if (result.data) {
    return (
      <GitHubActionsDetail
        repository={repository}
        run={result.data}
        backLabel={backLabel}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {backLabel}
        </Button>
        {result.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <Empty className="min-h-80 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PlayCircle />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.notifications.targetLoadFailed")}</EmptyTitle>
              <EmptyDescription>{error?.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void result.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </div>
  );
}
