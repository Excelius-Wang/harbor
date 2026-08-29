import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubRepositoryCollaboratorPage,
  GitHubRepositoryInvitation,
  GitHubRepositoryInvitationPage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";
import {
  cancelPersonalRepositoryInvitation,
  invitePersonalRepositoryCollaborator,
  removePersonalRepositoryCollaborator,
  syncCancelledRepositoryInvitation,
  syncRemovedRepositoryCollaborator,
  syncRepositoryInvitation,
} from "./github-repository-access";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const target = { owner: "octocat", repository: "harbor" };
const user = (id: number, login: string) => ({
  id,
  login,
  avatarUrl: `https://avatars.githubusercontent.com/${login}`,
  url: `https://github.com/${login}`,
});
const invitation: GitHubRepositoryInvitation = {
  id: 7,
  invitee: user(2, "hubot"),
  inviter: user(1, "octocat"),
  createdAt: "2026-08-29T12:00:00Z",
};

describe("personal repository access", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("uses the exact owner-scoped Tauri mutation contracts", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ status: "invited", invitation });
    await invitePersonalRepositoryCollaborator(target, "hubot");
    expect(invoke).toHaveBeenLastCalledWith("github_invite_personal_repository_collaborator", {
      ...target,
      username: "hubot",
    });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await cancelPersonalRepositoryInvitation(target, 7);
    expect(invoke).toHaveBeenLastCalledWith("github_cancel_personal_repository_invitation", {
      ...target,
      invitationId: 7,
    });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await removePersonalRepositoryCollaborator(target, "hubot");
    expect(invoke).toHaveBeenLastCalledWith("github_remove_personal_repository_collaborator", {
      ...target,
      username: "hubot",
    });
  });

  it("reconciles invitation and collaborator pages without duplicates", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<InfiniteData<GitHubRepositoryInvitationPage>>(
      githubQueryKeys.repositoryInvitations(target),
      {
        pages: [
          {
            invitations: [{ ...invitation, createdAt: "old" }],
            page: 1,
            hasPrevious: false,
            hasMore: false,
          },
        ],
        pageParams: [1],
      }
    );
    queryClient.setQueryData<InfiniteData<GitHubRepositoryCollaboratorPage>>(
      githubQueryKeys.repositoryCollaborators(target),
      {
        pages: [
          {
            collaborators: [user(2, "Hubot"), user(3, "monalisa")],
            page: 1,
            hasPrevious: false,
            hasMore: false,
          },
        ],
        pageParams: [1],
      }
    );

    syncRepositoryInvitation(queryClient, target, invitation);
    const invitations = queryClient.getQueryData<InfiniteData<GitHubRepositoryInvitationPage>>(
      githubQueryKeys.repositoryInvitations(target)
    );
    expect(invitations?.pages[0].invitations).toEqual([invitation]);

    syncCancelledRepositoryInvitation(queryClient, target, 7);
    expect(
      queryClient.getQueryData<InfiniteData<GitHubRepositoryInvitationPage>>(
        githubQueryKeys.repositoryInvitations(target)
      )?.pages[0].invitations
    ).toEqual([]);

    syncRemovedRepositoryCollaborator(queryClient, target, "hubot");
    expect(
      queryClient
        .getQueryData<
          InfiniteData<GitHubRepositoryCollaboratorPage>
        >(githubQueryKeys.repositoryCollaborators(target))
        ?.pages[0].collaborators.map((collaborator) => collaborator.login)
    ).toEqual(["monalisa"]);
  });
});
