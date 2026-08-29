import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ExternalLink,
  FilePenLine,
  FilePlus2,
  FileText,
  History,
  PanelBottom,
  PanelLeft,
  RefreshCw,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubRepository,
  GitHubWikiOverview,
  GitHubWikiPage,
  GitHubWikiPageKind,
} from "./github-data";
import { GitHubMarkdownEditor } from "./github-markdown-editor";
import GitHubReadme from "./github-readme";
import { GitHubWikiHistoryDialog } from "./github-wiki-history-dialog";
import { repositoryWikiPageQueryOptions, repositoryWikiQueryOptions } from "./github-queries";
import {
  deleteRepositoryWikiPage,
  mutateRepositoryWikiPage,
  resolveWikiPagePath,
  syncRepositoryWikiMutation,
} from "./github-wiki";

const MAX_WIKI_PAGE_BYTES = 1024 * 1024;

function WikiSkeleton() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[220px] shrink-0 flex-col gap-2 border-r p-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

function wikiPageIcon(kind: GitHubWikiPageKind) {
  if (kind === "sidebar") return PanelLeft;
  if (kind === "footer") return PanelBottom;
  return FileText;
}

function GitHubWikiEditorDialog({
  open,
  onOpenChange,
  repository,
  overview,
  page,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: GitHubRepository;
  overview: GitHubWikiOverview;
  page?: GitHubWikiPage;
  onSaved: (page: GitHubWikiPage) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(page?.title ?? "");
    setContent(page?.content ?? "");
    setMessage("");
  }, [open, page]);

  const mutation = useMutation({
    mutationFn: () =>
      mutateRepositoryWikiPage(target, {
        originalPath: page?.path,
        title: title.trim(),
        content,
        expectedHead: overview.headSha ?? "",
        expectedBlobSha: page?.blobSha,
        message: message.trim() || undefined,
      }),
    onSuccess: (result) => {
      syncRepositoryWikiMutation(queryClient, target, result, page?.path);
      if (result.page) onSaved(result.page);
      onOpenChange(false);
      toast.success(
        t(page ? "workspace.repositories.wiki.updated" : "workspace.repositories.wiki.created")
      );
    },
  });

  const normalizedTitle = title.trim();
  const titleInvalid =
    normalizedTitle.length === 0 ||
    normalizedTitle.length > 245 ||
    (!page &&
      (/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(normalizedTitle) ||
        normalizedTitle.endsWith(".") ||
        /^_(Sidebar|Footer)$/i.test(normalizedTitle)));
  const contentInvalid = new Blob([content]).size > MAX_WIKI_PAGE_BYTES;
  const messageInvalid = message.length > 256 || /[\u0000-\u001f\u007f]/.test(message);
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const relativeImageBaseUrl = `https://raw.githubusercontent.com/wiki/${repository.owner}/${repository.name}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t(
              page
                ? "workspace.repositories.wiki.editTitle"
                : "workspace.repositories.wiki.createTitle"
            )}
          </DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.wiki.editorDescription")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>
              {t(
                error.code === "githubWikiConflict"
                  ? "workspace.repositories.wiki.conflictTitle"
                  : "workspace.repositories.wiki.saveFailed"
              )}
            </AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup className="gap-5">
          <Field data-invalid={titleInvalid || undefined}>
            <FieldLabel htmlFor="wiki-page-title">
              {t("workspace.repositories.wiki.pageTitle")}
            </FieldLabel>
            <Input
              id="wiki-page-title"
              value={title}
              maxLength={245}
              disabled={mutation.isPending || Boolean(page)}
              aria-invalid={titleInvalid}
              placeholder={t("workspace.repositories.wiki.pageTitlePlaceholder")}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            {titleInvalid ? (
              <FieldError>{t("workspace.repositories.wiki.pageTitleRequired")}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={messageInvalid || undefined}>
            <FieldLabel htmlFor="wiki-edit-message">
              {t("workspace.repositories.wiki.editMessage")}
            </FieldLabel>
            <Input
              id="wiki-edit-message"
              value={message}
              maxLength={256}
              disabled={mutation.isPending}
              aria-invalid={messageInvalid}
              placeholder={t("workspace.repositories.wiki.editMessagePlaceholder")}
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
            {messageInvalid ? (
              <FieldError>{t("workspace.repositories.wiki.editMessageInvalid")}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={contentInvalid || undefined}>
            <FieldLabel htmlFor="wiki-page-content">
              {t("workspace.repositories.wiki.pageContent")}
            </FieldLabel>
            <GitHubMarkdownEditor
              key={page?.path ?? "new-wiki-page"}
              id="wiki-page-content"
              name="wiki-page-content"
              value={content}
              repository={repository}
              reference={overview.headSha ?? "HEAD"}
              relativeBaseUrl={overview.webUrl}
              relativeImageBaseUrl={relativeImageBaseUrl}
              relativeLinkFallbackUrl={overview.webUrl}
              disableRelativeImages
              placeholder={t("workspace.repositories.wiki.pageContentPlaceholder")}
              disabled={mutation.isPending}
              invalid={contentInvalid}
              previewEnabled={page?.markdown ?? true}
              minHeightClassName="min-h-72"
              onChange={setContent}
            />
            {contentInvalid ? (
              <FieldError>{t("workspace.repositories.wiki.pageContentTooLarge")}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={
              titleInvalid ||
              contentInvalid ||
              messageInvalid ||
              mutation.isPending ||
              !overview.headSha
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <FilePenLine data-icon="inline-start" />
            )}
            {t(
              mutation.isPending
                ? "workspace.repositories.wiki.saving"
                : "workspace.repositories.wiki.save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GitHubWikiView({ repository }: { repository: GitHubRepository }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const overviewResult = useQuery(repositoryWikiQueryOptions(target));
  const overview = overviewResult.data;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const navigationPages = useMemo(
    () =>
      overview
        ? [
            ...overview.pages,
            ...(overview.sidebar ? [overview.sidebar] : []),
            ...(overview.footer ? [overview.footer] : []),
          ]
        : [],
    [overview]
  );

  useEffect(() => {
    setSelectedPath(null);
    setQuery("");
    setEditorOpen(false);
    setDeleteOpen(false);
    setHistoryOpen(false);
  }, [repository.id]);

  useEffect(() => {
    if (!overview?.initialized) return;
    setSelectedPath((current) => {
      if (current && navigationPages.some((page) => page.path === current)) return current;
      return (
        overview.pages.find((page) => page.kind === "home")?.path ??
        overview.pages.find((page) => page.kind === "page")?.path ??
        navigationPages[0]?.path ??
        null
      );
    });
  }, [navigationPages, overview]);

  const selectedSummary = navigationPages.find((page) => page.path === selectedPath);
  const pageResult = useQuery({
    ...repositoryWikiPageQueryOptions({
      ...target,
      repositoryId: overview?.repositoryId ?? 0,
      headSha: overview?.headSha ?? "unavailable",
      path: selectedPath ?? "unselected.md",
    }),
    enabled: Boolean(overview?.initialized && overview.headSha && selectedPath),
  });
  const page = pageResult.data;
  const sidebarResult = useQuery({
    ...repositoryWikiPageQueryOptions({
      ...target,
      repositoryId: overview?.repositoryId ?? 0,
      headSha: overview?.headSha ?? "unavailable",
      path: overview?.sidebar?.path ?? "_Sidebar.md",
    }),
    enabled: Boolean(overview?.initialized && overview.headSha && overview.sidebar?.markdown),
  });
  const footerResult = useQuery({
    ...repositoryWikiPageQueryOptions({
      ...target,
      repositoryId: overview?.repositoryId ?? 0,
      headSha: overview?.headSha ?? "unavailable",
      path: overview?.footer?.path ?? "_Footer.md",
    }),
    enabled: Boolean(overview?.initialized && overview.headSha && overview.footer?.markdown),
  });
  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return navigationPages;
    return navigationPages.filter((item) =>
      `${item.title} ${item.path}`.toLocaleLowerCase().includes(normalized)
    );
  }, [navigationPages, query]);

  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteRepositoryWikiPage(
        target,
        page?.path ?? "",
        overview?.headSha ?? "",
        page?.blobSha ?? ""
      ),
    onSuccess: (result) => {
      syncRepositoryWikiMutation(queryClient, target, result, page?.path);
      const remainingPages = [
        ...result.overview.pages,
        ...(result.overview.sidebar ? [result.overview.sidebar] : []),
        ...(result.overview.footer ? [result.overview.footer] : []),
      ];
      const nextPath =
        result.overview.pages.find((item) => item.kind === "home")?.path ??
        result.overview.pages.find((item) => item.kind === "page")?.path ??
        remainingPages[0]?.path ??
        null;
      setSelectedPath(nextPath);
      setDeleteOpen(false);
      toast.success(t("workspace.repositories.wiki.deleted"));
    },
    onError: (reason) => {
      const error = parseIpcError(reason);
      toast.error(t("workspace.repositories.wiki.deleteFailed"), {
        description: error.message,
      });
    },
  });

  if (overviewResult.isPending) return <WikiSkeleton />;
  if (overviewResult.isError) {
    const error = parseIpcError(overviewResult.error);
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <Alert variant="destructive" className="max-w-xl">
          <BookOpen />
          <AlertTitle>{t("workspace.repositories.wiki.loadFailed")}</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void overviewResult.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("common.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!overview) return <WikiSkeleton />;

  if (!overview.enabled || !overview.initialized || navigationPages.length === 0) {
    const needsInitialization = overview.enabled && !overview.initialized;
    const emptyInitialized = overview.initialized && navigationPages.length === 0;
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <Empty className="max-w-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>
              {t(
                needsInitialization
                  ? "workspace.repositories.wiki.initializeTitle"
                  : emptyInitialized
                    ? "workspace.repositories.wiki.emptyTitle"
                    : "workspace.repositories.wiki.disabledTitle"
              )}
            </EmptyTitle>
            <EmptyDescription>
              {t(
                needsInitialization
                  ? "workspace.repositories.wiki.initializeDescription"
                  : emptyInitialized
                    ? "workspace.repositories.wiki.emptyDescription"
                    : "workspace.repositories.wiki.disabledDescription"
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => void overviewResult.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("common.retry")}
              </Button>
              <Button
                onClick={() =>
                  void openExternalUrl(
                    needsInitialization
                      ? overview.webUrl
                      : !overview.enabled
                        ? `${repository.url}/settings`
                        : overview.webUrl
                  )
                }
              >
                <ExternalLink data-icon="inline-start" />
                {t(
                  needsInitialization && overview.canEdit
                    ? "workspace.repositories.wiki.initializeOnGitHub"
                    : !overview.enabled
                      ? "workspace.repositories.wiki.openSettingsOnGitHub"
                      : "workspace.openOnGitHub"
                )}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const relativeImageBaseUrl = `https://raw.githubusercontent.com/wiki/${repository.owner}/${repository.name}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside className="flex w-[220px] shrink-0 flex-col border-r max-[980px]:w-[180px]">
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{t("workspace.repositories.wiki.pages")}</span>
            <Badge variant="secondary">{navigationPages.length}</Badge>
          </div>
          <Input
            value={query}
            aria-label={t("workspace.repositories.wiki.searchPages")}
            placeholder={t("workspace.repositories.wiki.searchPages")}
            className="h-8 text-xs"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        {sidebarResult.data && selectedPath !== sidebarResult.data.path ? (
          <div className="harbor-markdown max-h-36 overflow-auto border-b p-3 text-[11px]">
            <GitHubReadme
              content={sidebarResult.data.content}
              path={sidebarResult.data.path}
              reference={sidebarResult.data.headSha}
              repository={repository}
              relativeBaseUrl={overview.webUrl}
              relativeImageBaseUrl={relativeImageBaseUrl}
              relativeLinkFallbackUrl={overview.webUrl}
              disableRelativeImages
              onOpenRelativeLink={(destination) => {
                const resolved = resolveWikiPagePath(
                  destination,
                  sidebarResult.data.path,
                  navigationPages
                );
                if (!resolved) return false;
                setSelectedPath(resolved);
                return true;
              }}
              onOpenExternal={(url) => void openExternalUrl(url)}
            />
          </div>
        ) : null}
        <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
          <div className="flex flex-col gap-1 p-2">
            {filteredPages.length ? (
              filteredPages.map((item) => {
                const Icon = wikiPageIcon(item.kind);
                return (
                  <Button
                    key={item.path}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto min-h-8 justify-start px-2 py-1.5 text-left text-xs whitespace-normal",
                      selectedPath === item.path && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => setSelectedPath(item.path)}
                  >
                    <Icon data-icon="inline-start" />
                    <span className="truncate">{item.title}</span>
                  </Button>
                );
              })
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-2 p-5 text-center text-xs">
                <SearchX />
                <span>{t("workspace.repositories.wiki.noMatchingPages")}</span>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 border-t p-2">
          <Button
            type="button"
            size="sm"
            className="min-w-0 flex-1"
            disabled={!overview.canEdit || overview.archived || overview.stale}
            onClick={() => {
              setEditing(false);
              setEditorOpen(true);
            }}
          >
            <FilePlus2 data-icon="inline-start" />
            {t("workspace.repositories.wiki.newPage")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("workspace.repositories.wiki.refresh")}
            disabled={overviewResult.isFetching}
            onClick={() => void overviewResult.refetch()}
          >
            {overviewResult.isFetching ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{selectedSummary?.title}</h3>
              {selectedSummary && !selectedSummary.markdown ? (
                <Badge variant="outline">{t("workspace.repositories.wiki.sourceOnly")}</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground truncate text-[11px]">{selectedSummary?.path}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!page}
              onClick={() => setHistoryOpen(true)}
            >
              <History data-icon="inline-start" />
              {t("workspace.repositories.wiki.history")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!page || !overview.canEdit || overview.archived || overview.stale}
              onClick={() => {
                setEditing(true);
                setEditorOpen(true);
              }}
            >
              <FilePenLine data-icon="inline-start" />
              {t("common.edit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("common.delete")}
              disabled={!page || !overview.canEdit || overview.archived || overview.stale}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("workspace.openOnGitHub")}
              disabled={!selectedSummary}
              onClick={() => selectedSummary && void openExternalUrl(overview.webUrl)}
            >
              <ExternalLink />
            </Button>
          </div>
        </header>

        {overview.stale ||
        overview.archived ||
        overview.truncated ||
        overview.unsupportedFileCount ? (
          <div className="flex flex-col gap-2 border-b p-3">
            {overview.stale ? (
              <Alert>
                <TriangleAlert />
                <AlertTitle>{t("workspace.repositories.wiki.offlineTitle")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.wiki.offlineDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
            {overview.archived ? (
              <Alert>
                <BookOpen />
                <AlertTitle>{t("workspace.repositories.wiki.archivedTitle")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.repositories.wiki.archivedDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
            {overview.truncated || overview.unsupportedFileCount ? (
              <Alert>
                <TriangleAlert />
                <AlertTitle>{t("workspace.repositories.wiki.partialIndexTitle")}</AlertTitle>
                <AlertDescription>
                  <p>
                    {t("workspace.repositories.wiki.partialIndexDescription", {
                      count: overview.unsupportedFileCount,
                    })}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openExternalUrl(overview.webUrl)}
                  >
                    <ExternalLink data-icon="inline-start" />
                    {t("workspace.openOnGitHub")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {pageResult.isPending ? (
          <div className="flex flex-col gap-4 p-5">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : pageResult.isError ? (
          <div className="grid min-h-0 flex-1 place-items-center p-6">
            <Alert variant="destructive" className="max-w-xl">
              <BookOpen />
              <AlertTitle>{t("workspace.repositories.wiki.pageLoadFailed")}</AlertTitle>
              <AlertDescription>
                <p>{parseIpcError(pageResult.error).message}</p>
                <Button variant="outline" size="sm" onClick={() => void pageResult.refetch()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("common.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : page ? (
          <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
            <article className="mx-auto w-full max-w-4xl p-5 pb-12">
              {!page.markdown ? (
                <Alert className="mb-4">
                  <TriangleAlert />
                  <AlertTitle>{t("workspace.repositories.wiki.sourceOnlyTitle")}</AlertTitle>
                  <AlertDescription>
                    {t("workspace.repositories.wiki.sourceOnlyDescription")}
                  </AlertDescription>
                </Alert>
              ) : null}
              {page.markdown ? (
                <div className="harbor-markdown text-[13px]">
                  <GitHubReadme
                    content={page.content}
                    path={page.path}
                    reference={page.headSha}
                    repository={repository}
                    relativeBaseUrl={overview.webUrl}
                    relativeImageBaseUrl={relativeImageBaseUrl}
                    relativeLinkFallbackUrl={overview.webUrl}
                    disableRelativeImages
                    onOpenRelativeLink={(destination) => {
                      const resolved = resolveWikiPagePath(destination, page.path, navigationPages);
                      if (!resolved) return false;
                      setSelectedPath(resolved);
                      return true;
                    }}
                    onOpenExternal={(url) => void openExternalUrl(url)}
                  />
                </div>
              ) : (
                <pre className="bg-muted/40 overflow-auto rounded-md border p-4 text-xs leading-5 whitespace-pre-wrap">
                  {page.content}
                </pre>
              )}
              {footerResult.data && selectedPath !== footerResult.data.path ? (
                <footer className="harbor-markdown mt-8 rounded-md border p-4 text-[12px]">
                  <GitHubReadme
                    content={footerResult.data.content}
                    path={footerResult.data.path}
                    reference={footerResult.data.headSha}
                    repository={repository}
                    relativeBaseUrl={overview.webUrl}
                    relativeImageBaseUrl={relativeImageBaseUrl}
                    relativeLinkFallbackUrl={overview.webUrl}
                    disableRelativeImages
                    onOpenRelativeLink={(destination) => {
                      const resolved = resolveWikiPagePath(
                        destination,
                        footerResult.data.path,
                        navigationPages
                      );
                      if (!resolved) return false;
                      setSelectedPath(resolved);
                      return true;
                    }}
                    onOpenExternal={(url) => void openExternalUrl(url)}
                  />
                </footer>
              ) : null}
            </article>
          </ScrollArea>
        ) : null}
      </section>

      <GitHubWikiEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        repository={repository}
        overview={overview}
        page={editing ? page : undefined}
        onSaved={(savedPage) => setSelectedPath(savedPage.path)}
      />

      {page ? (
        <GitHubWikiHistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          repository={repository}
          overview={overview}
          page={page}
          onReverted={(result) => {
            if (result.page) setSelectedPath(result.page.path);
          }}
        />
      ) : null}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => !deleteMutation.isPending && setDeleteOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.repositories.wiki.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.wiki.deleteDescription", { title: page?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {t(
                deleteMutation.isPending
                  ? "workspace.repositories.wiki.deleting"
                  : "workspace.repositories.wiki.delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
