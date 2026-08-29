import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubReceivedRepositoryInvitationPage } from "./github-data";
import {
  invalidateReceivedRepositoryInvitationResolution,
  removeReceivedRepositoryInvitationFromCache,
  updateReceivedRepositoryInvitation,
} from "./github-repository-invitations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("received repository invitation mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("invokes the exact account-scoped invitation command", async () => {
    await updateReceivedRepositoryInvitation({ invitationId: 73, action: "accept" });
    await updateReceivedRepositoryInvitation({ invitationId: 74, action: "decline" });

    expect(invoke).toHaveBeenNthCalledWith(1, "github_update_received_repository_invitation", {
      invitationId: 73,
      action: "accept",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_received_repository_invitation", {
      invitationId: 74,
      action: "decline",
    });
  });

  it("removes the resolved invitation from every loaded page", () => {
    const queryClient = new QueryClient();
    const invitation = {
      id: 73,
      repository: { id: 1 },
      inviter: { id: 2 },
      permission: "write",
      createdAt: "2026-08-29T08:00:00Z",
    };
    queryClient.setQueryData<InfiniteData<GitHubReceivedRepositoryInvitationPage>>(
      githubQueryKeys.receivedRepositoryInvitations,
      {
        pages: [
          {
            invitations: [invitation],
            page: 1,
            hasPrevious: false,
            hasMore: true,
          } as GitHubReceivedRepositoryInvitationPage,
          {
            invitations: [{ ...invitation, id: 74 }],
            page: 2,
            hasPrevious: true,
            hasMore: false,
          } as GitHubReceivedRepositoryInvitationPage,
        ],
        pageParams: [1, 2],
      }
    );

    removeReceivedRepositoryInvitationFromCache(queryClient, 73);

    const cached = queryClient.getQueryData<InfiniteData<GitHubReceivedRepositoryInvitationPage>>(
      githubQueryKeys.receivedRepositoryInvitations
    );
    expect(cached?.pages[0].invitations).toEqual([]);
    expect(cached?.pages[1].invitations.map((item) => item.id)).toEqual([74]);
  });

  it("refreshes repositories only after an accepted invitation", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateReceivedRepositoryInvitationResolution(queryClient, "decline");
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: githubQueryKeys.repositories });

    await invalidateReceivedRepositoryInvitationResolution(queryClient, "accept");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: githubQueryKeys.repositories });
  });
});
