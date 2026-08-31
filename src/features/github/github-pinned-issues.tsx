import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDot, Pin, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubRepositoryContentContext } from "./github-data";
import { repositoryPinnedIssuesQueryOptions } from "./github-issue-pin-queries";

export function GitHubPinnedIssues({
  repository,
  onSelect,
}: {
  repository: GitHubRepositoryContentContext;
  onSelect: (issueNumber: number) => void;
}) {
  const { t } = useTranslation();
  const result = useQuery(
    repositoryPinnedIssuesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    })
  );
  const error = result.error ? parseIpcError(result.error) : null;
  const errorNotice = error ? (
    <Alert variant="destructive" className="py-2.5 text-xs">
      <TriangleAlert />
      <AlertTitle>{t("workspace.repositories.pinnedIssuesLoadFailed")}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">{error.message}</span>
        <Button type="button" variant="outline" size="xs" onClick={() => void result.refetch()}>
          <RefreshCw data-icon="inline-start" />
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

  return (
    <section className="bg-muted/15 border-b px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        <Pin className="text-muted-foreground size-3.5" />
        <span>{t("workspace.repositories.pinnedIssues")}</span>
        {result.data ? (
          <span className="text-muted-foreground font-normal">{result.data.issues.length}/3</span>
        ) : null}
      </div>
      {result.data && errorNotice ? <div className="mb-2">{errorNotice}</div> : null}
      {result.isPending ? (
        <div
          className="grid grid-cols-1 gap-2 @min-[620px]/issues:grid-cols-3"
          aria-label={t("workspace.repositories.loadingPinnedIssues")}
        >
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !result.data && errorNotice ? (
        errorNotice
      ) : result.data?.issues.length ? (
        <div className="grid grid-cols-1 gap-2 @min-[620px]/issues:grid-cols-3">
          {result.data.issues.map((issue) => (
            <Button
              key={issue.nodeId}
              type="button"
              variant="outline"
              className="h-auto min-h-20 items-start justify-start gap-2 px-3 py-2.5 text-left whitespace-normal"
              onClick={() => onSelect(issue.number)}
            >
              {issue.state === "open" ? (
                <CircleDot className="text-primary mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="text-muted-foreground mt-0.5 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="line-clamp-2 block text-xs leading-5 font-medium">
                  {issue.title}
                </span>
                <span className="text-muted-foreground mt-1 block text-[10px] font-normal">
                  #{issue.number} ·{" "}
                  {t("workspace.repositories.pinnedBy", { actor: issue.pinnedBy })}
                </span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <Empty className="min-h-0 gap-1 px-3 py-2.5 md:p-3">
          <EmptyHeader className="gap-0.5">
            <EmptyTitle className="text-xs">
              {t("workspace.repositories.noPinnedIssues")}
            </EmptyTitle>
            <EmptyDescription className="text-[11px]">
              {t("workspace.repositories.noPinnedIssuesDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
