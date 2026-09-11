import { WorkspacePageHeader } from "@/features/workspace/workspace-page-header";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CircleAlert,
  CircleDot,
  ExternalLink,
  FileCode2,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  GitPullRequest,
  Link2,
  MapPin,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Star,
  Tag,
  UserCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { ContributionCalendar } from "./github-contribution-calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { openExternalUrl } from "@/lib/window";
import { GitHubProfileReadmeSection } from "./github-profile-readme-section";
import { useListScroll } from "@/hooks/use-list-scroll";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type {
  GitHubProfileActivity,
  GitHubProfileConnectionKind,
  GitHubUserProfile,
  GitHubUserProfileUpdate,
} from "./github-data";
import { GitHubProfileEditorDialog } from "./github-profile-editor-dialog";
import {
  invalidateProfiles,
  syncUserFollow,
  syncUserProfile,
  updatePersonalProfile,
  updateUserFollow,
} from "./github-profile-mutations";
import {
  githubQueryKeys,
  profileActivityQueryOptions,
  profileConnectionsQueryOptions,
  userContributionsQueryOptions,
  userProfileQueryOptions,
} from "./github-queries";

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="size-18 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function initials(profile: Pick<GitHubUserProfile, "name" | "login">) {
  return (profile.name ?? profile.login)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const activityIcons: Record<string, typeof FileCode2> = {
  PushEvent: GitCommitHorizontal,
  PullRequestEvent: GitPullRequest,
  PullRequestReviewEvent: GitPullRequest,
  IssuesEvent: CircleDot,
  ForkEvent: GitFork,
  WatchEvent: Star,
  CreateEvent: Tag,
  DeleteEvent: Tag,
};

export function ActivityRow({
  activity,
  locale,
  profileLogin,
}: {
  activity: GitHubProfileActivity;
  locale: string;
  profileLogin: string;
}) {
  const { t } = useTranslation();
  const merged = activity.eventType === "PullRequestEvent" && activity.action === "merged";
  const Icon = merged
    ? GitMerge
    : (activityIcons[activity.eventType] ??
      (activity.eventType.includes("Comment") || activity.eventType.includes("Discussion")
        ? MessageSquareText
        : FileCode2));
  const translatedAction = activity.action
    ? t(`workspace.profile.actions.${activity.action}`, { defaultValue: activity.action })
    : "";
  const action = locale.startsWith("en")
    ? translatedAction.charAt(0).toLowerCase() + translatedAction.slice(1)
    : translatedAction;
  const summaryType =
    activity.eventType === "CreateEvent" && !activity.reference
      ? "repositoryCreated"
      : activity.eventType;
  const repository = activity.repository.toLowerCase().startsWith(`${profileLogin.toLowerCase()}/`)
    ? activity.repository.slice(profileLogin.length + 1)
    : activity.repository;
  const detail = [activity.resourceTitle, activity.reference]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");
  return (
    <article className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 py-3">
      <span className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-md">
        <Icon className={cn("size-3.5", merged && "text-merged")} />
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-5 wrap-anywhere">
          <strong className="font-semibold" title={activity.repository}>
            {repository}
          </strong>{" "}
          {t(`workspace.profile.activitySummary.${summaryType}`, {
            defaultValue: t("workspace.profile.activitySummary.fallback", {
              type: activity.eventType,
            }),
            action,
            count: activity.commitCount ?? 0,
            number: activity.resourceNumber ? `#${activity.resourceNumber}` : "",
            type: activity.eventType,
          })}
        </p>
        {detail ? <p className="mt-1 text-xs leading-5 wrap-anywhere">{detail}</p> : null}
      </div>
      <time
        dateTime={activity.createdAt}
        className="text-muted-foreground pt-0.5 text-xs whitespace-nowrap"
      >
        {new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
          new Date(activity.createdAt)
        )}
      </time>
    </article>
  );
}

