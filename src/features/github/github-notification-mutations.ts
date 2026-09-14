import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubNotificationAction, GitHubNotificationPage } from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubNotificationMutationTarget = {
  threadId: number;
  action: GitHubNotificationAction;
};

export const notificationWriteKey = [...githubQueryKeys.notificationsRoot, "write"] as const;

export function notificationWritePending(queryClient: QueryClient, threadId?: number) {
  return (
    queryClient.isMutating({
      mutationKey: notificationWriteKey,
      predicate: (mutation) => {
        const target = mutation.state.variables as GitHubNotificationMutationTarget | undefined;
        return threadId === undefined || target === undefined || target.threadId === threadId;
      },
    }) > 0
  );
}

export function updateGitHubNotification(target: GitHubNotificationMutationTarget) {
  return invoke<void>("github_update_notification", target);
}

export function markAllGitHubNotificationsRead() {
  return invoke<void>("github_mark_all_notifications_read");
}

export function removeGitHubNotificationFromCache(queryClient: QueryClient, threadId: number) {
  queryClient.setQueriesData<GitHubNotificationPage>(
    { queryKey: githubQueryKeys.notificationsRoot },
    (page) =>
      page
        ? {
            ...page,
            notifications: page.notifications.filter(
              (notification) => notification.id !== threadId
            ),
          }
        : page
  );
}

export async function invalidateGitHubNotifications(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: githubQueryKeys.notificationsRoot });
}
