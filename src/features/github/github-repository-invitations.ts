import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubReceivedRepositoryInvitationAction,
  GitHubReceivedRepositoryInvitationPage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubReceivedRepositoryInvitationMutationTarget = {
  invitationId: number;
  action: GitHubReceivedRepositoryInvitationAction;
};

export function updateReceivedRepositoryInvitation(
  target: GitHubReceivedRepositoryInvitationMutationTarget
) {
  return invoke<void>("github_update_received_repository_invitation", target);
}

export function removeReceivedRepositoryInvitationFromCache(
  queryClient: QueryClient,
  invitationId: number
) {
  queryClient.setQueryData<InfiniteData<GitHubReceivedRepositoryInvitationPage>>(
    githubQueryKeys.receivedRepositoryInvitations,
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              invitations: page.invitations.filter((invitation) => invitation.id !== invitationId),
            })),
          }
        : data
  );
}

export async function invalidateReceivedRepositoryInvitationResolution(
  queryClient: QueryClient,
  action: GitHubReceivedRepositoryInvitationAction
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.receivedRepositoryInvitations,
    }),
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.notificationsRoot }),
    action === "accept"
      ? queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositories })
      : Promise.resolve(),
  ]);
}
