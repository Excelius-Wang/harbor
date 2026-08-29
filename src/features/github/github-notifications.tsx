import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import {
  Archive,
  Bell,
  CheckCheck,
  CircleAlert,
  CircleDot,
  ExternalLink,
  GitCommitHorizontal,
  GitPullRequest,
  Github,
  MailOpen,
  MessageCircle,
  PlayCircle,
  RefreshCw,
  Rocket,
  ShieldAlert,
  UserPlus,
  type LucideIcon,
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubNotification,
  GitHubNotificationSubjectKind,
  GitHubRepository,
} from "./github-data";
import { GitHubIssueDetail } from "./github-issue-detail";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import {
  invalidateGitHubNotifications,
  markAllGitHubNotificationsRead,
  removeGitHubNotificationFromCache,
  updateGitHubNotification,
  type GitHubNotificationMutationTarget,
} from "./github-notification-mutations";
import { notificationCanOpenInApp } from "./github-notification-target";
import { GitHubPullRequestDetail } from "./github-pull-request-detail";
import { notificationsQueryOptions } from "./github-queries";

const GitHubDiscussionDetail = lazy(() =>
  import("./github-discussion-detail").then((module) => ({
    default: module.GitHubDiscussionDetail,
  }))
);

const GitHubActionsRunDetail = lazy(() =>
  import("./github-actions-run-detail").then((module) => ({
    default: module.GitHubActionsRunDetail,
  }))
);

const GitHubCheckSuiteDetail = lazy(() =>
  import("./github-check-suite-detail").then((module) => ({
    default: module.GitHubCheckSuiteDetail,
  }))
);

const GitHubCodeView = lazy(() =>
  import("./github-code-view").then((module) => ({
    default: module.GitHubCodeView,
  }))
);

const GitHubReleaseDetail = lazy(() =>
  import("./github-release-detail").then((module) => ({
    default: module.GitHubReleaseDetail,
  }))
);

const GitHubSecurityAlertDetail = lazy(() =>
  import("./github-security-detail").then((module) => ({
    default: module.GitHubSecurityAlertDetail,
  }))
);

const GitHubRepositoryInvitations = lazy(() =>
  import("./github-repository-invitations-view").then((module) => ({
    default: module.GitHubRepositoryInvitations,
  }))
);

type NotificationScope = "all" | "participating";

const notificationIcons: Record<GitHubNotificationSubjectKind, LucideIcon> = {
  issue: CircleDot,
  pullRequest: GitPullRequest,
  discussion: MessageCircle,
  commit: GitCommitHorizontal,
  release: Rocket,
  checkSuite: CheckCheck,
  workflowRun: PlayCircle,
  dependabotAlert: ShieldAlert,
  codeScanningAlert: ShieldAlert,
  secretScanningAlert: ShieldAlert,
  securityAlert: ShieldAlert,
  repositoryInvitation: UserPlus,
  other: Bell,
};

function NotificationSkeletons() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[28px_minmax(0,1fr)_68px] gap-3 border-b px-4 py-3.5"
        >
          <Skeleton className="size-7 rounded-md" />
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

function notificationErrorTitle(code: string) {
  if (code === "desktopOnly") return "workspace.notifications.desktopOnlyTitle";
  if (code === "githubNotConnected") return "workspace.notifications.connectTitle";
  if (code === "githubPermission") return "workspace.notifications.permissionDenied";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.notifications.loadFailed";
}

