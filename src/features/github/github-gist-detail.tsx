import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  Code2,
  ExternalLink,
  FileCode2,
  GitFork,
  History,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Send,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubGist,
  GitHubGistComment,
  GitHubGistCommentMutation,
  GitHubGistFile,
  GitHubGistUpdateInput,
} from "./github-data";
import { GitHubGistEditorDialog } from "./github-gist-editor-dialog";
import {
  deleteGist,
  forkGist,
  invalidateGists,
  mutateGistComment,
  syncDeletedGist,
  syncDeletedGistComment,
  syncGist,
  syncGistComment,
  updateGist,
  updateGistStar,
} from "./github-gist-mutations";
import { formatIssueDate } from "./github-issue-shared";
import {
  gistCommentsQueryOptions,
  gistQueryOptions,
  gistRevisionQueryOptions,
  gistRevisionsQueryOptions,
} from "./github-queries";
import { GitHubSourceTokens, useGitHubSourceLines } from "./github-source-code";

const GitHubReadme = lazy(() => import("./github-readme"));

function gistErrorTitle(code: string) {
  if (code === "githubNotConnected") return "workspace.gists.connectTitle";
  if (code === "githubPermission") return "workspace.gists.permissionTitle";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.gists.loadFailed";
}

function rawBaseUrl(file: GitHubGistFile) {
  if (!file.rawUrl) return undefined;
  try {
    const url = new URL(file.rawUrl);
    url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function GistMarkdown({
  gist,
  content,
  file,
}: {
  gist: GitHubGist;
  content: string;
  file?: GitHubGistFile;
}) {
  const context = {
    owner: gist.owner ?? "anonymous",
    name: gist.id,
    url: gist.url,
    defaultBranch: gist.id,
  };
  return (
    <Suspense fallback={<Skeleton className="h-20 w-full" />}>
      <GitHubReadme
        content={content}
        path={file?.filename ?? ""}
        reference={gist.id}
        repository={context}
        relativeBaseUrl={rawBaseUrl(file ?? gist.files[0])}
        onOpenExternal={(url) => void openExternalUrl(url)}
      />
    </Suspense>
  );
}

function GistFilePanel({ gist, file }: { gist: GitHubGist; file: GitHubGistFile }) {
  const { t } = useTranslation();
  const content = file.content ?? "";
  const lines = useGitHubSourceLines({ content, fileName: file.filename, size: file.size });
  const markdown = /\.(md|markdown|mdown)$/i.test(file.filename);

  const source =
    file.truncated || file.content === undefined ? (
      <Empty className="min-h-56">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("workspace.gists.truncatedTitle")}</EmptyTitle>
          <EmptyDescription>{t("workspace.gists.truncatedDescription")}</EmptyDescription>
        </EmptyHeader>
        {file.rawUrl ? (
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => void openExternalUrl(file.rawUrl!)}>
              <ExternalLink data-icon="inline-end" />
              {t("workspace.gists.openRaw")}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    ) : lines.length ? (
      <div
        role="table"
        aria-label={t("workspace.gists.fileSource", { name: file.filename })}
        className="overflow-x-auto py-2 font-mono text-xs leading-5"
      >
        {lines.map((tokens, index) => (
          <div
            key={index}
            role="row"
            className="hover:bg-primary/[0.025] grid min-w-max grid-cols-[3.75rem_minmax(max-content,1fr)]"
          >
            <span
              role="rowheader"
              className="text-muted-foreground/55 border-r border-white/[0.045] pr-3 text-right tabular-nums select-none"
            >
              {index + 1}
            </span>
            <code role="cell" className="px-4 whitespace-pre [tab-size:2]">
              <GitHubSourceTokens tokens={tokens} />
            </code>
          </div>
        ))}
      </div>
    ) : (
      <Empty className="min-h-48">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileCode2 />
          </EmptyMedia>
          <EmptyTitle>{t("workspace.gists.emptyFile")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

  return (
    <section className="overflow-hidden rounded-lg border bg-white/[0.015]">
      <header className="flex min-h-11 items-center gap-2 border-b px-3 py-2">
        <FileCode2 className="text-primary size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          {file.filename}
        </span>
        {file.language ? <Badge variant="outline">{file.language}</Badge> : null}
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {t("workspace.gists.bytes", { count: file.size })}
        </span>
        {file.rawUrl ? (
          <Button variant="ghost" size="xs" onClick={() => void openExternalUrl(file.rawUrl!)}>
            {t("workspace.gists.raw")}
          </Button>
        ) : null}
      </header>
      {markdown && !file.truncated && file.content !== undefined ? (
        <Tabs defaultValue="preview" className="gap-0">
          <TabsList variant="line" className="mx-3 mt-1 h-8 justify-start rounded-none p-0">
            <TabsTrigger value="preview" className="px-2 text-xs">
              {t("workspace.gists.preview")}
            </TabsTrigger>
            <TabsTrigger value="source" className="px-2 text-xs">
              {t("workspace.gists.source")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="harbor-markdown min-w-0 p-4 text-xs">
            <GistMarkdown gist={gist} file={file} content={content} />
          </TabsContent>
          <TabsContent value="source">{source}</TabsContent>
        </Tabs>
      ) : (
        source
      )}
    </section>
  );
}

function GistComments({ gist }: { gist: GitHubGist }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<GitHubGistComment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GitHubGistComment | null>(null);
  const result = useInfiniteQuery(gistCommentsQueryOptions({ gistId: gist.id }));
  const comments = useMemo(
    () => result.data?.pages.flatMap((page) => page.comments) ?? [],
    [result.data]
  );
  const mutation = useMutation({
    mutationFn: (mutation: GitHubGistCommentMutation) =>
      mutateGistComment(gist.id, mutation).then((comment) => ({ comment, mutation })),
    onSuccess: ({ comment, mutation }) => {
      if (mutation.action === "delete") {
        syncDeletedGistComment(queryClient, gist.id, mutation.commentId);
        setDeleteTarget(null);
        toast.success(t("workspace.gists.commentDeleted"));
      } else if (comment) {
        syncGistComment(queryClient, gist.id, comment, mutation.action === "create");
        setBody("");
        setEditing(null);
        toast.success(
          t(
            mutation.action === "create"
              ? "workspace.gists.commentCreated"
              : "workspace.gists.commentUpdated"
          )
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["github", "gist", gist.id, "comments"] });
    },
  });
  const mutationError = mutation.error ? parseIpcError(mutation.error).message : "";

  if (result.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (result.error) {
    const error = parseIpcError(result.error);
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t(gistErrorTitle(error.code))}</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
            <RefreshCw data-icon="inline-start" />
            {t("common.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 p-4">
      {comments.length === 0 ? (
        <Empty className="min-h-40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareText />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.gists.noComments")}</EmptyTitle>
            <EmptyDescription>{t("workspace.gists.noCommentsDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        comments.map((comment) => (
          <article key={comment.id} className="overflow-hidden rounded-lg border">
            <header className="bg-muted/20 flex items-center gap-2 border-b px-3 py-2">
              <Avatar className="size-6">
                <AvatarImage src={comment.authorAvatarUrl} alt="" />
                <AvatarFallback>{comment.author?.slice(0, 1).toUpperCase() ?? "?"}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">
                {comment.author ?? t("workspace.gists.anonymous")}
              </span>
              <time className="text-muted-foreground text-[10px]">
                {formatIssueDate(comment.createdAt, i18n.language)}
              </time>
              <span className="flex-1" />
              {comment.viewerCanUpdate ? (
                <Button variant="ghost" size="xs" onClick={() => setEditing(comment)}>
                  <Pencil data-icon="inline-start" />
                  {t("common.edit")}
                </Button>
              ) : null}
              {comment.viewerCanDelete ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDeleteTarget(comment)}
                  aria-label={t("workspace.gists.deleteComment")}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </header>
            {editing?.id === comment.id ? (
              <div className="space-y-2 p-3">
                <Textarea
                  value={editing.body}
                  disabled={mutation.isPending}
                  className="min-h-28 text-xs"
                  onChange={(event) => setEditing({ ...editing, body: event.currentTarget.value })}
                />
                <FieldError>{mutationError}</FieldError>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(null)}
                    disabled={mutation.isPending}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!editing.body.trim() || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        action: "update",
                        commentId: comment.id,
                        body: editing.body,
                      })
                    }
                  >
                    {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="harbor-markdown p-3 text-xs">
                <GistMarkdown gist={gist} content={comment.body} />
              </div>
            )}
          </article>
        ))
      )}

      {result.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void result.fetchNextPage()}
          disabled={result.isFetchingNextPage}
        >
          {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
          {t("workspace.gists.loadMoreComments")}
        </Button>
      ) : null}

      {gist.commentsEnabled ? (
        <form
          className="space-y-2 rounded-lg border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) mutation.mutate({ action: "create", body });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`gist-${gist.id}-comment`}>
              {t("workspace.gists.addComment")}
            </FieldLabel>
            <Textarea
              id={`gist-${gist.id}-comment`}
              value={body}
              disabled={mutation.isPending}
              className="min-h-28 text-xs"
              placeholder={t("workspace.gists.commentPlaceholder")}
              onChange={(event) => setBody(event.currentTarget.value)}
            />
            <FieldError>{!editing ? mutationError : ""}</FieldError>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!body.trim() || mutation.isPending}>
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Send data-icon="inline-start" />
              )}
              {t("workspace.gists.comment")}
            </Button>
          </div>
        </form>
      ) : (
        <Alert>
          <CircleAlert />
          <AlertDescription>{t("workspace.gists.commentsDisabled")}</AlertDescription>
        </Alert>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.gists.deleteCommentTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.gists.deleteCommentDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mutationError && deleteTarget ? (
            <Alert variant="destructive">
              <AlertDescription>{mutationError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) mutation.mutate({ action: "delete", commentId: deleteTarget.id });
              }}
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function GitHubGistDetail({
  gistId,
  onBack,
  onDeleted,
  onForked,
}: {
  gistId: string;
  onBack: () => void;
  onDeleted: () => void;
  onForked: (gist: GitHubGist) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("files");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const result = useQuery(gistQueryOptions({ gistId }));
  const revisionsResult = useInfiniteQuery({
    ...gistRevisionsQueryOptions({ gistId }),
    enabled: activeTab === "revisions",
  });
  const revisionResult = useQuery({
    ...gistRevisionQueryOptions({ gistId, version: selectedVersion ?? "" }),
    enabled: Boolean(selectedVersion),
  });
  const gist = result.data;
  const files = useMemo(
    () => (selectedVersion ? revisionResult.data?.files : gist?.files) ?? [],
    [gist?.files, revisionResult.data?.files, selectedVersion]
  );
  const selectedFile = files.find((file) => file.filename === selectedFileName) ?? files[0];
  const revisions = useMemo(
    () => revisionsResult.data?.pages.flatMap((page) => page.revisions) ?? [],
    [revisionsResult.data]
  );
  const starMutation = useMutation({
    mutationFn: (starred: boolean) => updateGistStar(gistId, starred),
    onSuccess: (updated) => {
      syncGist(queryClient, updated);
      toast.success(t(updated.starred ? "workspace.gists.starred" : "workspace.gists.unstarred"));
      void invalidateGists(queryClient, gistId);
    },
  });
  const forkMutation = useMutation({
    mutationFn: () => forkGist(gistId),
    onSuccess: (fork) => {
      syncGist(queryClient, fork, true);
      toast.success(t("workspace.gists.forked"));
      onForked(fork);
      void invalidateGists(queryClient, fork.id);
    },
  });
  const editMutation = useMutation({
    mutationFn: (input: GitHubGistUpdateInput) => updateGist(gistId, input),
    onSuccess: (updated) => {
      syncGist(queryClient, updated);
      setEditOpen(false);
      toast.success(t("workspace.gists.updated"));
      void invalidateGists(queryClient, gistId);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteGist(gistId, deleteConfirmation),
    onSuccess: () => {
      syncDeletedGist(queryClient, gistId);
      setDeleteOpen(false);
      toast.success(t("workspace.gists.deleted"));
      onDeleted();
      void invalidateGists(queryClient);
    },
  });

  useEffect(() => {
    if (files.length && !files.some((file) => file.filename === selectedFileName)) {
      setSelectedFileName(files[0].filename);
    }
  }, [files, selectedFileName]);

  if (result.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!gist || result.error) {
    const error = parseIpcError(result.error);
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t(gistErrorTitle(error.code))}</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            {t("workspace.gists.back")}
          </Button>
          <Button variant="outline" onClick={() => void result.refetch()}>
            <RefreshCw data-icon="inline-start" />
            {t("common.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const writeError = starMutation.error ?? forkMutation.error;
  const editBlocked = gist.files.some((file) => file.truncated || file.content === undefined);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="workspace-wide:hidden"
              aria-label={t("workspace.gists.back")}
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
            <Avatar className="mt-0.5 size-8">
              <AvatarImage src={gist.ownerAvatarUrl} alt="" />
              <AvatarFallback>{gist.owner?.slice(0, 1).toUpperCase() ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h2 className="max-w-[64ch] truncate text-base font-semibold tracking-[-0.02em]">
                  {gist.description ?? gist.files[0]?.filename ?? gist.id}
                </h2>
                <Badge variant="outline" className="gap-1 font-normal">
                  {gist.public ? <Users className="size-3" /> : <LockKeyhole className="size-3" />}
                  {t(gist.public ? "workspace.gists.public" : "workspace.gists.secret")}
                </Badge>
                {selectedVersion ? (
                  <Badge variant="secondary">{selectedVersion.slice(0, 7)}</Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {gist.owner ?? t("workspace.gists.anonymous")} ·{" "}
                {formatIssueDate(gist.updatedAt, i18n.language)} · {gist.id}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={starMutation.isPending}
              onClick={() => starMutation.mutate(!gist.starred)}
            >
              {starMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Star
                  className={gist.starred ? "fill-current text-amber-400" : ""}
                  data-icon="inline-start"
                />
              )}
              {t(gist.starred ? "workspace.gists.unstar" : "workspace.gists.star")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={gist.viewerOwns || forkMutation.isPending}
              onClick={() => forkMutation.mutate()}
            >
              {forkMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <GitFork data-icon="inline-start" />
              )}
              {t("workspace.gists.fork")}
            </Button>
            {gist.viewerOwns ? (
              <Button
                variant="outline"
                size="sm"
                disabled={editBlocked}
                onClick={() => setEditOpen(true)}
              >
                <Pencil data-icon="inline-start" />
                {t("common.edit")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("workspace.gists.openOnGitHub")}
              onClick={() => void openExternalUrl(gist.url)}
            >
              <ExternalLink />
            </Button>
            {gist.viewerOwns ? (
              <Button
                variant="destructive"
                size="icon-sm"
                aria-label={t("workspace.gists.delete")}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        </div>
        {writeError ? (
          <Alert variant="destructive" className="mt-3">
            <CircleAlert />
            <AlertDescription>{parseIpcError(writeError).message}</AlertDescription>
          </Alert>
        ) : null}
        {editBlocked && gist.viewerOwns ? (
          <Alert className="mt-3">
            <CircleAlert />
            <AlertDescription>{t("workspace.gists.truncatedEditBlocked")}</AlertDescription>
          </Alert>
        ) : null}
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-10 w-full justify-start rounded-none border-b px-4">
          <TabsTrigger value="files">
            <Code2 />
            {t("workspace.gists.files")}
          </TabsTrigger>
          <TabsTrigger value="revisions">
            <History />
            {t("workspace.gists.revisions")}
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquareText />
            {t("workspace.gists.comments", { count: gist.comments })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3 p-4">
              {selectedVersion ? (
                <Alert>
                  <History />
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {t("workspace.gists.viewingRevision", {
                        version: selectedVersion.slice(0, 7),
                      })}
                    </span>
                    <Button variant="ghost" size="xs" onClick={() => setSelectedVersion(null)}>
                      {t("workspace.gists.backToLatest")}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {files.length > 1 ? (
                <Select value={selectedFile?.filename} onValueChange={setSelectedFileName}>
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {files.map((file) => (
                      <SelectItem key={file.filename} value={file.filename}>
                        {file.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {revisionResult.isPending && selectedVersion ? (
                <Skeleton className="h-72 w-full" />
              ) : selectedFile ? (
                <GistFilePanel gist={gist} file={selectedFile} />
              ) : null}
              {revisionResult.error ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>{parseIpcError(revisionResult.error).message}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="revisions" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {revisionsResult.isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : revisionsResult.error ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.gists.revisionsFailed")}</EmptyTitle>
                  <EmptyDescription>
                    {parseIpcError(revisionsResult.error).message}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="mx-auto flex w-full max-w-[920px] flex-col gap-2 p-4">
                {revisions.map((revision) => (
                  <button
                    key={revision.version}
                    type="button"
                    className="hover:bg-muted/25 flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors"
                    onClick={() => {
                      setSelectedVersion(revision.version);
                      setActiveTab("files");
                    }}
                  >
                    <History className="text-muted-foreground size-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-medium">
                        {revision.version.slice(0, 12)}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-[10px]">
                        {revision.author ?? t("workspace.gists.anonymous")} ·{" "}
                        {formatIssueDate(revision.committedAt, i18n.language)}
                      </span>
                    </span>
                    <span className="text-[10px] tabular-nums">
                      <span className="text-emerald-400">+{revision.additions}</span>{" "}
                      <span className="text-rose-400">−{revision.deletions}</span>
                    </span>
                  </button>
                ))}
                {revisionsResult.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void revisionsResult.fetchNextPage()}
                    disabled={revisionsResult.isFetchingNextPage}
                  >
                    {revisionsResult.isFetchingNextPage ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    {t("workspace.gists.loadMoreRevisions")}
                  </Button>
                ) : null}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="comments" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <GistComments gist={gist} />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <GitHubGistEditorDialog
        open={editOpen}
        gist={gist}
        pending={editMutation.isPending}
        error={editMutation.error ? parseIpcError(editMutation.error).message : ""}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) editMutation.reset();
        }}
        onCreate={() => undefined}
        onUpdate={(input) => editMutation.mutate(input)}
      />

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setDeleteConfirmation("");
            deleteMutation.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.gists.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.gists.deleteDescription", { id: gist.id })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={`delete-gist-${gist.id}`}>
              {t("workspace.gists.deleteConfirmation", { id: gist.id })}
            </FieldLabel>
            <Input
              id={`delete-gist-${gist.id}`}
              value={deleteConfirmation}
              disabled={deleteMutation.isPending}
              onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
            />
            <FieldError>
              {deleteMutation.error ? parseIpcError(deleteMutation.error).message : ""}
            </FieldError>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                deleteMutation.isPending ||
                deleteConfirmation.trim().toLowerCase() !== gist.id.toLowerCase()
              }
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
              {t("workspace.gists.deletePermanently")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
