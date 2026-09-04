import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  ExternalLink,
  LayoutGrid,
  Lightbulb,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Settings2,
  Trash2,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubProjectDetail,
  GitHubProjectField,
  GitHubProjectFieldValue,
  GitHubProjectItem,
  GitHubProjectItemAction,
  GitHubProjectSort,
  GitHubProjectStateFilter,
  GitHubProjectSummary,
  GitHubProjectView,
} from "./github-data";
import { GitHubIssueDetail } from "./github-issue-detail";
import { formatIssueDate } from "./github-issue-shared";
import {
  addPersonalProjectItem,
  changePersonalProjectItem,
  createPersonalProject,
  deletePersonalProject,
  invalidatePersonalProjects,
  syncDeletedPersonalProject,
  syncPersonalProject,
  syncPersonalProjectItem,
  updatePersonalProject,
  updatePersonalProjectItem,
} from "./github-project-mutations";
import {
  AddProjectItemDialog,
  CreateProjectDialog,
  EditProjectDraftDialog,
  ProjectFieldEditDialog,
  ProjectSettingsDialog,
} from "./github-project-dialogs";
import {
  ProjectOptionBadge,
  ProjectVisibilityBadge,
  projectFieldValue,
  projectFieldValueText,
  projectItemIcon,
  projectItemRepository,
  projectItemTitle,
  projectOptionRail,
} from "./github-project-shared";
import { GitHubPullRequestDetail } from "./github-pull-request-detail";
import { personalProjectQueryOptions, personalProjectsQueryOptions } from "./github-queries";

function ProjectsListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b p-4">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="grid flex-1 grid-cols-3 gap-3 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-60 w-full" />
        ))}
      </div>
    </div>
  );
}

function ProjectListRow({
  project,
  selected,
  locale,
  onSelect,
}: {
  project: GitHubProjectSummary;
  selected: boolean;
  locale: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full justify-start rounded-lg border px-3 py-3 text-left whitespace-normal",
        selected
          ? "border-primary/30 bg-primary/8 hover:bg-primary/10"
          : "hover:border-border hover:bg-muted/35 border-transparent"
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{project.title}</span>
          {project.closed ? (
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 font-normal">
              {t("workspace.projects.closed")}
            </Badge>
          ) : null}
        </span>
        <span className="text-muted-foreground line-clamp-2 text-xs leading-5">
          {project.shortDescription || t("workspace.projects.noDescription")}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px]">
          <span>{t("workspace.projects.itemCount", { count: project.itemCount })}</span>
          <ProjectVisibilityBadge isPublic={project.public} />
          <span>{formatIssueDate(project.updatedAt, locale)}</span>
        </span>
      </span>
    </Button>
  );
}

function projectsErrorTitle(code: string) {
  if (code === "desktopOnly") return "workspace.projects.desktopOnlyTitle";
  if (code === "githubNotConnected") return "workspace.projects.connectTitle";
  if (code === "githubPermission") return "workspace.projects.permissionTitle";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.projects.loadFailed";
}

