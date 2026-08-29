import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubConversationControls,
  GitHubConversationLockAction,
  GitHubConversationLockReason,
  GitHubConversationSubscriptionAction,
} from "./github-data";
import { githubQueryKeys, type GitHubConversationTarget } from "./github-queries";

export function updateRepositoryConversationLock(
  target: GitHubConversationTarget,
  action: GitHubConversationLockAction,
  reason?: GitHubConversationLockReason
) {
  return invoke<GitHubConversationControls>("github_update_repository_conversation_lock", {
    ...target,
    action,
    ...(reason ? { reason } : {}),
  });
}

export function updateRepositoryConversationSubscription(
  target: GitHubConversationTarget,
  action: GitHubConversationSubscriptionAction
) {
  return invoke<GitHubConversationControls>("github_update_repository_conversation_subscription", {
    ...target,
    action,
  });
}

export function syncConversationControls(
  queryClient: QueryClient,
  target: GitHubConversationTarget,
  controls: GitHubConversationControls
) {
  queryClient.setQueryData(githubQueryKeys.conversationControls(target), controls);
}
