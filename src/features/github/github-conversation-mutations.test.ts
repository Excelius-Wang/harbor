import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubConversationControls } from "./github-data";
import {
  syncConversationControls,
  updateRepositoryConversationLock,
  updateRepositoryConversationSubscription,
} from "./github-conversation-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = {
  owner: "octocat",
  repository: "hello-world",
  conversationNumber: 7,
  conversationKind: "issue" as const,
};

const controls: GitHubConversationControls = {
  kind: "issue",
  number: 7,
  locked: true,
  lockReason: "resolved",
  viewerCanLock: true,
  viewerCanSubscribe: true,
  viewerSubscription: "subscribed",
};

describe("GitHub conversation mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("invokes the shared lock and subscription Tauri commands", async () => {
    vi.mocked(invoke).mockResolvedValue(controls);

    await updateRepositoryConversationLock(target, "lock", "resolved");
    await updateRepositoryConversationLock(target, "unlock");
    await updateRepositoryConversationSubscription(target, "subscribe");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_update_repository_conversation_lock", {
      ...target,
      action: "lock",
      reason: "resolved",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_repository_conversation_lock", {
      ...target,
      action: "unlock",
    });
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      "github_update_repository_conversation_subscription",
      { ...target, action: "subscribe" }
    );
  });

  it("reconciles the focused controls cache from the authoritative response", () => {
    const queryClient = new QueryClient();

    syncConversationControls(queryClient, target, controls);

    expect(queryClient.getQueryData(githubQueryKeys.conversationControls(target))).toEqual(
      controls
    );
  });
});