export function GitHubProjects() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const desktopRuntime = isTauri();
  const [state, setState] = useState<GitHubProjectStateFilter>("open");
  const [sort, setSort] = useState<GitHubProjectSort>("updated");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [wideLayout, setWideLayout] = useState(
    () => window.matchMedia("(min-width: 1180px)").matches
  );
  const result = useInfiniteQuery({
    ...personalProjectsQueryOptions({ state, query, sort }),
    enabled: desktopRuntime,
  });
  const projects = useMemo(
    () => result.data?.pages.flatMap((page) => page.projects) ?? [],
    [result.data]
  );
  const createMutation = useMutation({
    mutationFn: createPersonalProject,
    onSuccess: (project) => {
      setCreateOpen(false);
      setSelectedNumber(project.number);
      toast.success(t("workspace.projects.created"));
      void invalidatePersonalProjects(queryClient, project.number);
    },
  });
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.projects.desktopOnly") }
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
    if (wideLayout && selectedNumber === null && projects.length > 0) {
      setSelectedNumber(projects[0].number);
    }
  }, [projects, selectedNumber, wideLayout]);

  const submitSearch = () => setQuery(draftQuery.trim());

  return (
    <section className="harbor-content @container/projects flex min-w-0 flex-1 flex-col">
      <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b px-5">
        <div>
          <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
            {t("workspace.projects.eyebrow")}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em]">
            {t("workspace.nav.projects")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void result.refetch()}
            disabled={!desktopRuntime || result.isFetching}
          >
            {result.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {t("common.refresh")}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!desktopRuntime}>
            <Plus data-icon="inline-start" />
            {t("workspace.projects.newProject")}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "workspace-wide:flex workspace-wide:w-[310px] min-h-0 w-full shrink-0 flex-col border-r",
            selectedNumber === null ? "flex" : "hidden"
          )}
        >
          <form
            className="flex flex-col gap-2 border-b p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <div className="flex gap-2">
              <Input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.currentTarget.value)}
                placeholder={t("workspace.projects.searchProjects")}
                className="h-8 text-xs"
              />
              <Button
                type="submit"
                variant="outline"
                size="icon-sm"
                aria-label={t("common.search")}
              >
                <Search />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={state} onValueChange={(value) => setState(value as typeof state)}>
                <SelectTrigger size="sm" aria-label={t("workspace.projects.filterState")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="open">{t("workspace.projects.open")}</SelectItem>
                    <SelectItem value="closed">{t("workspace.projects.closed")}</SelectItem>
                    <SelectItem value="all">{t("workspace.projects.all")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger size="sm" aria-label={t("workspace.projects.sort")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="updated">{t("workspace.projects.sortUpdated")}</SelectItem>
                    <SelectItem value="created">{t("workspace.projects.sortCreated")}</SelectItem>
                    <SelectItem value="title">{t("workspace.projects.sortTitle")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </form>

          <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
            {result.isPending ? (
              <ProjectsListSkeleton />
            ) : error ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>{t(projectsErrorTitle(error.code))}</EmptyTitle>
                  <EmptyDescription>
                    {error.code === "githubPermission"
                      ? t("workspace.projects.permissionDescription")
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
            ) : projects.length === 0 ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LayoutGrid />
                  </EmptyMedia>
                  <EmptyTitle>{t("workspace.projects.emptyTitle")}</EmptyTitle>
                  <EmptyDescription>{t("workspace.projects.emptyDescription")}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus data-icon="inline-start" />
                    {t("workspace.projects.newProject")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col gap-1.5 p-2">
                {projects.map((project) => (
                  <ProjectListRow
                    key={project.id}
                    project={project}
                    selected={selectedNumber === project.number}
                    locale={i18n.language}
                    onSelect={() => setSelectedNumber(project.number)}
                  />
                ))}
                {result.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void result.fetchNextPage()}
                    disabled={result.isFetchingNextPage}
                  >
                    {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                    {t("workspace.projects.loadMoreProjects")}
                  </Button>
                ) : null}
              </div>
            )}
          </ScrollArea>
        </aside>

        <main
          className={cn(
            "workspace-wide:flex min-h-0 min-w-0 flex-1",
            selectedNumber === null ? "hidden" : "flex"
          )}
        >
          {selectedNumber === null ? (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutGrid />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.projects.selectTitle")}</EmptyTitle>
                <EmptyDescription>{t("workspace.projects.selectDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ProjectDetailWorkspace
              key={selectedNumber}
              number={selectedNumber}
              onBack={() => setSelectedNumber(null)}
              onDeleted={() => setSelectedNumber(null)}
            />
          )}
        </main>
      </div>

      <CreateProjectDialog
        open={createOpen}
        pending={createMutation.isPending}
        error={createMutation.error ? parseIpcError(createMutation.error).message : ""}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createMutation.reset();
        }}
        onSubmit={(title) => createMutation.mutate(title)}
      />
    </section>
  );
}

function ProjectDetailWorkspace({
  number,
  onBack,
  onDeleted,
}: {
  number: number;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedViewId, setSelectedViewId] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [selectedNativeItem, setSelectedNativeItem] = useState<GitHubProjectItem | null>(null);
  const [draftItem, setDraftItem] = useState<GitHubProjectItem | null>(null);
  const [fieldEditor, setFieldEditor] = useState<{
    item: GitHubProjectItem;
    field: GitHubProjectField;
  } | null>(null);
  const [itemAction, setItemAction] = useState<{
    item: GitHubProjectItem;
    action: GitHubProjectItemAction;
  } | null>(null);
  const metadataResult = useInfiniteQuery(
    personalProjectQueryOptions({ number, query: "", archived })
  );
  const metadata = metadataResult.data?.pages[0];
  const selectedView =
    metadata?.views.find((view) => view.id === selectedViewId) ?? metadata?.views[0];
  const effectiveQuery = [selectedView?.filter, itemQuery].filter(Boolean).join(" ");
  const result = useInfiniteQuery({
    ...personalProjectQueryOptions({ number, query: effectiveQuery, archived }),
    enabled: Boolean(metadata),
  });
  const detail = result.data?.pages[0] ?? metadata;
  const items = useMemo(() => {
    const pages = result.data?.pages ?? (metadata ? [metadata] : []);
    const seen = new Set<string>();
    return pages
      .flatMap((page) => page.items.items)
      .filter((item) => !seen.has(item.id) && seen.add(item.id));
  }, [metadata, result.data]);

  useEffect(() => {
    if (metadata?.views.length && !metadata.views.some((view) => view.id === selectedViewId)) {
      setSelectedViewId(metadata.views[0].id);
    }
  }, [metadata, selectedViewId]);

  const settingsMutation = useMutation({
    mutationFn: (update: Parameters<typeof updatePersonalProject>[1]) =>
      updatePersonalProject(number, update),
    onSuccess: (project) => {
      syncPersonalProject(queryClient, project);
      setSettingsOpen(false);
      toast.success(t("workspace.projects.updated"));
      void invalidatePersonalProjects(queryClient, number);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deletePersonalProject(number),
    onSuccess: () => {
      syncDeletedPersonalProject(queryClient, number);
      setDeleteProjectOpen(false);
      toast.success(t("workspace.projects.deleted"));
      onDeleted();
      void invalidatePersonalProjects(queryClient);
    },
  });
  const addMutation = useMutation({
    mutationFn: (addition: Parameters<typeof addPersonalProjectItem>[1]) =>
      addPersonalProjectItem(number, addition),
    onSuccess: () => {
      setAddOpen(false);
      toast.success(t("workspace.projects.itemAdded"));
      void invalidatePersonalProjects(queryClient, number);
    },
  });
  const itemUpdateMutation = useMutation({
    mutationFn: ({
      item,
      update,
    }: {
      item: GitHubProjectItem;
      update: Parameters<typeof updatePersonalProjectItem>[2];
    }) => updatePersonalProjectItem(number, item.id, update),
    onSuccess: (item) => {
      syncPersonalProjectItem(queryClient, number, item);
      setDraftItem(null);
      setFieldEditor(null);
      toast.success(t("workspace.projects.itemUpdated"));
      void invalidatePersonalProjects(queryClient, number);
    },
  });
  const itemActionMutation = useMutation({
    mutationFn: ({ item, action }: NonNullable<typeof itemAction>) =>
      changePersonalProjectItem(number, item.id, action).then((result) => ({
        result,
        item,
        action,
      })),
    onSuccess: ({ result, item, action }) => {
      syncPersonalProjectItem(queryClient, number, result, result ? undefined : item.id);
      setItemAction(null);
      toast.success(
        t(
          action === "delete"
            ? "workspace.projects.itemRemoved"
            : action === "archive"
              ? "workspace.projects.itemArchived"
              : "workspace.projects.itemRestored"
        )
      );
      void invalidatePersonalProjects(queryClient, number);
    },
  });

  if (selectedNativeItem?.content.kind === "issue") {
    const content = selectedNativeItem.content;
    return (
      <GitHubIssueDetail
        repository={content.repository}
        issueNumber={content.number}
        onBack={() => setSelectedNativeItem(null)}
        backLabel={t("workspace.projects.back")}
      />
    );
  }
  if (selectedNativeItem?.content.kind === "pullRequest") {
    const content = selectedNativeItem.content;
    return (
      <GitHubPullRequestDetail
        repository={content.repository}
        pullRequestNumber={content.number}
        onBack={() => setSelectedNativeItem(null)}
        backLabel={t("workspace.projects.back")}
      />
    );
  }

  if ((metadataResult.isPending || (metadata && result.isPending)) && !detail) {
    return <ProjectDetailSkeleton />;
  }

  const rawError = metadataResult.error ?? result.error;
  if (!detail || rawError) {
    const error = parseIpcError(rawError);
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t(projectsErrorTitle(error.code))}</EmptyTitle>
          <EmptyDescription>
            {error.code === "githubPermission"
              ? t("workspace.projects.permissionDescription")
              : error.message}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" />
              {t("workspace.projects.back")}
            </Button>
            <Button variant="outline" onClick={() => void metadataResult.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("common.retry")}
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  const project = detail.project;
  const activeView = detail.views.find((view) => view.id === selectedView?.id) ?? detail.views[0];
  const openItem = (item: GitHubProjectItem) => {
    if (item.content.kind === "draftIssue") setDraftItem(item);
    else if (item.content.kind !== "redacted") setSelectedNativeItem(item);
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("workspace.projects.back")}
            onClick={onBack}
            className="workspace-wide:hidden"
          >
            <ArrowLeft />
          </Button>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h2 className="truncate text-base font-semibold tracking-[-0.02em]">
                {project.title}
              </h2>
              <ProjectVisibilityBadge isPublic={project.public} />
              {project.closed ? (
                <Badge variant="secondary">{t("workspace.projects.closed")}</Badge>
              ) : null}
              <Badge variant="outline" className="font-normal">
                #{project.number}
              </Badge>
            </div>
            <p className="text-muted-foreground line-clamp-2 max-w-[72ch] text-xs leading-5">
              {project.shortDescription || t("workspace.projects.noDescription")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!project.viewerCanUpdate}
          >
            <Plus data-icon="inline-start" />
            {t("workspace.projects.addItem")}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("workspace.projects.openOnGitHub")}
            onClick={() => void openExternalUrl(project.url)}
          >
            <ExternalLink />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("workspace.projects.projectActions")}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => setSettingsOpen(true)}
                  disabled={!project.viewerCanUpdate}
                >
                  <Settings2 />
                  {t("workspace.projects.settingsTitle")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => setDeleteProjectOpen(true)}
                  disabled={!project.viewerCanUpdate}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 />
                  {t("workspace.projects.deleteProject")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {detail.views.length > 0 ? (
        <div className="shrink-0 border-b px-4">
          <Tabs value={activeView?.id} onValueChange={setSelectedViewId}>
            <TabsList variant="line" className="h-11 max-w-full justify-start overflow-x-auto">
              {detail.views.map((view) => {
                const Icon =
                  view.layout === "board"
                    ? LayoutGrid
                    : view.layout === "roadmap"
                      ? CalendarDays
                      : Rows3;
                return (
                  <TabsTrigger key={view.id} value={view.id}>
                    <Icon data-icon="inline-start" />
                    {view.name}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      <form
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          setItemQuery(draftQuery.trim());
        }}
      >
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.currentTarget.value)}
            placeholder={t("workspace.projects.searchItems")}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          <ListFilter data-icon="inline-start" />
          {t("workspace.projects.filter")}
        </Button>
        <Select
          value={archived ? "archived" : "active"}
          onValueChange={(value) => setArchived(value === "archived")}
        >
          <SelectTrigger size="sm" className="w-32" aria-label={t("workspace.projects.itemState")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="active">{t("workspace.projects.activeItems")}</SelectItem>
              <SelectItem value="archived">{t("workspace.projects.archivedItems")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {t("workspace.projects.itemCount", { count: detail.items.totalCount })}
        </span>
      </form>

      {items.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lightbulb />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.projects.noItemsTitle")}</EmptyTitle>
            <EmptyDescription>{t("workspace.projects.noItemsDescription")}</EmptyDescription>
          </EmptyHeader>
          {!archived && project.viewerCanUpdate ? (
            <EmptyContent>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus data-icon="inline-start" />
                {t("workspace.projects.addItem")}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : activeView?.layout === "board" ? (
        <ProjectBoard
          detail={detail}
          view={activeView}
          items={items}
          onOpenItem={openItem}
          onEditField={(item, field) => setFieldEditor({ item, field })}
          onAction={(item, action) => setItemAction({ item, action })}
        />
      ) : activeView?.layout === "roadmap" ? (
        <ProjectRoadmap
          detail={detail}
          view={activeView}
          items={items}
          onOpenItem={openItem}
          onAction={(item, action) => setItemAction({ item, action })}
        />
      ) : (
        <ProjectTable
          detail={detail}
          view={activeView}
          items={items}
          onOpenItem={openItem}
          onEditField={(item, field) => setFieldEditor({ item, field })}
          onAction={(item, action) => setItemAction({ item, action })}
        />
      )}

      {result.hasNextPage ? (
        <div className="flex shrink-0 justify-center border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void result.fetchNextPage()}
            disabled={result.isFetchingNextPage}
          >
            {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
            {t("workspace.projects.loadMoreItems")}
          </Button>
        </div>
      ) : null}

      <ProjectSettingsDialog
        project={project}
        readme={detail.readme}
        open={settingsOpen}
        pending={settingsMutation.isPending}
        error={settingsMutation.error ? parseIpcError(settingsMutation.error).message : ""}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) settingsMutation.reset();
        }}
        onSubmit={(update) => settingsMutation.mutate(update)}
      />
      <AddProjectItemDialog
        open={addOpen}
        pending={addMutation.isPending}
        error={addMutation.error ? parseIpcError(addMutation.error).message : ""}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) addMutation.reset();
        }}
        onSubmit={(addition) => addMutation.mutate(addition)}
      />
      {draftItem ? (
        <EditProjectDraftDialog
          item={draftItem}
          open
          pending={itemUpdateMutation.isPending}
          error={itemUpdateMutation.error ? parseIpcError(itemUpdateMutation.error).message : ""}
          onOpenChange={(open) => {
            if (!open) {
              setDraftItem(null);
              itemUpdateMutation.reset();
            }
          }}
          onSubmit={(update) => itemUpdateMutation.mutate({ item: draftItem, update })}
        />
      ) : null}
      {fieldEditor ? (
        <ProjectFieldEditDialog
          field={fieldEditor.field}
          item={fieldEditor.item}
          open
          pending={itemUpdateMutation.isPending}
          error={itemUpdateMutation.error ? parseIpcError(itemUpdateMutation.error).message : ""}
          onOpenChange={(open) => {
            if (!open) {
              setFieldEditor(null);
              itemUpdateMutation.reset();
            }
          }}
          onSubmit={(update) => itemUpdateMutation.mutate({ item: fieldEditor.item, update })}
        />
      ) : null}

      <AlertDialog open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.projects.deleteProjectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.projects.deleteProjectDescription", { title: project.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{parseIpcError(deleteMutation.error).message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {t("workspace.projects.deleteProject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProjectItemActionDialog
        target={itemAction}
        pending={itemActionMutation.isPending}
        error={itemActionMutation.error ? parseIpcError(itemActionMutation.error).message : ""}
        onOpenChange={(open) => {
          if (!open) {
            setItemAction(null);
            itemActionMutation.reset();
          }
        }}
        onConfirm={() => itemAction && itemActionMutation.mutate(itemAction)}
      />
    </section>
  );
}

