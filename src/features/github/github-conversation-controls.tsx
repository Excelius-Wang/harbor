import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CircleAlert, LockKeyhole, LockOpen, RefreshCw } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import {
  syncConversationControls,
  updateRepositoryConversationLock,
  updateRepositoryConversationSubscription,
} from "./github-conversation-mutations";
import type {
  GitHubConversationLockAction,
  GitHubConversationLockReason,
  GitHubConversationSubscriptionAction,
  GitHubRepositoryIdentity,
} from "./github-data";
import { invalidateRepositoryIssue, syncIssueLockedState } from "./github-issue-mutations";
import {
  invalidateRepositoryPullRequest,
  syncPullRequestLockedState,
} from "./github-pull-request-mutations";
import {
  repositoryConversationControlsQueryOptions,
  type GitHubConversationTarget,
} from "./github-queries";

type LockRequest = {
  action: GitHubConversationLockAction;
  reason?: GitHubConversationLockReason;
};

const LOCK_REASONS: GitHubConversationLockReason[] = ["offTopic", "tooHeated", "resolved", "spam"];

export function GitHubConversationControls({
  repository,
  conversationKind,
  conversationNumber,
}: {
  repository: GitHubRepositoryIdentity;
  conversationKind: GitHubConversationTarget["conversationKind"];
  conversationNumber: number;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockReason, setLockReason] = useState<GitHubConversationLockReason | "none">("none");
  const target: GitHubConversationTarget = {
    owner: repository.owner,
    repository: repository.name,
    conversationKind,
    conversationNumber,
  };
  const result = useQuery(repositoryConversationControlsQueryOptions(target));
  const controls = result.data;

  const reconcileLock = (locked: boolean) => {
    if (conversationKind === "issue") {
      const issueTarget = {
        owner: target.owner,
        repository: target.repository,
        issueNumber: target.conversationNumber,
      };
      syncIssueLockedState(queryClient, issueTarget, locked);
      void invalidateRepositoryIssue(queryClient, issueTarget);
      return;
    }
    const pullRequestTarget = {
      owner: target.owner,
      repository: target.repository,
      pullRequestNumber: target.conversationNumber,
    };
    syncPullRequestLockedState(queryClient, pullRequestTarget, locked);
    void invalidateRepositoryPullRequest(queryClient, pullRequestTarget);
  };

  const lockMutation = useMutation({
    mutationFn: ({ action, reason }: LockRequest) =>
      updateRepositoryConversationLock(target, action, reason),
    onSuccess: (updated) => {
      syncConversationControls(queryClient, target, updated);
      reconcileLock(updated.locked);
      toast.success(
        t(
          updated.locked
            ? "workspace.repositories.conversationLocked"
            : "workspace.repositories.conversationUnlocked"
        )
      );
      setLockDialogOpen(false);
    },
  });
  const subscriptionMutation = useMutation({
    mutationFn: (action: GitHubConversationSubscriptionAction) =>
      updateRepositoryConversationSubscription(target, action),
    onSuccess: (updated) => {
      syncConversationControls(queryClient, target, updated);
      toast.success(
        t(
          updated.viewerSubscription === "subscribed"
            ? "workspace.repositories.conversationSubscribed"
            : "workspace.repositories.conversationUnsubscribed"
        )
      );
    },
  });
  const loadError = !controls && result.error ? parseIpcError(result.error) : null;
  const lockError = lockMutation.error ? parseIpcError(lockMutation.error) : null;
  const subscriptionError = subscriptionMutation.error
    ? parseIpcError(subscriptionMutation.error)
    : null;
  const lockErrorMessage = lockError
    ? lockError.code === "githubPermission"
      ? t("workspace.repositories.conversationControlPermissionDenied")
      : lockError.message
    : null;
  const subscriptionErrorMessage = subscriptionError
    ? subscriptionError.code === "githubPermission"
      ? t("workspace.repositories.conversationControlPermissionDenied")
      : subscriptionError.message
    : null;

  if (result.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!controls || loadError) {
    return (
      <Alert variant="destructive" className="py-2.5 text-xs">
        <CircleAlert />
        <AlertTitle>{t("workspace.repositories.conversationControlsLoadFailed")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{loadError?.message}</span>
          <Button variant="outline" size="xs" onClick={() => void result.refetch()}>
            <RefreshCw data-icon="inline-start" />
            {t("workspace.repositories.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const subscribed = controls.viewerSubscription === "subscribed";
  const subscriptionAction: GitHubConversationSubscriptionAction = subscribed
    ? "unsubscribe"
    : "subscribe";
  const subscriptionLabel = t(
    `workspace.repositories.conversationSubscriptionStates.${controls.viewerSubscription ?? "unknown"}`
  );

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="text-muted-foreground text-[10px] font-medium tracking-[0.08em] uppercase">
        {t("workspace.repositories.conversationControls")}
      </p>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Badge variant="outline" className="min-w-0 rounded-md">
          {subscribed ? <Bell /> : <BellOff />}
          <span className="truncate">{subscriptionLabel}</span>
        </Badge>
        {controls.viewerCanSubscribe ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={subscriptionMutation.isPending || lockMutation.isPending}
            onClick={() => subscriptionMutation.mutate(subscriptionAction)}
          >
            {subscriptionMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t(
              subscriptionAction === "subscribe"
                ? "workspace.repositories.subscribeConversation"
                : "workspace.repositories.unsubscribeConversation"
            )}
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Badge variant="outline" className="min-w-0 rounded-md">
          {controls.locked ? <LockKeyhole /> : <LockOpen />}
          <span className="truncate">
            {controls.locked
              ? controls.lockReason
                ? t("workspace.repositories.lockedConversationWithReason", {
                    reason: t(`workspace.repositories.lockReasons.${controls.lockReason}`),
                  })
                : t("workspace.repositories.lockedConversation")
              : t("workspace.repositories.unlockedConversation")}
          </span>
        </Badge>
        {controls.viewerCanLock ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={subscriptionMutation.isPending || lockMutation.isPending}
            onClick={() => {
              lockMutation.reset();
              setLockReason("none");
              setLockDialogOpen(true);
            }}
          >
            {controls.locked
              ? t("workspace.repositories.unlockConversation")
              : t("workspace.repositories.lockConversation")}
          </Button>
        ) : null}
      </div>
      {subscriptionError ? (
        <Alert variant="destructive" className="py-2.5 text-xs">
          <CircleAlert />
          <AlertTitle>{t("workspace.repositories.subscriptionChangeFailed")}</AlertTitle>
          <AlertDescription>{subscriptionErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog
        open={lockDialogOpen}
        onOpenChange={(open) => {
          if (lockMutation.isPending) return;
          setLockDialogOpen(open);
          if (!open) lockMutation.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                controls.locked
                  ? "workspace.repositories.unlockConversationTitle"
                  : "workspace.repositories.lockConversationTitle"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                controls.locked
                  ? "workspace.repositories.unlockConversationDescription"
                  : "workspace.repositories.lockConversationDescription"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!controls.locked ? (
            <Field>
              <FieldLabel htmlFor={`github-${conversationKind}-${conversationNumber}-lock-reason`}>
                {t("workspace.repositories.lockReason")}
              </FieldLabel>
              <Select
                value={lockReason}
                onValueChange={(value) =>
                  setLockReason(value as GitHubConversationLockReason | "none")
                }
                disabled={lockMutation.isPending}
              >
                <SelectTrigger id={`github-${conversationKind}-${conversationNumber}-lock-reason`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t("workspace.repositories.noLockReason")}</SelectItem>
                    {LOCK_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {t(`workspace.repositories.lockReasons.${reason}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {lockError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.lockChangeFailed")}</AlertTitle>
              <AlertDescription>{lockErrorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lockMutation.isPending}>
              {t("workspace.repositories.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={lockMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                const action: GitHubConversationLockAction = controls.locked ? "unlock" : "lock";
                lockMutation.mutate({
                  action,
                  ...(action === "lock" && lockReason !== "none" ? { reason: lockReason } : {}),
                });
              }}
            >
              {lockMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t(
                controls.locked
                  ? "workspace.repositories.unlockConversation"
                  : "workspace.repositories.lockConversation"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
