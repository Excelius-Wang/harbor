import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenText,
  Box,
  ChevronRight,
  ExternalLink,
  File,
  FileCode2,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  ImageIcon,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubContentEntry, GitHubRepository } from "./github-data";
import { GitHubFilePreviewPanel, GitHubFilePreviewSkeleton } from "./github-file-preview";
import {
  repositoryCodeQueryOptions,
  repositoryContentsQueryOptions,
  repositoryFileQueryOptions,
} from "./github-queries";

function formatBytes(bytes: number, locale: string) {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1_000)} KB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`;
}

function repositoryLink(
  href: string,
  repository: GitHubRepository,
  reference: string,
  readmePath: string
) {
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("#")) return href;
  const basePath = readmePath.includes("/") ? readmePath.slice(0, readmePath.lastIndexOf("/")) : "";
  const path = [basePath, href]
    .filter(Boolean)
    .join("/")
    .split("/")
    .reduce<string[]>((segments, segment) => {
      if (segment === "..") segments.pop();
      else if (segment !== "." && segment !== "") segments.push(segment);
      return segments;
    }, [])
    .map(encodeURIComponent)
    .join("/");
  return `${repository.url}/blob/${encodeURIComponent(reference)}/${path}`;
}

function CodeSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 flex-1" />
      </div>
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="flex h-10 items-center gap-3 border-b border-white/[0.055] px-3 last:border-b-0"
          >
            <Skeleton className="size-4" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

function FileRow({
  entry,
  locale,
  onOpen,
}: {
  entry: GitHubContentEntry;
  locale: string;
  onOpen: () => void;
}) {
  const isDirectory = entry.kind === "dir";
  const Icon = isDirectory
    ? Folder
    : entry.name.match(/\.(ts|tsx|rs|js|jsx|json|css|html|md)$/i)
      ? FileCode2
      : File;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      className="group hover:bg-primary/[0.045] h-10 w-full justify-start gap-2.5 rounded-none border-b border-white/[0.055] px-3 text-left last:border-b-0"
    >
      <Icon className={isDirectory ? "text-primary" : "text-muted-foreground"} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{entry.name}</span>
      {!isDirectory ? (
        <span className="text-muted-foreground text-[10px] font-normal tabular-nums">
          {formatBytes(entry.size, locale)}
        </span>
      ) : null}
      <ChevronRight className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Button>
  );
}

export function GitHubCodeView({ repository }: { repository: GitHubRepository }) {
  const { t, i18n } = useTranslation();
  const [reference, setReference] = useState(repository.defaultBranch);
  const [path, setPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<GitHubContentEntry | null>(null);
  const target = { owner: repository.owner, repository: repository.name, reference };
  const overviewResult = useQuery(repositoryCodeQueryOptions(target));
  const contentsResult = useQuery(repositoryContentsQueryOptions({ ...target, path }));
  const fileResult = useQuery({
    ...repositoryFileQueryOptions({ ...target, path: selectedFile?.path ?? "" }),
    enabled: selectedFile !== null,
  });
  const overview = overviewResult.data ?? null;
  const listing = contentsResult.data ?? null;
  const filePreview = fileResult.data ?? null;
  const overviewLoading = overviewResult.isPending;
  const contentsLoading = contentsResult.isPending;
  const fileLoading = selectedFile !== null && fileResult.isPending;
  const overviewError =
    !overview && overviewResult.error ? parseIpcError(overviewResult.error) : null;
  const contentsError =
    !listing && contentsResult.error ? parseIpcError(contentsResult.error) : null;
  const fileError =
    selectedFile && !filePreview && fileResult.error ? parseIpcError(fileResult.error) : null;
  const activeError = overviewError ?? (selectedFile ? fileError : contentsError);

  const breadcrumbSegments = useMemo(() => path.split("/").filter(Boolean), [path]);
  const latestCommit = overview?.commits[0];

  const selectBranch = (nextReference: string) => {
    setPath("");
    setSelectedFile(null);
    setReference(nextReference);
  };

  const navigateToPath = (nextPath: string) => {
    setSelectedFile(null);
    setPath(nextPath);
  };

  const openEntry = (entry: GitHubContentEntry) => {
    if (entry.kind === "dir") {
      navigateToPath(entry.path);
      return;
    }
    if (entry.kind === "file") {
      setSelectedFile(entry);
      return;
    }
    if (entry.url) void openExternalUrl(entry.url);
  };

  const selectedFileUrl = selectedFile
    ? (filePreview?.url ??
      selectedFile.url ??
      `${repository.url}/blob/${encodeURIComponent(reference)}/${selectedFile.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`)
    : repository.url;

  if (overviewLoading && !overview && contentsLoading && !listing) return <CodeSkeleton />;

  return (
    <ScrollArea className="min-h-0 min-w-0 flex-1" constrainContentWidth>
      <div className="mx-auto w-full max-w-[1040px] space-y-4 p-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={reference} onValueChange={selectBranch}>
            <SelectTrigger size="sm" className="min-w-40 bg-white/[0.025] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="harbor-popover">
              <SelectGroup>
                {(overview?.branches ?? []).map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    <GitBranch />
                    {branch.name}
                    {branch.protected ? <LockKeyhole className="ml-auto size-3" /> : null}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-white/[0.07] bg-white/[0.018] px-2.5">
            <Breadcrumb>
              <BreadcrumbList className="flex-nowrap gap-1 text-[11px] sm:gap-1">
                <BreadcrumbItem>
                  {breadcrumbSegments.length || selectedFile ? (
                    <BreadcrumbLink asChild>
                      <button
                        type="button"
                        onClick={() => navigateToPath("")}
                        className="font-medium"
                      >
                        {repository.name}
                      </button>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="font-medium">{repository.name}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {breadcrumbSegments.map((segment, index) => {
                  const segmentPath = breadcrumbSegments.slice(0, index + 1).join("/");
                  const current = index === breadcrumbSegments.length - 1 && !selectedFile;
                  return (
                    <span key={segmentPath} className="contents">
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="min-w-0">
                        {current ? (
                          <BreadcrumbPage className="max-w-44 truncate">{segment}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <button
                              type="button"
                              onClick={() => navigateToPath(segmentPath)}
                              className="max-w-32 truncate"
                            >
                              {segment}
                            </button>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </span>
                  );
                })}
                {selectedFile ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="max-w-44 truncate">
                        {selectedFile.name}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("workspace.repositories.refreshCode")}
                onClick={() => {
                  void overviewResult.refetch();
                  if (selectedFile) void fileResult.refetch();
                  else void contentsResult.refetch();
                }}
                disabled={
                  overviewResult.isFetching ||
                  (selectedFile ? fileResult.isFetching : contentsResult.isFetching)
                }
              >
                <RefreshCw
                  className={
                    overviewResult.isFetching ||
                    (selectedFile ? fileResult.isFetching : contentsResult.isFetching)
                      ? "animate-spin"
                      : ""
                  }
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("workspace.repositories.refreshCode")}</TooltipContent>
          </Tooltip>
        </div>

        {activeError ? (
          <Empty className="min-h-56 border border-white/[0.07] bg-white/[0.018]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Box />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.codeLoadFailed")}</EmptyTitle>
              <EmptyDescription>{activeError.message}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() => {
                  void overviewResult.refetch();
                  if (selectedFile) void fileResult.refetch();
                  else void contentsResult.refetch();
                }}
              >
                <RefreshCw data-icon="inline-start" />
                {t("workspace.repositories.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : selectedFile ? (
          fileLoading && !filePreview ? (
            <GitHubFilePreviewSkeleton />
          ) : filePreview ? (
            <GitHubFilePreviewPanel
              preview={filePreview}
              sizeLabel={formatBytes(filePreview.size, i18n.language)}
              externalUrl={selectedFileUrl}
              onBack={() => setSelectedFile(null)}
              onOpenExternal={(url) => void openExternalUrl(url)}
            />
          ) : null
        ) : (
          <>
            <section className="overflow-hidden rounded-lg border border-white/[0.075] bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              {latestCommit && path === "" ? (
                <button
                  type="button"
                  onClick={() => void openExternalUrl(latestCommit.url)}
                  className="group bg-primary/[0.035] flex h-11 w-full items-center gap-2.5 border-b border-white/[0.07] px-3 text-left"
                >
                  <GitCommitHorizontal className="text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {latestCommit.title}
                  </span>
                  <span className="text-muted-foreground hidden text-[10px] sm:inline">
                    {latestCommit.author ?? t("workspace.repositories.unknownAuthor")}
                  </span>
                  <code className="text-primary/80 text-[10px]">{latestCommit.shortSha}</code>
                  <ExternalLink className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ) : null}

              {contentsLoading && !listing ? (
                <CodeSkeleton />
              ) : listing?.entries.length ? (
                listing.entries.map((entry) => (
                  <FileRow
                    key={`${entry.kind}:${entry.path}`}
                    entry={entry}
                    locale={i18n.language}
                    onOpen={() => openEntry(entry)}
                  />
                ))
              ) : (
                <div className="text-muted-foreground grid h-32 place-items-center text-xs">
                  {t("workspace.repositories.emptyDirectory")}
                </div>
              )}
            </section>

            {path === "" && overview?.commits.length ? (
              <section className="overflow-hidden rounded-lg border border-white/[0.075] bg-white/[0.014]">
                <div className="flex h-10 items-center justify-between border-b border-white/[0.065] px-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <GitCommitHorizontal className="text-primary" />
                    {t("workspace.repositories.recentCommits")}
                  </div>
                  {overview.commitsHaveMore ? (
                    <span className="text-muted-foreground text-[10px]">
                      {t("workspace.repositories.latestCommitsOnly")}
                    </span>
                  ) : null}
                </div>
                <div className="divide-y divide-white/[0.055]">
                  {overview.commits.map((commit) => (
                    <button
                      key={commit.sha}
                      type="button"
                      onClick={() => void openExternalUrl(commit.url)}
                      className="group flex min-h-10 w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.025]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px]">{commit.title}</span>
                      <span className="text-muted-foreground hidden text-[10px] sm:inline">
                        {commit.author ?? t("workspace.repositories.unknownAuthor")}
                      </span>
                      <code className="text-primary/75 text-[10px]">{commit.shortSha}</code>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {path === "" && overview?.readme ? (
              <section className="overflow-hidden rounded-lg border border-white/[0.075] bg-white/[0.018]">
                <div className="flex h-11 items-center justify-between border-b border-white/[0.065] px-4">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <BookOpenText className="text-primary" />
                    {overview.readme.name}
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void openExternalUrl(overview.readme?.url ?? repository.url)}
                  >
                    <ExternalLink data-icon="inline-end" />
                    {t("workspace.repositories.viewSource")}
                  </Button>
                </div>
                <article className="harbor-markdown px-5 py-6 sm:px-7">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href = "", children }) => {
                        const destination = repositoryLink(
                          href,
                          repository,
                          reference,
                          overview.readme?.path ?? "README.md"
                        );
                        if (destination.startsWith("#"))
                          return <a href={destination}>{children}</a>;
                        return (
                          <button type="button" onClick={() => void openExternalUrl(destination)}>
                            {children}
                          </button>
                        );
                      },
                      img: ({ alt = "", src = "" }) => (
                        <button
                          type="button"
                          className="harbor-markdown-image"
                          onClick={() =>
                            void openExternalUrl(
                              repositoryLink(
                                src,
                                repository,
                                reference,
                                overview.readme?.path ?? "README.md"
                              )
                            )
                          }
                        >
                          <ImageIcon />
                          {alt || t("workspace.repositories.readmeImage")}
                        </button>
                      ),
                    }}
                  >
                    {overview.readme.content}
                  </ReactMarkdown>
                </article>
              </section>
            ) : null}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