type ProjectItemsProps = {
  detail: GitHubProjectDetail;
  view?: GitHubProjectView;
  items: GitHubProjectItem[];
  onOpenItem: (item: GitHubProjectItem) => void;
  onAction: (item: GitHubProjectItem, action: GitHubProjectItemAction) => void;
};

type ProjectEditableItemsProps = ProjectItemsProps & {
  onEditField: (item: GitHubProjectItem, field: GitHubProjectField) => void;
};

function ProjectTable({
  detail,
  view,
  items,
  onOpenItem,
  onEditField,
  onAction,
}: ProjectEditableItemsProps) {
  const { t } = useTranslation();
  const visibleFields = projectVisibleFields(detail, view);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <Table className="min-w-[720px] text-xs">
        <TableHeader className="bg-background/95 sticky top-0">
          <TableRow>
            <TableHead className="min-w-72 pl-4">{t("workspace.projects.fields.title")}</TableHead>
            {visibleFields.map((field) => (
              <TableHead key={field.id} className="min-w-36">
                {field.name}
              </TableHead>
            ))}
            <TableHead className="w-12">
              <span className="sr-only">{t("workspace.projects.itemActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const Icon = projectItemIcon(item);
            return (
              <TableRow key={item.id}>
                <TableCell className="max-w-[420px] pl-4 whitespace-normal">
                  <Button
                    variant="ghost"
                    onClick={() => onOpenItem(item)}
                    disabled={item.content.kind === "redacted"}
                    className="h-auto w-full justify-start gap-2 px-1 py-1 text-left whitespace-normal"
                  >
                    <Icon data-icon="inline-start" />
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="line-clamp-2 font-medium">
                        {projectItemTitle(item) || t("workspace.projects.restrictedItem")}
                      </span>
                      {projectItemRepository(item) ? (
                        <span className="text-muted-foreground text-[10px]">
                          {projectItemRepository(item)}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                </TableCell>
                {visibleFields.map((field) => (
                  <TableCell key={field.id} className="max-w-64 whitespace-normal">
                    <ProjectFieldCell
                      field={field}
                      item={item}
                      onEdit={() => onEditField(item, field)}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <ProjectItemMenu item={item} onAction={onAction} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function ProjectBoard({
  detail,
  view,
  items,
  onOpenItem,
  onEditField,
  onAction,
}: ProjectEditableItemsProps) {
  const { t } = useTranslation();
  const groupField = detail.fields.find((field) => field.id === view?.groupByFieldIds[0]);
  if (!groupField || !["singleSelect", "iteration"].includes(groupField.dataType)) {
    return (
      <ProjectTable
        detail={detail}
        view={view}
        items={items}
        onOpenItem={onOpenItem}
        onEditField={onEditField}
        onAction={onAction}
      />
    );
  }
  const groups =
    groupField.dataType === "singleSelect"
      ? groupField.options.map((option) => ({
          id: option.id,
          name: option.name,
          color: option.color,
        }))
      : groupField.iterations.map((iteration) => ({
          id: iteration.id,
          name: iteration.title,
          color: iteration.completed ? "gray" : "blue",
        }));
  const columns = [
    ...groups,
    { id: "__unset__", name: t("workspace.projects.noValue"), color: "gray" },
  ];
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex min-h-full min-w-max items-start gap-3 p-4">
        {columns.map((group) => {
          const groupItems = items.filter(
            (item) => projectItemGroup(item, groupField) === group.id
          );
          return (
            <section key={group.id} className="flex w-[282px] shrink-0 flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <span className={cn("h-3 w-1 rounded-full", projectOptionRail(group.color))} />
                <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{group.name}</h3>
                <span className="text-muted-foreground text-[10px] tabular-nums">
                  {groupItems.length}
                </span>
              </div>
              <div className="bg-muted/20 ring-border/60 flex flex-col gap-2 rounded-xl p-2 ring-1">
                {groupItems.length === 0 ? (
                  <div className="text-muted-foreground px-2 py-8 text-center text-[11px]">
                    {t("workspace.projects.emptyColumn")}
                  </div>
                ) : (
                  groupItems.map((item) => {
                    const Icon = projectItemIcon(item);
                    return (
                      <Card key={item.id} className="bg-card/85 gap-2 rounded-lg py-3 shadow-none">
                        <CardHeader className="px-3">
                          <CardTitle className="text-xs leading-5 font-medium">
                            <Button
                              variant="ghost"
                              onClick={() => onOpenItem(item)}
                              disabled={item.content.kind === "redacted"}
                              className="h-auto w-full justify-start gap-2 px-0 py-0 text-left whitespace-normal hover:bg-transparent"
                            >
                              <Icon data-icon="inline-start" />
                              <span className="line-clamp-3">
                                {projectItemTitle(item) || t("workspace.projects.restrictedItem")}
                              </span>
                            </Button>
                          </CardTitle>
                          <CardDescription className="truncate text-[10px]">
                            {projectItemRepository(item) || t("workspace.projects.draftIssue")}
                          </CardDescription>
                          <CardAction>
                            <ProjectItemMenu item={item} onAction={onAction} />
                          </CardAction>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-1 px-3">
                          {projectVisibleFields(detail, view)
                            .filter((field) => field.id !== groupField.id)
                            .slice(0, 3)
                            .map((field) => {
                              const text = projectFieldValueText(projectFieldValue(item, field.id));
                              return text ? (
                                <Badge
                                  key={field.id}
                                  variant="outline"
                                  className="max-w-full truncate font-normal"
                                >
                                  {text}
                                </Badge>
                              ) : null;
                            })}
                          {groupField.editable ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => onEditField(item, groupField)}
                              className="ml-auto"
                            >
                              <Pencil data-icon="inline-start" />
                              {t("workspace.projects.changeStatus")}
                            </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function ProjectRoadmap({ detail, view, items, onOpenItem, onAction }: ProjectItemsProps) {
  const { t } = useTranslation();
  const dateFields = projectVisibleFields(detail, view).filter((field) =>
    ["date", "iteration"].includes(field.dataType)
  );
  const dateField = dateFields[0];
  const sorted = [...items].sort((left, right) =>
    projectFieldValueText(projectFieldValue(left, dateField?.id ?? "")).localeCompare(
      projectFieldValueText(projectFieldValue(right, dateField?.id ?? ""))
    )
  );
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-[980px] flex-col p-4">
        {sorted.map((item) => {
          const Icon = projectItemIcon(item);
          const date = dateField
            ? projectFieldValueText(projectFieldValue(item, dateField.id))
            : "";
          return (
            <div
              key={item.id}
              className="grid grid-cols-[120px_14px_minmax(0,1fr)_36px] items-stretch border-b last:border-b-0"
            >
              <div className="text-muted-foreground flex items-center px-2 py-4 text-[11px] tabular-nums">
                {date || t("workspace.projects.unscheduled")}
              </div>
              <div className="relative flex justify-center">
                <span className="bg-border absolute inset-y-0 w-px" />
                <span className="bg-primary ring-background relative mt-[22px] size-2 rounded-full ring-4" />
              </div>
              <Button
                variant="ghost"
                onClick={() => onOpenItem(item)}
                disabled={item.content.kind === "redacted"}
                className="h-auto min-w-0 justify-start gap-2 rounded-none px-3 py-4 text-left whitespace-normal"
              >
                <Icon data-icon="inline-start" />
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <span className="line-clamp-2 text-xs font-medium">
                    {projectItemTitle(item) || t("workspace.projects.restrictedItem")}
                  </span>
                  {projectItemRepository(item) ? (
                    <span className="text-muted-foreground text-[10px]">
                      {projectItemRepository(item)}
                    </span>
                  ) : null}
                </span>
              </Button>
              <div className="flex items-center">
                <ProjectItemMenu item={item} onAction={onAction} />
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function ProjectFieldCell({
  field,
  item,
  onEdit,
}: {
  field: GitHubProjectField;
  item: GitHubProjectItem;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const value = projectFieldValue(item, field.id);
  const content = <ProjectFieldValueDisplay value={value} />;
  return field.editable ? (
    <Button
      variant="ghost"
      onClick={onEdit}
      className="h-auto min-h-7 max-w-full justify-start px-1.5 py-1 text-left whitespace-normal"
      aria-label={t("workspace.projects.editField", { field: field.name })}
    >
      {content}
    </Button>
  ) : (
    <div className="px-1.5 py-1">{content}</div>
  );
}

function ProjectFieldValueDisplay({ value }: { value: GitHubProjectFieldValue | undefined }) {
  const { t } = useTranslation();
  if (!value)
    return <span className="text-muted-foreground/60">{t("workspace.projects.noValue")}</span>;
  if (value.kind === "singleSelect") {
    return (
      <ProjectOptionBadge
        option={{
          id: value.optionId,
          name: value.name,
          color: value.color,
          description: "",
        }}
      />
    );
  }
  if (value.kind === "multiSelect") {
    return (
      <span className="flex flex-wrap gap-1">
        {value.options.map((option) => (
          <ProjectOptionBadge key={option.id} option={option} />
        ))}
      </span>
    );
  }
  if (value.kind === "labels") {
    return (
      <span className="flex flex-wrap gap-1">
        {value.labels.map((label) => (
          <Badge key={`${label.name}-${label.color}`} variant="outline" className="font-normal">
            {label.name}
          </Badge>
        ))}
      </span>
    );
  }
  return <span className="line-clamp-2">{projectFieldValueText(value)}</span>;
}

function ProjectItemMenu({
  item,
  onAction,
}: {
  item: GitHubProjectItem;
  onAction: (item: GitHubProjectItem, action: GitHubProjectItemAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={t("workspace.projects.itemActions")}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => onAction(item, item.archived ? "unarchive" : "archive")}
          >
            <Archive />
            {t(item.archived ? "workspace.projects.restoreItem" : "workspace.projects.archiveItem")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => onAction(item, "delete")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 />
            {t("workspace.projects.removeItem")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectItemActionDialog({
  target,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  target: { item: GitHubProjectItem; action: GitHubProjectItemAction } | null;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const action = target?.action;
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(`workspace.projects.itemActionTitle.${action ?? "archive"}`)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(`workspace.projects.itemActionDescription.${action ?? "archive"}`, {
              title: target ? projectItemTitle(target.item) : "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant={action === "delete" ? "destructive" : "default"}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={pending}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : action === "delete" ? (
              <Trash2 data-icon="inline-start" />
            ) : (
              <Archive data-icon="inline-start" />
            )}
            {t(`workspace.projects.itemAction.${action ?? "archive"}`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function projectVisibleFields(detail: GitHubProjectDetail, view?: GitHubProjectView) {
  const ids = view?.visibleFieldIds ?? [];
  const fields = ids.length
    ? ids.flatMap((id) => detail.fields.filter((field) => field.id === id))
    : detail.fields;
  return fields.filter((field) => field.dataType !== "title");
}

function projectItemGroup(item: GitHubProjectItem, field: GitHubProjectField) {
  const value = projectFieldValue(item, field.id);
  if (value?.kind === "singleSelect") return value.optionId;
  if (value?.kind === "iteration") return value.iterationId;
  return "__unset__";
}
