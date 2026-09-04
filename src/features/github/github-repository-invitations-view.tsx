import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Inbox,
  LockKeyhole,
  RefreshCw,
  UserPlus,
  X,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type {
  GitHubReceivedRepositoryInvitation,
  GitHubReceivedRepositoryInvitationAction,
} from "./github-data";
import { formatIssueDate } from "./github-issue-shared";
import {
  invalidateReceivedRepositoryInvitationResolution,
  removeReceivedRepositoryInvitationFromCache,
  updateReceivedRepositoryInvitation,
} from "./github-repository-invitations";
import { receivedRepositoryInvitationsQueryOptions } from "./github-queries";

function RepositoryInvitationSkeletons() {
  return (
    <div className="grid gap-3 p-4 sm:p-5">
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} className="gap-4 py-5 shadow-none">
          <CardHeader className="gap-2 px-5">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-3 w-4/5" />
          </CardHeader>
          <CardContent className="flex items-center gap-3 px-5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3 w-48" />
          </CardContent>
          <CardFooter className="justify-end gap-2 px-5">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function permissionLabel(permission: string, t: ReturnType<typeof useTranslation>["t"]) {
  return t(`workspace.notifications.invitations.permissions.${permission}`, {
    defaultValue: permission,
  });
}

export function GitHubRepositoryInvitations({
  highlightRepositoryId,
  onBack,
  onResolved,
}: {
  highlightRepositoryId?: number;
  onBack: () => void;
  onResolved?: (
    invitation: GitHubReceivedRepositoryInvitation,
    action: GitHubReceivedRepositoryInvitationAction
  ) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const desktopRuntime = isTauri();
  const [declineCandidate, setDeclineCandidate] =
    useState<GitHubReceivedRepositoryInvitation | null>(null);
  const [mutationError, setMutationError] = useState<{
    invitationId: number;
    message: string;
  } | null>(null);
  const result = useInfiniteQuery({
    ...receivedRepositoryInvitationsQueryOptions(),
    enabled: desktopRuntime,
  });
  const invitations = useMemo(() => {
    const seen = new Set<number>();
    return (result.data?.pages ?? []).flatMap((page) =>
      page.invitations.filter((invitation) => {
        if (seen.has(invitation.id)) return false;
        seen.add(invitation.id);
        return true;
      })
    );
  }, [result.data]);
  const loadError = !desktopRuntime
    ? { code: "desktopOnly", message: t("workspace.notifications.desktopOnly") }
    : !result.data && result.error
      ? parseIpcError(result.error)
      : null;
  const supplementalError = result.data && result.error ? parseIpcError(result.error) : null;

  const mutation = useMutation({
    mutationFn: updateReceivedRepositoryInvitation,
    onMutate: (target) => {
      setMutationError((current) =>
        current?.invitationId === target.invitationId ? null : current
      );
    },
    onSuccess: (_, target) => {
      const invitation = invitations.find((item) => item.id === target.invitationId);
      removeReceivedRepositoryInvitationFromCache(queryClient, target.invitationId);
      toast.success(
        t(
          target.action === "accept"
            ? "workspace.notifications.invitations.acceptSuccess"
            : "workspace.notifications.invitations.declineSuccess",
          { repository: invitation?.repository.fullName }
        )
      );
      void invalidateReceivedRepositoryInvitationResolution(queryClient, target.action);
      if (invitation) onResolved?.(invitation, target.action);
    },
    onError: (reason, target) => {
      const parsed = parseIpcError(reason);
      setMutationError({ invitationId: target.invitationId, message: parsed.message });
    },
  });

  const resolve = (
    invitation: GitHubReceivedRepositoryInvitation,
    action: GitHubReceivedRepositoryInvitationAction
  ) => {
    setMutationError(null);
    mutation.mutate(
      { invitationId: invitation.id, action },
      action === "decline" ? { onSuccess: () => setDeclineCandidate(null) } : undefined
    );
  };

  return (
    <section className="harbor-content flex min-w-0 flex-1 flex-col">
      <header className="h-[74px] shrink-0 border-b px-4 sm:px-5">
        <div className="mx-auto flex h-full w-full max-w-[960px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("workspace.notifications.back")}
                  onClick={onBack}
                >
                  <ArrowLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("workspace.notifications.back")}</TooltipContent>
            </Tooltip>
            <div className="min-w-0">
              <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
                {t("workspace.notifications.invitations.eyebrow")}
              </p>
              <h1 className="mt-0.5 truncate text-xl font-semibold tracking-[-0.03em]">
                {t("workspace.notifications.invitations.title")}
              </h1>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={result.isFetching || !desktopRuntime}
            onClick={() => void result.refetch()}
          >
            {result.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {t("workspace.notifications.refresh")}
          </Button>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[960px] flex-1 flex-col border-x">
        <div className="border-b px-4 py-3 sm:px-5">
          <p className="text-muted-foreground max-w-2xl text-xs leading-5">
            {t("workspace.notifications.invitations.description")}
          </p>
        </div>
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
          {result.isPending && !result.data ? (
            <RepositoryInvitationSkeletons />
          ) : loadError ? (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleAlert />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.notifications.invitations.loadFailed")}</EmptyTitle>
                <EmptyDescription>{loadError.message}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void result.refetch()}>
                  <RefreshCw data-icon="inline-start" />
                  {t("workspace.repositories.retry")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : invitations.length ? (
            <div className="grid gap-3 p-4 sm:p-5">
              {invitations.map((invitation) => {
                const pending =
                  mutation.isPending && mutation.variables.invitationId === invitation.id;
                const highlighted = invitation.repository.id === highlightRepositoryId;
                return (
                  <Card
                    key={invitation.id}
                    className={cn(
                      "gap-4 py-5 shadow-none transition-colors",
                      highlighted && "border-primary/45 bg-primary/[0.035]"
                    )}
                  >
                    <CardHeader className="gap-2 px-5">
                      <CardTitle className="truncate text-sm">
                        {invitation.repository.fullName}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-xs leading-5">
                        {invitation.repository.description ||
                          t("workspace.repositories.noDescription")}
                      </CardDescription>
                      <CardAction className="flex items-center gap-1.5">
                        {invitation.repository.isPrivate ? (
                          <Badge variant="outline" className="gap-1 font-normal">
                            <LockKeyhole />
                            {t("workspace.notifications.invitations.private")}
                          </Badge>
                        ) : null}
                        <Badge variant="secondary" className="font-normal">
                          {permissionLabel(invitation.permission, t)}
                        </Badge>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex items-center gap-3 px-5">
                      <Avatar>
                        <AvatarImage
                          src={invitation.inviter.avatarUrl}
                          alt={invitation.inviter.login}
                        />
                        <AvatarFallback>
                          {invitation.inviter.login.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 text-xs">
                        <p className="text-foreground truncate font-medium">
                          {t("workspace.notifications.invitations.invitedBy", {
                            login: invitation.inviter.login,
                          })}
                        </p>
                        <time className="text-muted-foreground">
                          {formatIssueDate(invitation.createdAt, i18n.language)}
                        </time>
                      </div>
                    </CardContent>
                    {mutationError?.invitationId === invitation.id ? (
                      <CardContent className="px-5">
                        <Alert variant="destructive">
                          <CircleAlert />
                          <AlertTitle>
                            {t("workspace.notifications.invitations.updateFailed")}
                          </AlertTitle>
                          <AlertDescription>{mutationError.message}</AlertDescription>
                        </Alert>
                      </CardContent>
                    ) : null}
                    <CardFooter className="justify-end gap-2 px-5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => setDeclineCandidate(invitation)}
                      >
                        <X data-icon="inline-start" />
                        {t("workspace.notifications.invitations.decline")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => resolve(invitation, "accept")}
                      >
                        {pending && mutation.variables.action === "accept" ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Check data-icon="inline-start" />
                        )}
                        {t("workspace.notifications.invitations.accept")}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
              {result.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-center"
                  disabled={result.isFetchingNextPage}
                  onClick={() => void result.fetchNextPage()}
                >
                  {result.isFetchingNextPage ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UserPlus data-icon="inline-start" />
                  )}
                  {t("workspace.notifications.invitations.loadMore")}
                </Button>
              ) : null}
            </div>
          ) : (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>{t("workspace.notifications.invitations.empty")}</EmptyTitle>
                <EmptyDescription>
                  {t("workspace.notifications.invitations.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
      </div>

      <AlertDialog
        open={Boolean(declineCandidate)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDeclineCandidate(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.notifications.invitations.declineTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.notifications.invitations.declineDescription", {
                repository: declineCandidate?.repository.fullName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {declineCandidate && mutationError?.invitationId === declineCandidate.id ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.notifications.invitations.updateFailed")}</AlertTitle>
              <AlertDescription>{mutationError.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("workspace.notifications.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={mutation.isPending || !declineCandidate}
              onClick={(event) => {
                event.preventDefault();
                if (declineCandidate) resolve(declineCandidate, "decline");
              }}
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <X data-icon="inline-start" />
              )}
              {t("workspace.notifications.invitations.decline")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
