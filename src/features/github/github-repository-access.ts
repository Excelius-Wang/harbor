import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubRepositoryCollaboratorPage,
  GitHubRepositoryInvitation,
  GitHubRepositoryInvitationPage,
  GitHubRepositoryInviteResult,
} from "./github-data";
import { githubQueryKeys, type GitHubRepositoryTarget } from "./github-queries";

export function invitePersonalRepositoryCollaborator(
  target: GitHubRepositoryTarget,
  username: string
) {
  return invoke<GitHubRepositoryInviteResult>("github_invite_personal_repository_collaborator", {
    ...target,
    username,
  });
}

export function cancelPersonalRepositoryInvitation(
  target: GitHubRepositoryTarget,
  invitationId: number
) {
  return invoke<void>("github_cancel_personal_repository_invitation", {
    ...target,
    invitationId,
  });
}

export function removePersonalRepositoryCollaborator(
  target: GitHubRepositoryTarget,
  username: string
) {
  return invoke<void>("github_remove_personal_repository_collaborator", {
    ...target,
    username,
  });
}

export function syncRepositoryInvitation(
  queryClient: QueryClient,
  target: GitHubRepositoryTarget,
  invitation: GitHubRepositoryInvitation
) {
  queryClient.setQueryData<InfiniteData<GitHubRepositoryInvitationPage>>(
    githubQueryKeys.repositoryInvitations(target),
    (current) => {
      if (!current?.pages.length) return current;
      const pages = current.pages.map((page) => ({
        ...page,
        invitations: page.invitations.filter((item) => item.id !== invitation.id),
      }));
      pages[0] = { ...pages[0], invitations: [invitation, ...pages[0].invitations] };
      return { ...current, pages };
    }
  );
}

export function syncCancelledRepositoryInvitation(
  queryClient: QueryClient,
  target: GitHubRepositoryTarget,
  invitationId: number
) {
  queryClient.setQueryData<InfiniteData<GitHubRepositoryInvitationPage>>(
    githubQueryKeys.repositoryInvitations(target),
    (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              invitations: page.invitations.filter((item) => item.id !== invitationId),
            })),
          }
        : current
  );
}

export function syncRemovedRepositoryCollaborator(
  queryClient: QueryClient,
  target: GitHubRepositoryTarget,
  username: string
) {
  queryClient.setQueryData<InfiniteData<GitHubRepositoryCollaboratorPage>>(
    githubQueryKeys.repositoryCollaborators(target),
    (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              collaborators: page.collaborators.filter(
                (collaborator) => collaborator.login.toLowerCase() !== username.toLowerCase()
              ),
            })),
          }
        : current
  );
}

export function invalidatePersonalRepositoryAccess(
  queryClient: QueryClient,
  target: GitHubRepositoryTarget
) {
  return queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositoryAccess(target) });
}
