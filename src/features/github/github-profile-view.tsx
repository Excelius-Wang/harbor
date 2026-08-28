import { useEffect, useMemo, useState } from "react";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type {
  GitHubContributionDay,
  GitHubContributionSummary,
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
  profileActivityQueryOptions,
  profileConnectionsQueryOptions,
  userContributionsQueryOptions,
  userProfileQueryOptions,
} from "./github-queries";

function ProfileSkeleton() {
  return (
    <div className="grid gap-6 p-5 min-[1180px]:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Skeleton className="size-28 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
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

function ContributionCalendar({ summary }: { summary: GitHubContributionSummary }) {
  const { t, i18n } = useTranslation();
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }),
    [i18n.language]
  );
  const levelClass: Record<GitHubContributionDay["contributionLevel"], string> = {
    NONE: "bg-muted/35",
    FIRST_QUARTILE: "bg-primary/20",
    SECOND_QUARTILE: "bg-primary/40",
    THIRD_QUARTILE: "bg-primary/65",
    FOURTH_QUARTILE: "bg-primary",
  };

  return (
    <section className="flex flex-col gap-3 border-b pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {t("workspace.profile.contributions", { count: summary.totalContributions })}
        </h2>
        {summary.hasRestrictedContributions ? (
          <span className="text-muted-foreground text-[10px]">
            {t("workspace.profile.privateContributions", {
              count: summary.restrictedContributions,
            })}
          </span>
        ) : null}
      </div>
      <ScrollArea className="w-full pb-2">
        <div
          role="img"
          aria-label={t("workspace.profile.contributionCalendarLabel")}
          className="flex w-max gap-1 pr-3"
        >
          {summary.weeks.map((week, weekIndex) => (
            <div key={`${week.firstDay}-${weekIndex}`} className="grid grid-rows-7 gap-1">
              {week.days.map((day) => (
                <span
                  key={day.date}
                  title={t("workspace.profile.contributionDay", {
                    count: day.contributionCount,
                    date: dayFormatter.format(new Date(`${day.date}T00:00:00`)),
                  })}
                  className={cn("size-2.5 rounded-[2px]", levelClass[day.contributionLevel])}
                />
              ))}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border min-[700px]:grid-cols-5">
        {[
          ["total", summary.totalContributions],
          ["commits", summary.commits],
          ["pullRequests", summary.pullRequests],
          ["reviews", summary.pullRequestReviews],
          ["issues", summary.issues],
        ].map(([label, value]) => (
          <div key={label} className="bg-background px-3 py-2">
            <dt className="text-muted-foreground text-[10px]">
              {t(`workspace.profile.metrics.${label}`)}
            </dt>
            <dd className="font-mono text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function activityIcon(eventType: string) {
  if (eventType === "PushEvent") return GitCommitHorizontal;
  if (eventType === "PullRequestEvent" || eventType === "PullRequestReviewEvent") {
    return GitPullRequest;
  }
  if (eventType === "IssuesEvent") return CircleDot;
  if (eventType === "ForkEvent") return GitFork;
  if (eventType === "WatchEvent") return Star;
  if (eventType === "CreateEvent" || eventType === "DeleteEvent") return Tag;
  if (eventType.includes("Comment") || eventType.includes("Discussion")) {
    return MessageSquareText;
  }
  return FileCode2;
}

function ActivityRow({ activity, locale }: { activity: GitHubProfileActivity; locale: string }) {
  const { t } = useTranslation();
  const Icon = activityIcon(activity.eventType);
  const action = activity.action
    ? t(`workspace.profile.actions.${activity.action}`, { defaultValue: activity.action })
    : undefined;
  const labelKey = `workspace.profile.activityTypes.${activity.eventType}`;
  return (
    <article className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 py-3">
      <span className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-md">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-5">
          {t(labelKey, {
            defaultValue: t("workspace.profile.activityTypes.fallback"),
            action,
            count: activity.commitCount ?? 0,
            number: activity.resourceNumber,
            reference: activity.reference,
            repository: activity.repository,
            title: activity.resourceTitle,
            type: activity.eventType,
          })}
        </p>
        {activity.resourceTitle ? (
          <p className="text-muted-foreground truncate text-[10px]">{activity.resourceTitle}</p>
        ) : null}
      </div>
      <time className="text-muted-foreground pt-0.5 text-[10px] whitespace-nowrap">
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
    <aside className="flex min-w-0 flex-col gap-4 min-[1180px]:border-r min-[1180px]:pr-5">
      <Avatar className="size-28 border shadow-sm">
        <AvatarImage src={profile.avatarUrl} alt={`@${profile.login}`} />
        <AvatarFallback>{initials(profile)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-[-0.03em]">
          {profile.name ?? profile.login}
        </h1>
        <p className="text-muted-foreground truncate text-sm">{profile.login}</p>
      </div>
      {profile.bio ? <p className="text-xs leading-5">{profile.bio}</p> : null}
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
          {profile.viewerFollows ? t("workspace.profile.unfollow") : t("workspace.profile.follow")}
        </Button>
      )}
      {!profile.viewerOwnsProfile && profile.followsViewer ? (
        <span className="text-muted-foreground text-[10px]">
          {t("workspace.profile.followsYou")}
        </span>
      ) : null}
      <div className="flex flex-wrap gap-3 text-xs">
        <button
          type="button"
          className="hover:text-primary"
          onClick={() => onShowConnections("followers")}
        >
          <strong className="font-mono tabular-nums">{profile.followers}</strong>{" "}
          <span className="text-muted-foreground">{t("workspace.profile.followers")}</span>
        </button>
        <button
          type="button"
          className="hover:text-primary"
          onClick={() => onShowConnections("following")}
        >
          <strong className="font-mono tabular-nums">{profile.following}</strong>{" "}
          <span className="text-muted-foreground">{t("workspace.profile.following")}</span>
        </button>
      </div>
      {details.length ? (
        <ul className="flex flex-col gap-2">
          {details.map(([Icon, text]) => (
            <li
              key={text}
              className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs"
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-muted-foreground text-[10px]">
        {t("workspace.profile.joined", { date: joined })}
      </p>
      <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border">
        <div className="bg-background px-3 py-2">
          <dt className="text-muted-foreground text-[10px]">
            {t("workspace.profile.repositories")}
          </dt>
          <dd className="font-mono text-sm tabular-nums">{profile.publicRepositories}</dd>
        </div>
        <div className="bg-background px-3 py-2">
          <dt className="text-muted-foreground text-[10px]">{t("workspace.nav.gists")}</dt>
          <dd className="font-mono text-sm tabular-nums">{profile.publicGists}</dd>
        </div>
      </dl>
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
        <TabsList>
          <TabsTrigger value="followers">{t("workspace.profile.followers")}</TabsTrigger>
          <TabsTrigger value="following">{t("workspace.profile.following")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {result.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : result.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("workspace.profile.connectionsFailed")}</AlertTitle>
          <AlertDescription>{parseIpcError(result.error).message}</AlertDescription>
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
              className="h-auto justify-start px-2 py-2"
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
  const [connectionKind, setConnectionKind] = useState<GitHubProfileConnectionKind>("followers");
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
  });
  const runtimeError = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.profile.desktopOnly") }
    : !profile && profileResult.error
      ? parseIpcError(profileResult.error)
      : null;

  useEffect(() => {
    setConnectionKind("followers");
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
    <section className="flex min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--background)_95%,transparent)]">
      <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b px-5">
        <div className="flex min-w-0 items-center gap-3">
          {selectedUsername || onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={backLabel ?? t("workspace.profile.backToYours")}
              onClick={handleBack}
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <div className="min-w-0">
            <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
              {t("workspace.profile.eyebrow")}
            </p>
            <h1 className="truncate text-xl font-semibold tracking-[-0.03em]">
              {profile?.viewerOwnsProfile === false ? profile.login : t("workspace.nav.profile")}
            </h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!desktopRuntime || profileResult.isFetching}
          onClick={() => void profileResult.refetch()}
        >
          {profileResult.isFetching ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {t("common.refresh")}
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
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
          <div className="mx-auto grid w-full max-w-[1160px] gap-5 p-5 min-[1180px]:grid-cols-[260px_minmax(0,1fr)]">
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
              onShowConnections={setConnectionKind}
            />
            <main className="flex min-w-0 flex-col gap-5">
              {contributions.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : contributions.error ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>{t("workspace.profile.contributionsFailed")}</AlertTitle>
                  <AlertDescription>{parseIpcError(contributions.error).message}</AlertDescription>
                </Alert>
              ) : contributions.data ? (
                <ContributionCalendar summary={contributions.data} />
              ) : null}

              <ConnectionList
                profile={profile}
                kind={connectionKind}
                onKindChange={setConnectionKind}
                onSelect={setSelectedUsername}
              />

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{t("workspace.profile.publicActivity")}</h2>
                  <span className="text-muted-foreground text-[10px]">
                    {t("workspace.profile.activityWindow")}
                  </span>
                </div>
                {activity.isPending ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Skeleton key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : activity.error ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>{t("workspace.profile.activityFailed")}</AlertTitle>
                    <AlertDescription>{parseIpcError(activity.error).message}</AlertDescription>
                  </Alert>
                ) : activities.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-xs">
                    {t("workspace.profile.empty.activity")}
                  </p>
                ) : (
                  <div className="divide-y">
                    {activities.map((item) => (
                      <ActivityRow key={item.id} activity={item} locale={i18n.language} />
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
            </main>
          </div>
        )}
      </ScrollArea>

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
