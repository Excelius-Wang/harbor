import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock3, Trash2, UserPlus, Users, X } from "lucide-react";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubRepositoryAccessUser, GitHubRepositoryInvitation } from "./github-data";
import { formatIssueDate } from "./github-issue-shared";
import {
  personalRepositoryCollaboratorsQueryOptions,
  personalRepositoryInvitationsQueryOptions,
  type GitHubRepositoryTarget,
} from "./github-queries";
import {
  cancelPersonalRepositoryInvitation,
  invalidatePersonalRepositoryAccess,
  invitePersonalRepositoryCollaborator,
  removePersonalRepositoryCollaborator,
  syncCancelledRepositoryInvitation,
  syncRemovedRepositoryCollaborator,
  syncRepositoryInvitation,
} from "./github-repository-access";

function AccessUser({ user }: { user: GitHubRepositoryAccessUser }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-8">
        <AvatarImage src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
        <AvatarFallback>{user.login.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium">@{user.login}</span>
    </div>
  );
}

function AccessError({ title, error }: { title: string; error: unknown }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{parseIpcError(error).message}</AlertDescription>
    </Alert>
  );
}

export function GitHubRepositoryAccessCard({ target }: { target: GitHubRepositoryTarget }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [cancelInvitation, setCancelInvitation] = useState<GitHubRepositoryInvitation | null>(null);
  const [removeCollaborator, setRemoveCollaborator] = useState<GitHubRepositoryAccessUser | null>(
    null
  );
  const collaboratorsResult = useInfiniteQuery(personalRepositoryCollaboratorsQueryOptions(target));
  const invitationsResult = useInfiniteQuery(personalRepositoryInvitationsQueryOptions(target));
  const collaborators = collaboratorsResult.data?.pages.flatMap((page) => page.collaborators) ?? [];
  const invitations = invitationsResult.data?.pages.flatMap((page) => page.invitations) ?? [];

  const inviteMutation = useMutation({
    mutationFn: () => invitePersonalRepositoryCollaborator(target, username),
    onSuccess: (result) => {
      if (result.invitation) syncRepositoryInvitation(queryClient, target, result.invitation);
      void invalidatePersonalRepositoryAccess(queryClient, target);
      setInviteOpen(false);
      setUsername("");
      toast.success(
        t(
          result.status === "invited"
            ? "workspace.repositories.settings.access.invited"
            : "workspace.repositories.settings.access.alreadyCollaborator"
        )
      );
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (invitation: GitHubRepositoryInvitation) =>
      cancelPersonalRepositoryInvitation(target, invitation.id),
    onSuccess: (_, invitation) => {
      syncCancelledRepositoryInvitation(queryClient, target, invitation.id);
      void invalidatePersonalRepositoryAccess(queryClient, target);
      setCancelInvitation(null);
      toast.success(t("workspace.repositories.settings.access.invitationCancelled"));
    },
  });
  const removeMutation = useMutation({
    mutationFn: (collaborator: GitHubRepositoryAccessUser) =>
      removePersonalRepositoryCollaborator(target, collaborator.login),
    onSuccess: (_, collaborator) => {
      syncRemovedRepositoryCollaborator(queryClient, target, collaborator.login);
      void invalidatePersonalRepositoryAccess(queryClient, target);
      setRemoveCollaborator(null);
      toast.success(t("workspace.repositories.settings.access.removed"));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users /> {t("workspace.repositories.settings.access.title")}
        </CardTitle>
        <CardDescription>{t("workspace.repositories.settings.access.description")}</CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={() => {
              inviteMutation.reset();
              setInviteOpen(true);
            }}
          >
            <UserPlus /> {t("workspace.repositories.settings.access.add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {invitationsResult.isError ? (
          <AccessError
            title={t("workspace.repositories.settings.access.invitationsLoadFailed")}
            error={invitationsResult.error}
          />
        ) : invitationsResult.isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : invitations.length ? (
          <section className="flex flex-col gap-2">
            <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-[0.06em] uppercase">
              <Clock3 /> {t("workspace.repositories.settings.access.pending")}
            </p>
            <div className="divide-y rounded-lg border">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <AccessUser user={invitation.invitee} />
                    <p className="text-muted-foreground mt-1 truncate pl-10 text-[11px]">
                      {t("workspace.repositories.settings.access.invitedBy", {
                        inviter: invitation.inviter.login,
                        date: formatIssueDate(invitation.createdAt, i18n.resolvedLanguage ?? "en"),
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      cancelMutation.reset();
                      setCancelInvitation(invitation);
                    }}
                  >
                    <X /> {t("workspace.repositories.settings.access.cancelInvitation")}
                  </Button>
                </div>
              ))}
            </div>
            {invitationsResult.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={invitationsResult.isFetchingNextPage}
                onClick={() => void invitationsResult.fetchNextPage()}
              >
                {invitationsResult.isFetchingNextPage ? <Spinner /> : null}
                {t("workspace.repositories.settings.access.loadMoreInvitations")}
              </Button>
            ) : null}
          </section>
        ) : null}

        {invitations.length ? <Separator /> : null}

        <section className="flex flex-col gap-2">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.06em] uppercase">
            {t("workspace.repositories.settings.access.collaborators")}
          </p>
          {collaboratorsResult.isError ? (
            <AccessError
              title={t("workspace.repositories.settings.access.collaboratorsLoadFailed")}
              error={collaboratorsResult.error}
            />
          ) : collaboratorsResult.isPending ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : collaborators.length ? (
            <>
              <div className="divide-y rounded-lg border">
                {collaborators.map((collaborator) => (
                  <div
                    key={collaborator.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <AccessUser user={collaborator} />
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {t("workspace.repositories.settings.access.write")}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          removeMutation.reset();
                          setRemoveCollaborator(collaborator);
                        }}
                      >
                        <Trash2 /> {t("workspace.repositories.settings.access.remove")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {collaboratorsResult.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={collaboratorsResult.isFetchingNextPage}
                  onClick={() => void collaboratorsResult.fetchNextPage()}
                >
                  {collaboratorsResult.isFetchingNextPage ? <Spinner /> : null}
                  {t("workspace.repositories.settings.access.loadMoreCollaborators")}
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-5 text-center text-xs">
              {t("workspace.repositories.settings.access.empty")}
            </p>
          )}
        </section>
      </CardContent>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (inviteMutation.isPending) return;
          setInviteOpen(open);
          if (!open) inviteMutation.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.settings.access.inviteTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.settings.access.inviteDescription")}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="repository-collaborator-username">
              {t("workspace.repositories.settings.access.username")}
            </FieldLabel>
            <Input
              id="repository-collaborator-username"
              value={username}
              autoComplete="off"
              maxLength={39}
              placeholder="octocat"
              disabled={inviteMutation.isPending}
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
            <FieldDescription>
              {t("workspace.repositories.settings.access.writeOnlyDescription")}
            </FieldDescription>
          </Field>
          {inviteMutation.error ? (
            <AccessError
              title={t("workspace.repositories.settings.access.inviteFailed")}
              error={inviteMutation.error}
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={inviteMutation.isPending}
              onClick={() => setInviteOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!username.trim() || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              {inviteMutation.isPending ? <Spinner /> : <UserPlus />}
              {t("workspace.repositories.settings.access.sendInvitation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(cancelInvitation)}
        onOpenChange={(open) => {
          if (cancelMutation.isPending) return;
          if (!open) {
            setCancelInvitation(null);
            cancelMutation.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.settings.access.cancelInvitationTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.settings.access.cancelInvitationDescription", {
                username: cancelInvitation?.invitee.login,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelMutation.error ? (
            <AccessError
              title={t("workspace.repositories.settings.access.cancelInvitationFailed")}
              error={cancelMutation.error}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!cancelInvitation || cancelMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (cancelInvitation) cancelMutation.mutate(cancelInvitation);
              }}
            >
              {cancelMutation.isPending ? <Spinner /> : <X />}
              {t("workspace.repositories.settings.access.cancelInvitation")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(removeCollaborator)}
        onOpenChange={(open) => {
          if (removeMutation.isPending) return;
          if (!open) {
            setRemoveCollaborator(null);
            removeMutation.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.settings.access.removeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.settings.access.removeDescription", {
                username: removeCollaborator?.login,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeMutation.error ? (
            <AccessError
              title={t("workspace.repositories.settings.access.removeFailed")}
              error={removeMutation.error}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!removeCollaborator || removeMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (removeCollaborator) removeMutation.mutate(removeCollaborator);
              }}
            >
              {removeMutation.isPending ? <Spinner /> : <Trash2 />}
              {t("workspace.repositories.settings.access.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
