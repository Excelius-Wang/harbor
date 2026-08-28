import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileSearch, RefreshCw, Search } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubCodeSearchResult, GitHubRepository } from "./github-data";
import { GitHubPagination } from "./github-issue-shared";
import { repositoryCodeSearchQueryOptions } from "./github-queries";

export function GitHubCodeSearch({
  repository,
  onBack,
  onOpenResult,
}: {
  repository: GitHubRepository;
  onBack: () => void;
  onOpenResult: (result: GitHubCodeSearchResult) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const result = useQuery({
    ...repositoryCodeSearchQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      query,
      page,
    }),
    enabled: query.length > 0,
  });
  const data = result.data;
  const error = query && !data && result.error ? parseIpcError(result.error) : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = input.trim();
    if (!nextQuery) return;
    setPage(1);
    setQuery(nextQuery);
  };

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
          <h3 className="text-sm font-semibold">{t("workspace.repositories.searchCode")}</h3>
          <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
            {t("workspace.repositories.searchDefaultBranch", {
              branch: repository.defaultBranch,
            })}
          </p>
        </div>
      </header>

      <form onSubmit={submit}>
        <FieldGroup className="gap-2">
          <Field orientation="horizontal" className="gap-2">
            <FieldLabel htmlFor="repository-code-search" className="sr-only">
              {t("workspace.repositories.searchCode")}
            </FieldLabel>
            <Input
              id="repository-code-search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("workspace.repositories.searchCodePlaceholder")}
              maxLength={256}
            />
            <Button type="submit" disabled={!input.trim()}>
              <Search data-icon="inline-start" />
              {t("workspace.repositories.searchAction")}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      {result.isFetching && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearch />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.codeSearchFailed")}</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : data?.results.length ? (
        <div className="overflow-hidden rounded-lg border">
          <div className="text-muted-foreground border-b px-3 py-2 text-[10px]">
            {t("workspace.repositories.codeSearchResultCount", { count: data.totalCount })}
            {data.incompleteResults ? ` ${t("workspace.repositories.codeSearchIncomplete")}` : ""}
          </div>
          {data.results.map((item) => (
            <button
              key={`${item.sha}:${item.path}`}
              type="button"
              onClick={() => onOpenResult(item)}
              className="hover:bg-accent/30 block w-full min-w-0 border-b px-4 py-3 text-left last:border-b-0"
            >
              <span className="text-primary block truncate font-mono text-[11px] font-medium">
                {item.path}
              </span>
              {item.fragment ? (
                <code className="text-muted-foreground mt-2 block max-h-[4.5rem] overflow-hidden text-[10px] leading-4 whitespace-pre-wrap">
                  {item.fragment}
                </code>
              ) : (
                <span className="text-muted-foreground mt-1 block text-[10px]">
                  {t("workspace.repositories.openSearchResult")}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : data ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearch />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.noCodeSearchResults")}</EmptyTitle>
            <EmptyDescription>
              {t("workspace.repositories.noCodeSearchResultsDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearch />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.searchRepositoryCode")}</EmptyTitle>
            <EmptyDescription>
              {t("workspace.repositories.searchRepositoryCodeDescription")}
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
          ariaLabel={t("workspace.repositories.codeSearchPagination")}
        />
      ) : null}
    </section>
  );
}
