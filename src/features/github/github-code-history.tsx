import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitCommitHorizontal, RefreshCw } from "lucide-react";
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
import { GitHubCommitList } from "./github-commit-list";
import type { GitHubRepository } from "./github-data";
import { GitHubPagination } from "./github-issue-shared";
import { repositoryCommitsQueryOptions } from "./github-queries";

export function GitHubCodeHistory({
  repository,
  reference,
  path,
  onBack,
}: {
  repository: GitHubRepository;
  reference: string;
  path: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const result = useQuery({
    ...repositoryCommitsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      reference,
      path,
      page,
    }),
    placeholderData: (previous) => previous,
  });
  const data = result.data;
  const error = !data && result.error ? parseIpcError(result.error) : null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("workspace.repositories.backToCode")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            {path
              ? t("workspace.repositories.fileHistory", { path })
              : t("workspace.repositories.commitHistory")}
          </h3>
          <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
            {t("workspace.repositories.historyReference", { reference })}
          </p>
        </div>
      </header>

      {result.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitCommitHorizontal />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.historyLoadFailed")}</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : data?.commits.length ? (
        <GitHubCommitList commits={data.commits} />
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitCommitHorizontal />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.noCommitHistory")}</EmptyTitle>
            <EmptyDescription>
              {path
                ? t("workspace.repositories.noFileHistoryDescription")
                : t("workspace.repositories.noCommitHistoryDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {data ? (
        <GitHubPagination
          page={data.page}
          hasPrevious={data.hasPrevious}
          hasMore={data.hasMore}
          onPageChange={setPage}
          ariaLabel={t("workspace.repositories.commitHistoryPagination")}
        />
      ) : null}
    </section>
  );
}
