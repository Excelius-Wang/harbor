import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  BookOpenText,
  Box,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  GitBranch,
  GitBranchMinus,
  GitBranchPlus,
  GitCommitHorizontal,
  History,
  LockKeyhole,
  RefreshCw,
  Search,
  Tag,
  Tags,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import {
  GitHubCodeCreateBranchDialog,
  GitHubCodeDeleteBranchDialog,
} from "./github-code-branch-dialogs";
import { GitHubCodeDeleteFileDialog } from "./github-code-delete-file-dialog";
import { GitHubCodeFileDialog } from "./github-code-file-dialog";
import {
  refreshRepositoryAfterCodeMutation,
  syncCreatedRepositoryBranch,
  syncDeletedRepositoryBranch,
  syncRepositoryFileCommit,
} from "./github-code-mutations";
import { GitHubCodeHistory } from "./github-code-history";
import { GitHubCodeSearch } from "./github-code-search";
import { GitHubCodeTags } from "./github-code-tags";
import type {
  GitHubCodeSearchResult,
  GitHubBranch,
  GitHubContentEntry,
  GitHubFileDownloadResult,
  GitHubRepository,
  GitHubRepositoryFileCommit,
} from "./github-data";
import { GitHubFileBlame } from "./github-file-blame";
import { GitHubFilePreviewPanel, GitHubFilePreviewSkeleton } from "./github-file-preview";
import { formatBytes } from "./github-format";
import {
  repositoryCodeQueryOptions,
  repositoryContentsQueryOptions,
  repositoryFileQueryOptions,
} from "./github-queries";

const GitHubReadme = lazy(() => import("./github-readme"));

type CodeSurface = "browser" | "file" | "history" | "tags" | "search" | "blame";

function CodeSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
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