function NotificationRow({
  notification,
  locale,
  pending,
  onOpen,
  onRead,
  onDone,
}: {
  notification: GitHubNotification;
  locale: string;
  pending: GitHubNotificationMutationTarget | null;
  onOpen: () => void;
  onRead: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const Icon = notificationIcons[notification.subject.kind];
  const threadPending = pending?.threadId === notification.id;

  return (
    <article className="group grid min-w-0 grid-cols-[28px_minmax(0,1fr)_auto] gap-3 border-b px-4 py-3.5">
      <span className="border-border bg-muted/40 text-muted-foreground grid size-7 place-items-center rounded-md border">
        <Icon className="size-3.5" />
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        className="h-auto min-w-0 justify-start rounded-none p-0 text-left whitespace-normal hover:bg-transparent"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-normal">
            <span className="text-foreground/75 truncate font-medium">
              {notification.repository.fullName}
            </span>
            <Badge variant="outline" className="h-5 rounded-md px-1.5 font-normal">
              {t(`workspace.notifications.kinds.${notification.subject.kind}`)}
            </Badge>
          </span>
          <span className="text-foreground line-clamp-2 text-[13px] leading-5 font-medium">
            {notification.subject.title}
          </span>
          <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-normal">
            <span>
              {t(`workspace.notifications.reasons.${notification.reason}`, {
                defaultValue: notification.reason,
              })}
            </span>
            <time>{formatIssueDate(notification.updatedAt, locale)}</time>
            <span>
              {t(
                notificationCanOpenInApp(notification)
                  ? "workspace.notifications.opensInHarbor"
                  : "workspace.notifications.opensOnGitHub"
              )}
            </span>
          </span>
        </span>
      </Button>
      <div className="flex items-start gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("workspace.notifications.markRead")}
              disabled={threadPending}
              onClick={onRead}
            >
              {threadPending && pending.action === "read" ? <Spinner /> : <MailOpen />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.notifications.markRead")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("workspace.notifications.markDone")}
              disabled={threadPending}
              onClick={onDone}
            >
              {threadPending && pending.action === "done" ? <Spinner /> : <Archive />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.notifications.markDone")}</TooltipContent>
        </Tooltip>
        {!notificationCanOpenInApp(notification) ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("workspace.openOnGitHub")}
                onClick={() => void openExternalUrl(notification.subject.url)}
              >
                <ExternalLink />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("workspace.openOnGitHub")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </article>
  );
}

export function GitHubNotifications({
  onSelectRepository,
}: {
  onSelectRepository: (repository: GitHubRepository | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const desktopRuntime = isTauri();
  const [scope, setScope] = useState<NotificationScope>("all");
  const [page, setPage] = useState(1);
  const [selectedNotification, setSelectedNotification] = useState<GitHubNotification | null>(null);
  const [showRepositoryInvitations, setShowRepositoryInvitations] = useState(false);
  const [doneCandidate, setDoneCandidate] = useState<GitHubNotification | null>(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const result = useQuery({
    ...notificationsQueryOptions({ participating: scope === "participating", page }),
    enabled: desktopRuntime,
    placeholderData: (previous) => previous,
  });
  const data = result.data;
  const error = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.notifications.desktopOnly") }
    : !data && result.error
      ? parseIpcError(result.error)
      : null;
  const supplementalError = data && result.error ? parseIpcError(result.error) : null;

  const updateMutation = useMutation({
    mutationFn: updateGitHubNotification,
    onSuccess: (_, target) => {
      removeGitHubNotificationFromCache(queryClient, target.threadId);
      toast.success(
        t(
          target.action === "done"
            ? "workspace.notifications.doneSuccess"
            : "workspace.notifications.readSuccess"
        )
      );
      void invalidateGitHubNotifications(queryClient);
    },
    onError: (reason) => {
      const parsed = parseIpcError(reason);
      toast.error(t("workspace.notifications.updateFailed"), {
        description:
          parsed.code === "githubPermission"
            ? t("workspace.notifications.writePermissionDenied")
            : parsed.message,
      });
    },
  });
  const markAllMutation = useMutation({
    mutationFn: markAllGitHubNotificationsRead,
    onSuccess: () => {
      toast.success(t("workspace.notifications.markAllAccepted"));
      void invalidateGitHubNotifications(queryClient);
    },
    onError: (reason) => {
      const parsed = parseIpcError(reason);
      toast.error(t("workspace.notifications.markAllFailed"), {
        description:
          parsed.code === "githubPermission"
            ? t("workspace.notifications.writePermissionDenied")
            : parsed.message,
      });
    },
  });

  useEffect(() => {
    onSelectRepository(selectedNotification?.repository ?? null);
  }, [onSelectRepository, selectedNotification]);

  useEffect(() => () => onSelectRepository(null), [onSelectRepository]);

  const markRead = (notification: GitHubNotification) => {
    updateMutation.mutate({ threadId: notification.id, action: "read" });
  };

  const openNotification = (notification: GitHubNotification) => {
    markRead(notification);
    if (notificationCanOpenInApp(notification)) {
      setSelectedNotification(notification);
    } else {
      void openExternalUrl(notification.subject.url);
    }
  };

  if (showRepositoryInvitations || selectedNotification?.subject.kind === "repositoryInvitation") {
    return (
      <Suspense fallback={<NotificationSkeletons />}>
        <GitHubRepositoryInvitations
          highlightRepositoryId={selectedNotification?.repository.id}
          onBack={() => {
            setShowRepositoryInvitations(false);
            setSelectedNotification(null);
          }}
          onResolved={(invitation) => {
            if (selectedNotification?.repository.id === invitation.repository.id) {
              setSelectedNotification(null);
            }
          }}
        />
      </Suspense>
    );
  }

  if (selectedNotification?.subject.kind === "issue" && selectedNotification.subject.number) {
    return (
      <GitHubIssueDetail
        repository={selectedNotification.repository}
        issueNumber={selectedNotification.subject.number}
        backLabel={t("workspace.notifications.back")}
        onBack={() => setSelectedNotification(null)}
      />
    );
  }

  if (selectedNotification?.subject.kind === "pullRequest" && selectedNotification.subject.number) {
    return (
      <GitHubPullRequestDetail
        repository={selectedNotification.repository}
        pullRequestNumber={selectedNotification.subject.number}
        backLabel={t("workspace.notifications.back")}
        onBack={() => setSelectedNotification(null)}
      />
    );
  }

  if (selectedNotification?.subject.kind === "discussion" && selectedNotification.subject.number) {
    return (
      <Suspense fallback={<NotificationSkeletons />}>
        <GitHubDiscussionDetail
          repository={selectedNotification.repository}
          discussionNumber={selectedNotification.subject.number}
          backLabel={t("workspace.notifications.back")}
          onBack={() => setSelectedNotification(null)}
        />
      </Suspense>
    );
  }

  if (selectedNotification?.subject.kind === "release" && selectedNotification.subject.releaseId) {
    return (
      <Suspense fallback={<NotificationSkeletons />}>
        <GitHubReleaseDetail
          repository={selectedNotification.repository}
          releaseId={selectedNotification.subject.releaseId}
          backLabel={t("workspace.notifications.back")}
          onBack={() => setSelectedNotification(null)}
        />
      </Suspense>
    );
  }

  if (
    selectedNotification?.subject.kind === "workflowRun" &&
    selectedNotification.subject.workflowRunId
  ) {
    return (
      <Suspense fallback={<NotificationSkeletons />}>
        <GitHubActionsRunDetail
          repository={selectedNotification.repository}
          runId={selectedNotification.subject.workflowRunId}
          backLabel={t("workspace.notifications.back")}
          onBack={() => setSelectedNotification(null)}
        />
      </Suspense>
    );
  }

  if (
    selectedNotification?.subject.kind === "checkSuite" &&
    selectedNotification.subject.checkSuiteId
  ) {
    return (
      <Suspense fallback={<NotificationSkeletons />}>
        <GitHubCheckSuiteDetail
          repository={selectedNotification.repository}
          checkSuiteId={selectedNotification.subject.checkSuiteId}
          backLabel={t("workspace.notifications.back")}
          onBack={() => setSelectedNotification(null)}
        />
      </Suspense>
    );
  }

  if (selectedNotification?.subject.kind === "commit" && selectedNotification.subject.commitSha) {
    return (
      <Suspense fallback={<NotificationSkeletons />}>
        <GitHubCodeView
          key={selectedNotification.id}
          repository={selectedNotification.repository}
          initialCommitSha={selectedNotification.subject.commitSha}
          backLabel={t("workspace.notifications.back")}
          onBack={() => setSelectedNotification(null)}
        />
      </Suspense>
    );
  }

  if (
    selectedNotification?.subject.number &&
    (selectedNotification.subject.kind === "dependabotAlert" ||
      selectedNotification.subject.kind === "codeScanningAlert" ||
      selectedNotification.subject.kind === "secretScanningAlert")
  ) {
    const securityKind =
      selectedNotification.subject.kind === "dependabotAlert"
        ? "dependabot"
        : selectedNotification.subject.kind === "codeScanningAlert"
          ? "codeScanning"
          : "secretScanning";
    return (
      <Suspense fallback={<NotificationSkeletons />}>
        <GitHubSecurityAlertDetail
          repository={selectedNotification.repository}
          kind={securityKind}
          alertNumber={selectedNotification.subject.number}
          backLabel={t("workspace.notifications.back")}
          onBack={() => setSelectedNotification(null)}
        />
      </Suspense>
    );
  }

  const pendingTarget = updateMutation.isPending ? updateMutation.variables : null;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--background)_95%,transparent)]">
      <header className="h-[74px] shrink-0 border-b border-white/[0.075] px-5">
        <div className="mx-auto flex h-full w-full max-w-[1120px] items-center justify-between gap-4">
          <div>
            <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
              {t("workspace.notifications.eyebrow")}
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em]">
              {t("workspace.nav.notifications")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedNotification(null);
                setShowRepositoryInvitations(true);
              }}
            >
              <UserPlus data-icon="inline-start" />
              {t("workspace.notifications.invitations.open")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMarkAllOpen(true)}
              disabled={markAllMutation.isPending || !data?.notifications.length}
            >
              {markAllMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CheckCheck data-icon="inline-start" />
              )}
              {t("workspace.notifications.markAllRead")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void result.refetch()}
              disabled={result.isFetching || !desktopRuntime}
            >
              {result.isFetching ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {t("workspace.notifications.refresh")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 flex-col border-x border-white/[0.055]">
        <Tabs
          value={scope}
          onValueChange={(value) => {
            setScope(value as NotificationScope);
            setPage(1);
          }}
          className="gap-0"
        >
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.065] px-4">
            <TabsList variant="line" className="h-11 gap-5 p-0">
              <TabsTrigger value="all" className="px-1.5 text-xs">
                <Bell /> {t("workspace.notifications.all")}
              </TabsTrigger>
              <TabsTrigger value="participating" className="px-1.5 text-xs">
                <MessageCircle /> {t("workspace.notifications.participating")}
              </TabsTrigger>
            </TabsList>
            <span className="text-muted-foreground flex items-center gap-2 text-[10px]">
              {result.isFetching && data ? <RefreshCw className="size-3 animate-spin" /> : null}
              {data
                ? t("workspace.notifications.pageCount", { count: data.notifications.length })
                : null}
            </span>
          </div>
        </Tabs>

        {supplementalError ? (
          <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 px-4 py-2">
            <CircleAlert />
            <AlertDescription className="flex min-w-0 items-center gap-3 text-[11px]">
              <span className="min-w-0 flex-1 truncate">{supplementalError.message}</span>
              <Button variant="ghost" size="xs" onClick={() => void result.refetch()}>
                {t("workspace.repositories.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          {result.isPending && !data ? (
            <NotificationSkeletons />
          ) : error ? (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {error.code === "githubNotConnected" ? <Github /> : <Bell />}
                </EmptyMedia>
                <EmptyTitle>{t(notificationErrorTitle(error.code))}</EmptyTitle>
                <EmptyDescription>{error.message}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void result.refetch()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : data?.notifications.length ? (
            <div className={cn("transition-opacity", result.isFetching && "opacity-60")}>
              {data.notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  locale={i18n.language}
                  pending={pendingTarget}
                  onOpen={() => openNotification(notification)}
                  onRead={() => markRead(notification)}
                  onDone={() => setDoneCandidate(notification)}
                />
              ))}
            </div>
          ) : (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCheck />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.notifications.empty")}</EmptyTitle>
                <EmptyDescription>
                  {t(
                    scope === "participating"
                      ? "workspace.notifications.emptyParticipating"
                      : "workspace.notifications.emptyAll"
                  )}
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
              ariaLabel={t("workspace.notifications.pagination")}
            />
          ) : null}
        </ScrollArea>
      </div>

      <AlertDialog
        open={Boolean(doneCandidate)}
        onOpenChange={(open) => {
          if (!open) setDoneCandidate(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.notifications.doneTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.notifications.doneDescription", {
                title: doneCandidate?.subject.title,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>
              {t("workspace.notifications.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={updateMutation.isPending || !doneCandidate}
              onClick={(event) => {
                event.preventDefault();
                if (!doneCandidate) return;
                updateMutation.mutate(
                  { threadId: doneCandidate.id, action: "done" },
                  { onSuccess: () => setDoneCandidate(null) }
                );
              }}
            >
              {updateMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Archive data-icon="inline-start" />
              )}
              {t("workspace.notifications.markDone")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={markAllOpen} onOpenChange={setMarkAllOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.notifications.markAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.notifications.markAllDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markAllMutation.isPending}>
              {t("workspace.notifications.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={markAllMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                markAllMutation.mutate(undefined, {
                  onSuccess: () => setMarkAllOpen(false),
                });
              }}
            >
              {markAllMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CheckCheck data-icon="inline-start" />
              )}
              {t("workspace.notifications.markAllRead")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
