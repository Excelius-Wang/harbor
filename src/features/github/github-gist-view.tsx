import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  Code2,
  FileCode2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Star,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type { GitHubGist, GitHubGistCreateInput, GitHubGistSource } from "./github-data";
import { GitHubGistDetail } from "./github-gist-detail";
import { GitHubGistEditorDialog } from "./github-gist-editor-dialog";
import { createGist, invalidateGists, syncGist } from "./github-gist-mutations";
import { formatIssueDate } from "./github-issue-shared";
import { gistsQueryOptions } from "./github-queries";

function GistListSkeleton() {
  return (
    <div className="space-y-1.5 p-2">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-lg p-3">
          <Skeleton className="size-8 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GistRow({
  gist,
  selected,
  locale,
  onSelect,
}: {
  gist: GitHubGist;
  selected: boolean;
  locale: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const title = gist.description ?? gist.files[0]?.filename ?? gist.id;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full justify-start gap-3 rounded-lg border px-3 py-3 text-left whitespace-normal",
        selected
          ? "border-primary/30 bg-primary/8 hover:bg-primary/10"
          : "border-transparent hover:border-white/8"
      )}
    >
      <span className="border-primary/20 bg-primary/[0.06] text-primary grid size-8 shrink-0 place-items-center rounded-md border">
        <Code2 className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-[12px] leading-4 font-medium">{title}</span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[10px]">
          <span className="truncate">{gist.owner ?? t("workspace.gists.anonymous")}</span>
          <span>·</span>
          <span>{t("workspace.gists.fileCount", { count: gist.files.length })}</span>
          {gist.starred ? <Star className="size-3 fill-current text-amber-400" /> : null}
        </span>
        <span className="text-muted-foreground/80 text-[10px]">
          {formatIssueDate(gist.updatedAt, locale)}
        </span>
      </span>
      {gist.public ? (
        <Users className="text-muted-foreground size-3.5 shrink-0" />
      ) : (
        <LockKeyhole className="text-muted-foreground size-3.5 shrink-0" />
      )}
    </Button>
  );
}

function gistsErrorTitle(code: string) {
  if (code === "desktopOnly") return "workspace.gists.desktopOnlyTitle";
  if (code === "githubNotConnected") return "workspace.gists.connectTitle";
  if (code === "githubPermission") return "workspace.gists.permissionTitle";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.gists.loadFailed";
}

export function GitHubGists() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const desktopRuntime = isTauri();
  const [source, setSource] = useState<GitHubGistSource>("mine");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [wideLayout, setWideLayout] = useState(
    () => window.matchMedia("(min-width: 1180px)").matches
  );
  const result = useInfiniteQuery({
    ...gistsQueryOptions({ source }),
    enabled: desktopRuntime,
  });
  const gists = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const all = result.data?.pages.flatMap((page) => page.gists) ?? [];
    return needle
      ? all.filter((gist) =>
          [gist.description, gist.owner, gist.id, ...gist.files.map((file) => file.filename)]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(needle))
        )
      : all;
  }, [query, result.data]);
  const createMutation = useMutation({
    mutationFn: (input: GitHubGistCreateInput) => createGist(input),
    onSuccess: (gist) => {
      syncGist(queryClient, gist, true);
      setCreateOpen(false);
      setSource("mine");
      setSelectedId(gist.id);
      toast.success(t("workspace.gists.created"));
      void invalidateGists(queryClient, gist.id);
    },
  });
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.gists.desktopOnly") }
    : !result.data && result.error
      ? parseIpcError(result.error)
      : null;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1180px)");
    const updateLayout = () => setWideLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (wideLayout && selectedId === null && gists[0]) setSelectedId(gists[0].id);
  }, [gists, selectedId, wideLayout]);

  return (
    <section className="@container/gists flex min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--background)_95%,transparent)]">
      <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b px-5">
        <div>
          <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
            {t("workspace.gists.eyebrow")}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em]">
            {t("workspace.nav.gists")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!desktopRuntime || result.isFetching}
            onClick={() => void result.refetch()}
          >
            {result.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {t("common.refresh")}
          </Button>
          <Button size="sm" disabled={!desktopRuntime} onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            {t("workspace.gists.newGist")}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "workspace-wide:flex workspace-wide:w-[320px] min-h-0 w-full shrink-0 flex-col border-r",
            selectedId === null ? "flex" : "hidden"
          )}
        >
          <div className="space-y-2 border-b p-3">
            <Tabs
              value={source}
              onValueChange={(value) => {
                setSource(value as GitHubGistSource);
                setSelectedId(null);
              }}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="mine">{t("workspace.gists.mine")}</TabsTrigger>
                <TabsTrigger value="starred">{t("workspace.gists.starredSource")}</TabsTrigger>
                <TabsTrigger value="public">{t("workspace.gists.publicSource")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={t("workspace.gists.search")}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
            {error ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>{t(gistsErrorTitle(error.code))}</EmptyTitle>
                  <EmptyDescription>
                    {error.code === "githubPermission"
                      ? t("workspace.gists.permissionDescription")
                      : error.message}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
                    <RefreshCw data-icon="inline-start" />
                    {t("common.retry")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : result.isPending ? (
              <GistListSkeleton />
            ) : gists.length === 0 ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileCode2 />
                  </EmptyMedia>
                  <EmptyTitle>
                    {t(query ? "workspace.gists.noMatches" : "workspace.gists.emptyTitle")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t(
                      query
                        ? "workspace.gists.noMatchesDescription"
                        : `workspace.gists.emptyDescription.${source}`
                    )}
                  </EmptyDescription>
                </EmptyHeader>
                {source === "mine" && !query ? (
                  <EmptyContent>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus data-icon="inline-start" />
                      {t("workspace.gists.newGist")}
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : (
              <div className="space-y-1.5 p-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-muted-foreground text-[10px]">
                    {t("workspace.gists.loadedCount", { count: gists.length })}
                  </span>
                  <Badge variant="outline" className="font-normal">
                    {t(`workspace.gists.sourceLabel.${source}`)}
                  </Badge>
                </div>
                {gists.map((gist) => (
                  <GistRow
                    key={gist.id}
                    gist={gist}
                    selected={selectedId === gist.id}
                    locale={i18n.language}
                    onSelect={() => setSelectedId(gist.id)}
                  />
                ))}
                {result.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={result.isFetchingNextPage}
                    onClick={() => void result.fetchNextPage()}
                  >
                    {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                    {t("workspace.gists.loadMore")}
                  </Button>
                ) : null}
              </div>
            )}
          </ScrollArea>
        </aside>

        <main
          className={cn(
            "workspace-wide:flex min-h-0 min-w-0 flex-1",
            selectedId === null ? "hidden" : "flex"
          )}
        >
          {selectedId ? (
            <GitHubGistDetail
              key={selectedId}
              gistId={selectedId}
              onBack={() => setSelectedId(null)}
              onDeleted={() => setSelectedId(null)}
              onForked={(gist) => {
                setSource("mine");
                setSelectedId(gist.id);
              }}
            />
          ) : (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Code2 />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.gists.selectTitle")}</EmptyTitle>
                <EmptyDescription>{t("workspace.gists.selectDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </main>
      </div>

      <GitHubGistEditorDialog
        open={createOpen}
        pending={createMutation.isPending}
        error={createMutation.error ? parseIpcError(createMutation.error).message : ""}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createMutation.reset();
        }}
        onCreate={(input) => createMutation.mutate(input)}
        onUpdate={() => undefined}
      />
    </section>
  );
}