function ProfileIdentity({
  profile,
  followPending,
  onEdit,
  onFollow,
  onShowConnections,
}: {
  profile: GitHubUserProfile;
  followPending: boolean;
  onEdit: () => void;
  onFollow: () => void;
  onShowConnections: (kind: GitHubProfileConnectionKind) => void;
}) {
  const { t, i18n } = useTranslation();
  const joined = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
  }).format(new Date(profile.createdAt));
  const details = [
    profile.company ? [Building2, profile.company] : null,
    profile.location ? [MapPin, profile.location] : null,
    profile.blog ? [Link2, profile.blog] : null,
    profile.email ? [ExternalLink, profile.email] : null,
    profile.twitterUsername ? [ExternalLink, `@${profile.twitterUsername}`] : null,
    profile.hireable ? [BriefcaseBusiness, t("workspace.profile.availableForHire")] : null,
  ].filter(Boolean) as Array<[typeof Building2, string]>;

  return (
    <aside className="@container/profile flex min-w-0 flex-col gap-4">
      <div className="flex items-start gap-4">
        <Avatar className="size-18 shrink-0 border">
          <AvatarImage src={profile.avatarUrl} alt={`@${profile.login}`} />
          <AvatarFallback>{initials(profile)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-[-0.03em] wrap-anywhere">
                {profile.name ?? profile.login}
              </h2>
              <p className="text-muted-foreground text-xs wrap-anywhere">@{profile.login}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.viewerOwnsProfile ? (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil data-icon="inline-start" />
                  {t("workspace.profile.edit")}
                </Button>
              ) : (
                <Button
                  variant={profile.viewerFollows ? "outline" : "default"}
                  size="sm"
                  disabled={followPending}
                  onClick={onFollow}
                >
                  {followPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UserCheck data-icon="inline-start" />
                  )}
                  {profile.viewerFollows
                    ? t("workspace.profile.unfollow")
                    : t("workspace.profile.follow")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void openExternalUrl(profile.url)}>
                <ExternalLink data-icon="inline-start" />
                {t("workspace.repositories.openOnGitHub")}
              </Button>
            </div>
          </div>
          {profile.bio ? (
            <p className="text-xs leading-5 wrap-anywhere whitespace-pre-wrap">{profile.bio}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span>
              <strong className="font-mono tabular-nums">{profile.publicRepositories}</strong>{" "}
              <span className="text-muted-foreground">{t("workspace.profile.repositories")}</span>
            </span>
            <span>
              <strong className="font-mono tabular-nums">{profile.publicGists}</strong>{" "}
              <span className="text-muted-foreground">{t("workspace.nav.gists")}</span>
            </span>
            <div className="flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                className="hover:text-primary focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
                onClick={() => onShowConnections("followers")}
              >
                <strong className="font-mono tabular-nums">{profile.followers}</strong>{" "}
                <span className="text-muted-foreground">{t("workspace.profile.followers")}</span>
              </button>
              <button
                type="button"
                className="hover:text-primary focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
                onClick={() => onShowConnections("following")}
              >
                <strong className="font-mono tabular-nums">{profile.following}</strong>{" "}
                <span className="text-muted-foreground">{t("workspace.profile.following")}</span>
              </button>
            </div>
          </div>
          {details.length ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {details.map(([Icon, text]) => (
                <li
                  key={text}
                  className="text-muted-foreground flex min-w-0 items-start gap-1.5 text-xs"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="wrap-anywhere">{text}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted-foreground text-[11px]">
            {t("workspace.profile.joined", { date: joined })}
          </p>
          {!profile.viewerOwnsProfile && profile.followsViewer ? (
            <span className="text-muted-foreground text-[11px]">
              {t("workspace.profile.followsYou")}
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function ConnectionList({
  profile,
  kind,
  onKindChange,
  onSelect,
}: {
  profile: GitHubUserProfile;
  kind: GitHubProfileConnectionKind;
  onKindChange: (kind: GitHubProfileConnectionKind) => void;
  onSelect: (username: string) => void;
}) {
  const { t } = useTranslation();
  const result = useInfiniteQuery(
    profileConnectionsQueryOptions({ username: profile.login, kind })
  );
  const users = result.data?.pages.flatMap((page) => page.users) ?? [];
  return (
    <section className="flex min-h-0 flex-col gap-3 border-b pb-5">
      <Tabs
        value={kind}
        onValueChange={(value) => onKindChange(value as GitHubProfileConnectionKind)}
      >
        <TabsList variant="line">
          <TabsTrigger value="followers">{t("workspace.profile.followers")}</TabsTrigger>
          <TabsTrigger value="following">{t("workspace.profile.following")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {result.data && result.error ? (
        <WorkspaceStaleNotice
          message={parseIpcError(result.error).message}
          onRetry={() => void result.refetch()}
        />
      ) : null}
      {result.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : result.error && !result.data ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("workspace.profile.connectionsFailed")}</AlertTitle>
          <AlertDescription>{parseIpcError(result.error).message}</AlertDescription>
          <div className="col-start-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        </Alert>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-xs">
          {t(`workspace.profile.empty.${kind}`)}
        </p>
      ) : (
        <div className="grid gap-1 min-[700px]:grid-cols-2">
          {users.map((user) => (
            <Button
              key={user.id}
              type="button"
              variant="ghost"
              className="harbor-result-row h-auto justify-start px-2 py-2"
              onClick={() => onSelect(user.login)}
            >
              <Avatar size="sm">
                <AvatarImage src={user.avatarUrl} alt={`@${user.login}`} />
                <AvatarFallback>{user.login.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="truncate">{user.login}</span>
            </Button>
          ))}
        </div>
      )}
      {result.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={result.isFetchingNextPage}
          onClick={() => void result.fetchNextPage()}
        >
          {result.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
          {t("common.loadMore")}
        </Button>
      ) : null}
    </section>
  );
}

export function GitHubProfileView({
  initialUsername = null,
  backLabel,
  onBack,
}: {
  initialUsername?: string | null;
  backLabel?: string;
  onBack?: () => void;
} = {}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const desktopRuntime = isTauri();
  const [selectedUsername, setSelectedUsername] = useState<string | null>(initialUsername);
  const profileScroll = useListScroll(JSON.stringify({ username: selectedUsername }));
  const [connectionKind, setConnectionKind] = useState<GitHubProfileConnectionKind>("followers");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const profileResult = useQuery({
    ...userProfileQueryOptions({ username: selectedUsername }),
    enabled: desktopRuntime,
  });
  const profile = profileResult.data;
  const contributions = useQuery({
    ...userContributionsQueryOptions({ username: profile?.login ?? "viewer" }),
    enabled: desktopRuntime && Boolean(profile),
  });
  const activity = useInfiniteQuery({
    ...profileActivityQueryOptions({ username: profile?.login ?? "viewer" }),
    enabled: desktopRuntime && Boolean(profile),
  });
  const activities = activity.data?.pages.flatMap((page) => page.activities) ?? [];
  const editMutation = useMutation({
    mutationFn: (input: GitHubUserProfileUpdate) => updatePersonalProfile(input),
    onSuccess: (updated) => {
      syncUserProfile(queryClient, updated);
      setEditOpen(false);
      toast.success(t("workspace.profile.updated"));
      void invalidateProfiles(queryClient, updated.login);
    },
  });
  const followMutation = useMutation({
    mutationFn: ({
      username,
      followed,
    }: {
      username: string;
      followed: boolean;
      previousFollowed: boolean;
    }) => updateUserFollow(username, followed),
    onSuccess: (updated, variables) => {
      syncUserFollow(queryClient, updated, variables.previousFollowed);
      toast.success(
        t(variables.followed ? "workspace.profile.followed" : "workspace.profile.unfollowed", {
          username: updated.login,
        })
      );
      void invalidateProfiles(queryClient, updated.login);
    },
    onError: (error) => {
      toast.error(t("workspace.profile.followFailed"), {
        description: parseIpcError(error).message,
      });
    },
  });
  const runtimeError = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.profile.desktopOnly") }
    : !profile && profileResult.error
      ? parseIpcError(profileResult.error)
      : null;

  useEffect(() => {
    setConnectionKind("followers");
    setConnectionsOpen(false);
  }, [profile?.login]);

  useEffect(() => {
    setSelectedUsername(initialUsername);
  }, [initialUsername]);

  const handleBack = () => {
    if (selectedUsername !== initialUsername) {
      setSelectedUsername(initialUsername);
    } else if (onBack) {
      onBack();
    } else {
      setSelectedUsername(null);
    }
  };

  return (
    <section className="harbor-content flex min-w-0 flex-1 flex-col">
      <WorkspacePageHeader
        title={profile?.viewerOwnsProfile === false ? profile.login : t("workspace.nav.profile")}
        description={t("workspace.profile.eyebrow")}
        leading={
          selectedUsername || onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={backLabel ?? t("workspace.profile.backToYours")}
              title={backLabel ?? t("workspace.profile.backToYours")}
              onClick={handleBack}
            >
              <ArrowLeft />
            </Button>
          ) : undefined
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={!desktopRuntime || profileResult.isFetching}
          onClick={() =>
            void queryClient.invalidateQueries({ queryKey: githubQueryKeys.profilesRoot })
          }
        >
          {profileResult.isFetching ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {t("common.refresh")}
        </Button>
      </WorkspacePageHeader>
      {profile && profileResult.error ? (
        <WorkspaceStaleNotice
          message={parseIpcError(profileResult.error).message}
          onRetry={() => void profileResult.refetch()}
        />
      ) : null}

      <ScrollArea className="min-h-0 flex-1" constrainContentWidth {...profileScroll}>
        {runtimeError ? (
          <Empty className="min-h-[420px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.profile.loadFailed")}</EmptyTitle>
              <EmptyDescription>
                {runtimeError.code === "githubPermission"
                  ? t("workspace.profile.permissionDescription")
                  : runtimeError.message}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => void profileResult.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("common.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : !profile ? (
          <ProfileSkeleton />
        ) : (
          <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 p-5">
            <ProfileIdentity
              profile={profile}
              followPending={followMutation.isPending}
              onEdit={() => {
                editMutation.reset();
                setEditOpen(true);
              }}
              onFollow={() =>
                followMutation.mutate({
                  username: profile.login,
                  followed: !profile.viewerFollows,
                  previousFollowed: profile.viewerFollows,
                })
              }
              onShowConnections={(kind) => {
                setConnectionKind(kind);
                setConnectionsOpen(true);
              }}
            />
            <div className="flex min-w-0 flex-col gap-5">
              {contributions.data && contributions.error ? (
                <WorkspaceStaleNotice
                  message={parseIpcError(contributions.error).message}
                  onRetry={() => void contributions.refetch()}
                />
              ) : null}
              {contributions.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : contributions.error && !contributions.data ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>{t("workspace.profile.contributionsFailed")}</AlertTitle>
                  <AlertDescription>{parseIpcError(contributions.error).message}</AlertDescription>
                  <div className="col-start-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void contributions.refetch()}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                </Alert>
              ) : contributions.data ? (
                <ContributionCalendar
                  key={`calendar:${profile.login}`}
                  summary={contributions.data}
                />
              ) : null}

              <GitHubProfileReadmeSection key={`readme:${profile.login}`} profile={profile} />

              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{t("workspace.profile.publicActivity")}</h2>
                  <span className="text-muted-foreground text-[11px]">
                    {t("workspace.profile.activityWindow")}
                  </span>
                </div>
                {activity.data && activity.error ? (
                  <WorkspaceStaleNotice
                    message={parseIpcError(activity.error).message}
                    onRetry={() => void activity.refetch()}
                  />
                ) : null}
                {activity.isPending ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Skeleton key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : activity.error && !activity.data ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>{t("workspace.profile.activityFailed")}</AlertTitle>
                    <AlertDescription>{parseIpcError(activity.error).message}</AlertDescription>
                    <div className="col-start-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => void activity.refetch()}>
                        {t("common.retry")}
                      </Button>
                    </div>
                  </Alert>
                ) : activities.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-xs">
                    {t("workspace.profile.empty.activity")}
                  </p>
                ) : (
                  <div className="divide-y">
                    {activities.map((item) => (
                      <ActivityRow
                        key={item.id}
                        activity={item}
                        locale={i18n.language}
                        profileLogin={profile.login}
                      />
                    ))}
                  </div>
                )}
                {activity.hasNextPage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activity.isFetchingNextPage}
                    onClick={() => void activity.fetchNextPage()}
                  >
                    {activity.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                    {t("common.loadMore")}
                  </Button>
                ) : null}
              </section>
            </div>
          </div>
        )}
      </ScrollArea>

      {profile ? (
        <Dialog open={connectionsOpen} onOpenChange={setConnectionsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`workspace.profile.${connectionKind}`)}</DialogTitle>
              <DialogDescription>@{profile.login}</DialogDescription>
            </DialogHeader>
            <ConnectionList
              profile={profile}
              kind={connectionKind}
              onKindChange={setConnectionKind}
              onSelect={(username) => {
                setConnectionsOpen(false);
                setSelectedUsername(username);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      {profile?.viewerOwnsProfile ? (
        <GitHubProfileEditorDialog
          open={editOpen}
          profile={profile}
          pending={editMutation.isPending}
          error={editMutation.error ? parseIpcError(editMutation.error).message : undefined}
          onOpenChange={setEditOpen}
          onSave={(input) => editMutation.mutate(input)}
        />
      ) : null}
    </section>
  );
}
