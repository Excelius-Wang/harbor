import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, History, RotateCcw, TriangleAlert } from "lucide-react";
import { Diff, Hunk, parseDiff, type FileData } from "react-diff-view";
import "react-diff-view/style/index.css";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubRepository,
  GitHubWikiMutationResult,
  GitHubWikiOverview,
  GitHubWikiPage,
} from "./github-data";
import GitHubReadme from "./github-readme";
import {
  repositoryWikiComparisonQueryOptions,
  repositoryWikiHistoryQueryOptions,
  repositoryWikiRevisionQueryOptions,
} from "./github-queries";
import { revertRepositoryWikiPage, syncRepositoryWikiMutation } from "./github-wiki";

function parseWikiPatch(source: string): FileData | null {
  if (!source) return null;
  try {
    return parseDiff(source, { nearbySequences: "zip" })[0] ?? null;
  } catch {
    return null;
  }
}

export function GitHubWikiHistoryDialog({
  open,
  onOpenChange,
  repository,
  overview,
  page,
  onReverted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repository: GitHubRepository;
  overview: GitHubWikiOverview;
  page: GitHubWikiPage;
  onReverted: (result: GitHubWikiMutationResult) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [revertOpen, setRevertOpen] = useState(false);
  const historyTarget = {
    ...target,
    repositoryId: overview.repositoryId,
    headSha: overview.headSha ?? page.headSha,
    path: page.path,
    page: historyPage,
  };
  const historyResult = useQuery({
    ...repositoryWikiHistoryQueryOptions(historyTarget),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setHistoryPage(1);
    setSelectedSha(null);
    setRevertOpen(false);
  }, [open, page.path]);

  useEffect(() => {
    if (!selectedSha && historyResult.data?.revisions[0]) {
      setSelectedSha(historyResult.data.revisions[0].sha);
    }
  }, [historyResult.data?.revisions, selectedSha]);

  const revisionResult = useQuery({
    ...repositoryWikiRevisionQueryOptions({
      ...target,
      repositoryId: overview.repositoryId,
      commitSha: selectedSha ?? "unselected",
      path: page.path,
    }),
    enabled: open && Boolean(selectedSha),
  });
  const comparisonResult = useQuery({
    ...repositoryWikiComparisonQueryOptions({
      ...target,
      repositoryId: overview.repositoryId,
      path: page.path,
      baseSha: selectedSha ?? "unselected",
      headSha: overview.headSha ?? page.headSha,
    }),
    enabled: open && Boolean(selectedSha && selectedSha !== overview.headSha),
  });
  const diff = useMemo(
    () => parseWikiPatch(comparisonResult.data?.patch ?? ""),
    [comparisonResult.data?.patch]
  );
  const selectedRevision = revisionResult.data;

  const revertMutation = useMutation({
    mutationFn: () =>
      revertRepositoryWikiPage(target, {
        path: page.path,
        expectedHead: overview.headSha ?? page.headSha,
        expectedBlobSha: page.blobSha,
        sourceCommitSha: selectedSha ?? "",
      }),
    onSuccess: (result) => {
      syncRepositoryWikiMutation(queryClient, target, result, page.path);
      onReverted(result);
      setRevertOpen(false);
      onOpenChange(false);
      toast.success(t("workspace.repositories.wiki.reverted"));
    },
    onError: (reason) => {
      const error = parseIpcError(reason);
      toast.error(t("workspace.repositories.wiki.revertFailed"), {
        description: error.message,
      });
    },
  });

  const relativeImageBaseUrl = `https://raw.githubusercontent.com/wiki/${repository.owner}/${repository.name}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {t("workspace.repositories.wiki.historyTitle", { title: page.title })}
            </DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.wiki.historyDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] overflow-hidden rounded-md border max-[760px]:grid-cols-1">
            <aside className="flex min-h-0 flex-col border-r max-[760px]:max-h-52 max-[760px]:border-r-0 max-[760px]:border-b">
              <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
                <div className="flex flex-col gap-1 p-2">
                  {historyResult.isPending ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <Skeleton key={index} className="h-14 w-full" />
                    ))
                  ) : historyResult.isError ? (
                    <Alert variant="destructive">
                      <TriangleAlert />
                      <AlertTitle>{t("workspace.repositories.wiki.historyLoadFailed")}</AlertTitle>
                      <AlertDescription>
                        <p>{parseIpcError(historyResult.error).message}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void historyResult.refetch()}
                        >
                          {t("common.retry")}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    historyResult.data?.revisions.map((revision) => (
                      <Button
                        key={revision.sha}
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-auto min-w-0 flex-col items-start gap-1 px-2 py-2 text-left whitespace-normal",
                          selectedSha === revision.sha && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => setSelectedSha(revision.sha)}
                      >
                        <span className="line-clamp-2 text-xs font-medium">{revision.message}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {revision.shortSha} ·{" "}
                          {revision.authorName ?? t("workspace.repositories.unknownAuthor")}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Intl.DateTimeFormat(i18n.language, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(revision.authoredAt * 1000))}
                        </span>
                      </Button>
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between gap-2 border-t p-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("workspace.repositories.wiki.previousHistoryPage")}
                      disabled={historyPage === 1}
                      onClick={() => {
                        setHistoryPage((current) => Math.max(1, current - 1));
                        setSelectedSha(null);
                      }}
                    >
                      <ArrowLeft />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("workspace.repositories.wiki.previousHistoryPage")}
                  </TooltipContent>
                </Tooltip>
                <span className="text-muted-foreground text-[11px]">{historyPage}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("workspace.repositories.wiki.nextHistoryPage")}
                      disabled={!historyResult.data?.hasMore}
                      onClick={() => {
                        setHistoryPage((current) => current + 1);
                        setSelectedSha(null);
                      }}
                    >
                      <ArrowRight />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("workspace.repositories.wiki.nextHistoryPage")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </aside>

            <ScrollArea className="min-h-0" constrainContentWidth>
              <div className="flex flex-col gap-4 p-4">
                {historyResult.data?.truncated ? (
                  <Alert>
                    <TriangleAlert />
                    <AlertTitle>{t("workspace.repositories.wiki.historyTruncated")}</AlertTitle>
                    <AlertDescription>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void openExternalUrl(overview.webUrl)}
                      >
                        {t("workspace.openOnGitHub")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                {revisionResult.isPending ? (
                  <>
                    <Skeleton className="h-7 w-2/5" />
                    <Skeleton className="h-36 w-full" />
                  </>
                ) : revisionResult.isError ? (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>{t("workspace.repositories.wiki.revisionLoadFailed")}</AlertTitle>
                    <AlertDescription>
                      {parseIpcError(revisionResult.error).message}
                    </AlertDescription>
                  </Alert>
                ) : selectedRevision ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold">
                          {selectedRevision.revision.message}
                        </h4>
                        <p className="text-muted-foreground mt-1 text-[11px]">
                          {selectedRevision.revision.sha}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          !overview.canEdit ||
                          overview.archived ||
                          overview.stale ||
                          selectedRevision.deleted ||
                          selectedRevision.revision.sha === overview.headSha
                        }
                        onClick={() => setRevertOpen(true)}
                      >
                        <RotateCcw data-icon="inline-start" />
                        {t("workspace.repositories.wiki.revert")}
                      </Button>
                    </div>
                    {selectedRevision.deleted ? (
                      <Alert>
                        <History />
                        <AlertTitle>{t("workspace.repositories.wiki.revisionDeleted")}</AlertTitle>
                      </Alert>
                    ) : selectedRevision.markdown && selectedRevision.content !== undefined ? (
                      <div className="harbor-markdown rounded-md border p-4 text-[13px]">
                        <GitHubReadme
                          content={selectedRevision.content}
                          path={selectedRevision.path}
                          reference={selectedRevision.revision.sha}
                          repository={repository}
                          relativeBaseUrl={overview.webUrl}
                          relativeImageBaseUrl={relativeImageBaseUrl}
                          relativeLinkFallbackUrl={overview.webUrl}
                          disableRelativeImages
                          onOpenExternal={(url) => void openExternalUrl(url)}
                        />
                      </div>
                    ) : (
                      <pre className="bg-muted/40 overflow-auto rounded-md border p-4 text-xs leading-5 whitespace-pre-wrap">
                        {selectedRevision.content}
                      </pre>
                    )}

                    {selectedRevision.revision.sha !== overview.headSha ? (
                      <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold">
                            {t("workspace.repositories.wiki.changesSinceRevision")}
                          </h4>
                          {comparisonResult.data ? (
                            <div className="flex gap-1">
                              <Badge variant="secondary">+{comparisonResult.data.additions}</Badge>
                              <Badge variant="secondary">-{comparisonResult.data.deletions}</Badge>
                            </div>
                          ) : null}
                        </div>
                        {comparisonResult.isPending ? (
                          <Skeleton className="h-32 w-full" />
                        ) : comparisonResult.isError ? (
                          <Alert variant="destructive">
                            <TriangleAlert />
                            <AlertTitle>
                              {t("workspace.repositories.wiki.compareFailed")}
                            </AlertTitle>
                            <AlertDescription>
                              {parseIpcError(comparisonResult.error).message}
                            </AlertDescription>
                          </Alert>
                        ) : diff ? (
                          <div className="harbor-diff overflow-x-auto rounded-md border">
                            <Diff viewType="unified" diffType={diff.type} hunks={diff.hunks}>
                              {(hunks) =>
                                hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
                              }
                            </Diff>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-xs">
                            {t("workspace.repositories.wiki.noRevisionChanges")}
                          </p>
                        )}
                      </section>
                    ) : null}
                  </>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revertOpen}
        onOpenChange={(next) => !revertMutation.isPending && setRevertOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.repositories.wiki.revertTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.wiki.revertDescription", {
                title: page.title,
                revision: selectedRevision?.revision.shortSha,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={revertMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                revertMutation.mutate();
              }}
            >
              {revertMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RotateCcw data-icon="inline-start" />
              )}
              {t(
                revertMutation.isPending
                  ? "workspace.repositories.wiki.reverting"
                  : "workspace.repositories.wiki.revert"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