export function GitHubCodeView({
  repository,
  initialReference = repository.defaultBranch,
  initialPath,
  backLabel,
  onBack,
}: {
  repository: GitHubRepository;
  initialReference?: string;
  initialPath?: string;
  backLabel?: string;
  onBack?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [reference, setReference] = useState(initialReference);
  const [path, setPath] = useState(() => initialPath?.split("/").slice(0, -1).join("/") ?? "");
  const [selectedFile, setSelectedFile] = useState<GitHubContentEntry | null>(() =>
    initialPath
      ? (() => {
          const segments = initialPath.split("/");
          return {
            name: segments[segments.length - 1] ?? initialPath,
            path: initialPath,
            sha: "",
            kind: "file",
            size: 0,
          };
        })()
      : null
  );
  const [surface, setSurface] = useState<CodeSurface>(initialPath ? "file" : "browser");
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [deleteFileDialogOpen, setDeleteFileDialogOpen] = useState(false);
  const [createBranchDialogOpen, setCreateBranchDialogOpen] = useState(false);
  const [deleteBranchDialogOpen, setDeleteBranchDialogOpen] = useState(false);
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
  const breadcrumbSegments = useMemo(() => path.split("/").filter(Boolean), [path]);
  const tagOptions = useMemo(() => {
    const branchNames = new Set((overview?.branches ?? []).map((branch) => branch.name));
    return (overview?.tags ?? []).filter((tag) => !branchNames.has(tag.name));
  }, [overview]);
  const detachedReference =
    !(overview?.branches ?? []).some((branch) => branch.name === reference) &&
    !tagOptions.some((tag) => tag.name === reference);
  const latestCommit = overview?.commits[0];
  const activeBranch = overview?.branches.find((branch) => branch.name === reference) ?? null;
  const emptyRepository = Boolean(overview && overview.branches.length === 0);
  const canWrite = Boolean(
    overview?.canWrite && !overview.isArchived && (activeBranch || emptyRepository)
  );
  const activeError =
    overviewError ??
    (surface === "file" || surface === "blame"
      ? fileError
      : surface === "browser" && !emptyRepository
        ? contentsError
        : null);

  const downloadMutation = useMutation({
    mutationFn: (filePath: string) =>
      invoke<GitHubFileDownloadResult>("github_download_repository_file", {
        owner: repository.owner,
        repository: repository.name,
        reference,
        path: filePath,
      }),
    onSuccess: (result) => {
      if (result.saved) {
        toast.success(t("workspace.repositories.downloadComplete"), {
          description: result.path ?? undefined,
        });
      }
    },
    onError: (error) => {
      toast.error(t("workspace.repositories.downloadFailed"), {
        description: parseIpcError(error).message,
      });
    },
  });

  const selectBranch = (nextReference: string) => {
    setPath("");
    setSelectedFile(null);
    setReference(nextReference);
    setSurface("browser");
  };

  const navigateToPath = (nextPath: string) => {
    setSelectedFile(null);
    setPath(nextPath);
    setSurface("browser");
  };

  const openEntry = (entry: GitHubContentEntry) => {
    if (entry.kind === "dir") {
      navigateToPath(entry.path);
      return;
    }
    if (entry.kind === "file") {
      setSelectedFile(entry);
      setSurface("file");
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

  const openSearchResult = (result: GitHubCodeSearchResult) => {
    const segments = result.path.split("/");
    const name = segments.pop() ?? result.name;
    setReference(repository.defaultBranch);
    setPath(segments.join("/"));
    setSelectedFile({
      name,
      path: result.path,
      sha: result.sha,
      kind: "file",
      size: 0,
      url: result.url,
    });
    setSurface("file");
  };

  const handleFileCommitted = (commit: GitHubRepositoryFileCommit) => {
    const mutationTarget = { owner: repository.owner, repository: repository.name };
    syncRepositoryFileCommit(queryClient, mutationTarget, commit);
    setFileDialogOpen(false);
    setDeleteFileDialogOpen(false);
    setReference(commit.branch);
    if (commit.file) {
      setPath(commit.file.path.split("/").slice(0, -1).join("/"));
      setSelectedFile(commit.file);
      setSurface("file");
    } else {
      const previousPath = commit.previousPath ?? "";
      setPath(previousPath.split("/").slice(0, -1).join("/"));
      setSelectedFile(null);
      setSurface("browser");
    }
    toast.success(t("workspace.repositories.repositoryFileCommitted"), {
      description: t("workspace.repositories.repositoryFileCommittedDescription", {
        branch: commit.branch,
        sha: commit.shortSha,
      }),
    });
    void refreshRepositoryAfterCodeMutation(queryClient, mutationTarget);
  };

  const handleBranchCreated = (branch: GitHubBranch) => {
    const mutationTarget = { owner: repository.owner, repository: repository.name };
    syncCreatedRepositoryBranch(queryClient, mutationTarget, branch);
    setCreateBranchDialogOpen(false);
    selectBranch(branch.name);
    toast.success(t("workspace.repositories.branchCreated"), {
      description: t("workspace.repositories.branchCreatedDescription", {
        branch: branch.name,
        sha: branch.sha.slice(0, 7),
      }),
    });
    void refreshRepositoryAfterCodeMutation(queryClient, mutationTarget);
  };

  const handleBranchDeleted = () => {
    if (!activeBranch) return;
    const mutationTarget = { owner: repository.owner, repository: repository.name };
    const deletedBranch = activeBranch.name;
    syncDeletedRepositoryBranch(queryClient, mutationTarget, deletedBranch);
    setDeleteBranchDialogOpen(false);
    selectBranch(repository.defaultBranch);
    toast.success(t("workspace.repositories.branchDeleted"), {
      description: deletedBranch,
    });
    void refreshRepositoryAfterCodeMutation(queryClient, mutationTarget);
  };

  if (overviewLoading && !overview && contentsLoading && !listing) return <CodeSkeleton />;

  return (
    <ScrollArea className="min-h-0 min-w-0 flex-1" constrainContentWidth>
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={backLabel ?? t("workspace.history.back")}
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <Select value={reference} onValueChange={selectBranch}>
            <SelectTrigger size="sm" className="min-w-40 bg-white/[0.025] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="harbor-popover">
              {detachedReference ? (
                <>
                  <SelectGroup>
                    <SelectLabel>{t("workspace.notifications.kinds.commit")}</SelectLabel>
                    <SelectItem value={reference}>
                      <GitCommitHorizontal />
                      {reference.slice(0, 12)}
                    </SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                </>
              ) : null}
              <SelectGroup>
                <SelectLabel>{t("workspace.repositories.branches")}</SelectLabel>
                {(overview?.branches ?? []).map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    <GitBranch />
                    {branch.name}
                    {branch.protected ? <LockKeyhole className="ml-auto size-3" /> : null}
                  </SelectItem>
                ))}
              </SelectGroup>
              {tagOptions.length ? (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{t("workspace.repositories.tags")}</SelectLabel>
                    {tagOptions.map((tag) => (
                      <SelectItem key={tag.name} value={tag.name}>
                        <Tag />
                        {tag.name}
                      </SelectItem>
                    ))}
                    {overview?.tagsHaveMore ? (
                      <SelectItem value="__harbor_more_tags" disabled>
                        {t("workspace.repositories.moreTagsAvailable")}
                      </SelectItem>
                    ) : null}
                  </SelectGroup>
                </>
              ) : null}
            </SelectContent>
          </Select>

          {overview?.canWrite && !overview.isArchived ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("workspace.repositories.manageBranches")}
                >
                  <GitBranch />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!overview.branches.length}
                    onSelect={() => setCreateBranchDialogOpen(true)}
                  >
                    <GitBranchPlus />
                    {t("workspace.repositories.createBranch")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!activeBranch || activeBranch.name === repository.defaultBranch}
                    onSelect={() => setDeleteBranchDialogOpen(true)}
                  >
                    <GitBranchMinus />
                    {t("workspace.repositories.deleteBranch")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

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

          <Button type="button" variant="outline" size="sm" onClick={() => setSurface("history")}>
            <History data-icon="inline-start" />
            {t("workspace.repositories.history")}
          </Button>
          {surface === "browser" && canWrite ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFileDialogOpen(true)}
            >
              <FilePlus2 data-icon="inline-start" />
              {t("workspace.repositories.createRepositoryFile")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setSurface("tags")}>
            <Tags data-icon="inline-start" />
            {t("workspace.repositories.tags")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSurface("search")}>
            <Search data-icon="inline-start" />
            {t("workspace.repositories.searchAction")}
          </Button>

          {surface === "browser" || surface === "file" || surface === "blame" ? (
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
          ) : null}
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
        ) : surface === "history" ? (
          <GitHubCodeHistory
            key={`${reference}:${selectedFile?.path ?? path}`}
            repository={repository}
            reference={reference}
            path={selectedFile?.path ?? path}
            onBack={() => setSurface(selectedFile ? "file" : "browser")}
          />
        ) : surface === "tags" ? (
          <GitHubCodeTags
            repository={repository}
            onBack={() => setSurface("browser")}
            onSelectTag={selectBranch}
          />
        ) : surface === "search" ? (
          <GitHubCodeSearch
            repository={repository}
            onBack={() => setSurface("browser")}
            onOpenResult={openSearchResult}
          />
        ) : surface === "blame" && filePreview?.kind === "text" ? (
          <GitHubFileBlame
            repository={repository}
            reference={reference}
            preview={filePreview}
            onBack={() => setSurface("file")}
          />
        ) : selectedFile ? (
          fileLoading && !filePreview ? (
            <GitHubFilePreviewSkeleton />
          ) : filePreview ? (
            <GitHubFilePreviewPanel
              preview={filePreview}
              sizeLabel={formatBytes(filePreview.size, i18n.language)}
              externalUrl={selectedFileUrl}
              onBack={() => {
                setSelectedFile(null);
                setSurface("browser");
              }}
              onOpenExternal={(url) => void openExternalUrl(url)}
              onShowBlame={() => setSurface("blame")}
              onEdit={() => setFileDialogOpen(true)}
              onDelete={() => setDeleteFileDialogOpen(true)}
              onDownload={() => downloadMutation.mutate(selectedFile.path)}
              downloading={downloadMutation.isPending}
              canWrite={canWrite}
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
                <article className="harbor-markdown mx-auto w-full max-w-[960px] px-5 py-6 sm:px-7">
                  <Suspense
                    fallback={
                      <div className="flex flex-col gap-3 py-2">
                        <Skeleton className="mx-auto h-8 w-48" />
                        <Skeleton className="mx-auto h-3 w-64 max-w-full" />
                        <Skeleton className="mt-4 h-4 w-1/3" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    }
                  >
                    <GitHubReadme
                      content={overview.readme.content}
                      path={overview.readme.path}
                      reference={reference}
                      repository={repository}
                      onOpenExternal={(url) => void openExternalUrl(url)}
                    />
                  </Suspense>
                </article>
              </section>
            ) : null}
          </>
        )}

        {overview?.branches.length ? (
          <GitHubCodeCreateBranchDialog
            open={createBranchDialogOpen}
            repository={repository}
            branches={overview.branches}
            initialSource={activeBranch?.name ?? repository.defaultBranch}
            onOpenChange={setCreateBranchDialogOpen}
            onCreated={handleBranchCreated}
          />
        ) : null}
        {activeBranch && activeBranch.name !== repository.defaultBranch ? (
          <GitHubCodeDeleteBranchDialog
            open={deleteBranchDialogOpen}
            repository={repository}
            branch={activeBranch}
            onOpenChange={setDeleteBranchDialogOpen}
            onDeleted={handleBranchDeleted}
          />
        ) : null}
        {canWrite ? (
          <GitHubCodeFileDialog
            open={fileDialogOpen}
            repository={repository}
            branch={activeBranch?.name ?? repository.defaultBranch}
            directory={path}
            initialPath={
              selectedFile && surface === "file" && filePreview?.kind === "text"
                ? filePreview.path
                : undefined
            }
            initialSha={
              selectedFile && surface === "file" && filePreview?.kind === "text"
                ? filePreview.sha
                : undefined
            }
            initialContent={
              selectedFile && surface === "file" && filePreview?.kind === "text"
                ? filePreview.content
                : undefined
            }
            onOpenChange={setFileDialogOpen}
            onCommitted={handleFileCommitted}
          />
        ) : null}
        {activeBranch && filePreview ? (
          <GitHubCodeDeleteFileDialog
            open={deleteFileDialogOpen}
            repository={repository}
            branch={activeBranch.name}
            preview={filePreview}
            onOpenChange={setDeleteFileDialogOpen}
            onCommitted={handleFileCommitted}
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}
