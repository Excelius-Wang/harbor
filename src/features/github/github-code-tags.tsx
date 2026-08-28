import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Download, RefreshCw, Tags } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { openExternalUrl } from "@/lib/window";
import type { GitHubRepository } from "./github-data";
import { GitHubPagination } from "./github-issue-shared";
import { repositoryTagsQueryOptions } from "./github-queries";

export function GitHubCodeTags({
  repository,
  onBack,
  onSelectTag,
}: {
  repository: GitHubRepository;
  onBack: () => void;
  onSelectTag: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const result = useQuery({
    ...repositoryTagsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      page,
    }),
    placeholderData: (previous) => previous,
  });
  const data = result.data;
  const error = !data && result.error ? parseIpcError(result.error) : null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("workspace.repositories.backToCode")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div>
          <h3 className="text-sm font-semibold">{t("workspace.repositories.tags")}</h3>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            {t("workspace.repositories.tagsDescription")}
          </p>
        </div>
      </header>

      {result.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Tags />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.tagsLoadFailed")}</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : data?.tags.length ? (
        <div className="overflow-hidden rounded-lg border">
          {data.tags.map((tag) => (
            <article
              key={`${tag.name}:${tag.sha}`}
              className="hover:bg-accent/30 flex min-w-0 items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
            >
              <Tags className="text-primary shrink-0" />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onSelectTag(tag.name)}
              >
                <span className="block truncate text-xs font-medium">{tag.name}</span>
                <code className="text-muted-foreground mt-0.5 block text-[10px]">
                  {tag.sha.slice(0, 7)}
                </code>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="xs">
                    <Download data-icon="inline-start" />
                    {t("workspace.repositories.archive")}
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => void openExternalUrl(tag.zipballUrl)}>
                      {t("workspace.repositories.downloadZip")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void openExternalUrl(tag.tarballUrl)}>
                      {t("workspace.repositories.downloadTarGz")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </article>
          ))}
        </div>
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Tags />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.noTags")}</EmptyTitle>
            <EmptyDescription>{t("workspace.repositories.noTagsDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {data ? (
        <GitHubPagination
          page={data.page}
          hasPrevious={data.hasPrevious}
          hasMore={data.hasMore}
          onPageChange={setPage}
          ariaLabel={t("workspace.repositories.tagPagination")}
        />
      ) : null}
    </section>
  );
}
