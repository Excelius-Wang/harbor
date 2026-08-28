import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubNotificationAction, GitHubNotificationPage } from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubNotificationMutationTarget = {
  threadId: number;
  action: GitHubNotificationAction;
};

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
