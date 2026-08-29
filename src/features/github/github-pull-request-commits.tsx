import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCommitHorizontal, RefreshCw } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { GitHubCommitList } from "./github-commit-list";
import { GitHubCommitDetail } from "./github-commit-detail";
import type { GitHubRepositoryIdentity } from "./github-data";
import { GitHubPagination } from "./github-issue-shared";
import { pullRequestCommitsQueryOptions } from "./github-queries";

export function GitHubPullRequestCommits({
  repository,
  pullRequestNumber,
  page,
  onPageChange,
  enabled,
}: {
  repository: GitHubRepositoryIdentity;
  pullRequestNumber: number;
  page: number;
  onPageChange: (page: number) => void;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);
  const result = useQuery({
    ...pullRequestCommitsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      pullRequestNumber,
      page,
    }),
    enabled: enabled && !selectedCommitSha,
    placeholderData: (previous) => previous,
  });
  const data = result.data;
  const error = !data && result.error ? parseIpcError(result.error) : null;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col px-4 py-5 sm:px-5">
        {selectedCommitSha ? (
          <GitHubCommitDetail
            key={selectedCommitSha}
            repository={repository}
            commitSha={selectedCommitSha}
            onBack={() => setSelectedCommitSha(null)}
            onSelectCommit={setSelectedCommitSha}
          />
        ) : result.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitCommitHorizontal />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.pullRequestCommitsLoadFailed")}</EmptyTitle>
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
          <GitHubCommitList commits={data.commits} onSelectCommit={setSelectedCommitSha} />
        ) : (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitCommitHorizontal />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.noPullRequestCommits")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {data && !selectedCommitSha ? (
          <GitHubPagination
            page={data.page}
            hasPrevious={data.hasPrevious}
            hasMore={data.hasMore}
            onPageChange={onPageChange}
            ariaLabel={t("workspace.repositories.pullRequestCommitPagination")}
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}
