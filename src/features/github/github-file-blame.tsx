import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, ListTree, RefreshCw } from "lucide-react";
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
import type { GitHubBlameRange, GitHubFilePreview, GitHubRepository } from "./github-data";
import { formatIssueDate } from "./github-issue-shared";
import { repositoryBlameQueryOptions } from "./github-queries";
import { GitHubSourceTokens, useGitHubSourceLines } from "./github-source-code";

export function GitHubFileBlame({
  repository,
  reference,
  preview,
  onBack,
  onSelectCommit,
}: {
  repository: GitHubRepository;
  reference: string;
  preview: Extract<GitHubFilePreview, { kind: "text" }>;
  onBack: () => void;
  onSelectCommit: (sha: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const result = useQuery(
    repositoryBlameQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      reference,
      path: preview.path,
    })
  );
  const lines = useGitHubSourceLines({
    content: preview.content,
    fileName: preview.name,
    size: preview.size,
  });
  const lineRanges = useMemo(() => {
    const ranges = result.data?.ranges ?? [];
    let rangeIndex = 0;
    return lines.map((_, index) => {
      const lineNumber = index + 1;
      while (ranges[rangeIndex] && ranges[rangeIndex].endingLine < lineNumber) rangeIndex += 1;
      const range = ranges[rangeIndex];
      return range && range.startingLine <= lineNumber && range.endingLine >= lineNumber
        ? range
        : null;
    });
  }, [lines, result.data]);
  const error = !result.data && result.error ? parseIpcError(result.error) : null;

  return (
    <section className="bg-muted/10 overflow-hidden rounded-lg border">
      <header className="flex min-h-12 items-center gap-2 border-b px-2.5 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("workspace.repositories.backToFile")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <ListTree className="text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-semibold">
            {t("workspace.repositories.blameFor", { path: preview.path })}
          </h3>
          <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
            {t("workspace.repositories.historyReference", { reference })}
          </p>
        </div>
      </header>

      {result.isPending ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 14 }, (_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      ) : error ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTree />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.blameLoadFailed")}</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : result.data?.ranges.length ? (
        <div
          role="table"
          aria-label={t("workspace.repositories.blameFor", { path: preview.path })}
          className="overflow-x-auto py-2 font-mono text-[11px] leading-5"
        >
          {lines.map((tokens, index) => {
            const range = lineRanges[index];
            const startsRange = range?.startingLine === index + 1;
            return (
              <div
                key={index}
                role="row"
                className="hover:bg-primary/[0.025] grid min-w-[860px] grid-cols-[15rem_3.75rem_minmax(max-content,1fr)]"
              >
                <span role="cell" className="border-r px-2 text-[10px] leading-5 whitespace-nowrap">
                  {startsRange && range ? (
                    <BlameAttribution
                      range={range}
                      locale={i18n.language}
                      onSelectCommit={onSelectCommit}
                    />
                  ) : null}
                </span>
                <span
                  role="rowheader"
                  className="text-muted-foreground/55 border-r pr-3 text-right tabular-nums select-none"
                >
                  {index + 1}
                </span>
                <code role="cell" className="px-4 whitespace-pre [tab-size:2]">
                  <GitHubSourceTokens tokens={tokens} />
                </code>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTree />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.noBlameData")}</EmptyTitle>
            <EmptyDescription>
              {t("workspace.repositories.noBlameDataDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

function BlameAttribution({
  range,
  locale,
  onSelectCommit,
}: {
  range: GitHubBlameRange;
  locale: string;
  onSelectCommit: (sha: string) => void;
}) {
  const { t } = useTranslation();
  const author = range.commit.authorLogin
    ? `@${range.commit.authorLogin}`
    : (range.commit.author ?? t("workspace.repositories.unknownAuthor"));

  return (
    <span className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        className="text-foreground/85 min-w-0 truncate text-left hover:underline"
        title={range.commit.title}
        onClick={() => onSelectCommit(range.commit.sha)}
      >
        {author}
      </button>
      <span className="text-muted-foreground shrink-0">
        {range.commit.committedAt ? formatIssueDate(range.commit.committedAt, locale) : null}
      </span>
      <ChevronRight className="text-muted-foreground shrink-0" />
    </span>
  );
}
