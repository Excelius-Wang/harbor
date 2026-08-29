import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubNotificationPage } from "./github-data";
import {
  markAllGitHubNotificationsRead,
  removeGitHubNotificationFromCache,
  updateGitHubNotification,
} from "./github-notification-mutations";
import { notificationCanOpenInApp } from "./github-notification-target";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("GitHub notification mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("invokes the focused notification commands", async () => {
    await updateGitHubNotification({ threadId: 42, action: "read" });
    await updateGitHubNotification({ threadId: 42, action: "done" });
    await markAllGitHubNotificationsRead();

    expect(invoke).toHaveBeenNthCalledWith(1, "github_update_notification", {
      threadId: 42,
      action: "read",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_notification", {
      threadId: 42,
      action: "done",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_mark_all_notifications_read");
  });

  it("removes a handled thread from every cached notification filter", () => {
    const queryClient = new QueryClient();
    const notification = {
      id: 42,
      repository: {
        id: 1,
        owner: "octocat",
        name: "hello-world",
        fullName: "octocat/hello-world",
        url: "https://github.com/octocat/hello-world",
        stars: 0,
        forks: 0,
        openIssues: 0,
        defaultBranch: "main",
        isPrivate: false,
        isFork: false,
        isArchived: false,
      },
      subject: {
        title: "Keep notifications inside Harbor",
        kind: "pullRequest" as const,
        number: 17,
        url: "https://github.com/octocat/hello-world/pull/17",
      },
      reason: "review_requested",
      unread: true,
      updatedAt: "2026-08-28T08:00:00Z",
    };
    const page: GitHubNotificationPage = {
      notifications: [notification],
      page: 1,
      hasPrevious: false,
      hasMore: false,
    };
    queryClient.setQueryData(
      githubQueryKeys.notifications({ participating: false, page: 1 }),
      page
    );
    queryClient.setQueryData(githubQueryKeys.notifications({ participating: true, page: 1 }), page);

    removeGitHubNotificationFromCache(queryClient, 42);

    expect(
      queryClient.getQueryData<GitHubNotificationPage>(
        githubQueryKeys.notifications({ participating: false, page: 1 })
      )?.notifications
    ).toEqual([]);
    expect(
      queryClient.getQueryData<GitHubNotificationPage>(
        githubQueryKeys.notifications({ participating: true, page: 1 })
      )?.notifications
    ).toEqual([]);
  });

  it("routes Releases with API identities into Harbor without guessing from titles", () => {
    const release = {
      id: 43,
      repository: {
        id: 1,
        owner: "octocat",
        name: "hello-world",
        fullName: "octocat/hello-world",
        url: "https://github.com/octocat/hello-world",
        stars: 0,
        forks: 0,
        openIssues: 0,
        defaultBranch: "main",
        isPrivate: false,
        isFork: false,
        isArchived: false,
      },
      subject: {
        title: "Version 1.0.0",
        kind: "release" as const,
        releaseId: 88,
        url: "https://github.com/octocat/hello-world/releases",
      },
      reason: "subscribed",
      unread: true,
      updatedAt: "2026-08-28T08:00:00Z",
    };

    expect(notificationCanOpenInApp(release)).toBe(true);
    expect(
      notificationCanOpenInApp({
        ...release,
        subject: { ...release.subject, releaseId: undefined },
      })
    ).toBe(false);

    for (const subject of [
      {
        title: "Commit",
        kind: "commit" as const,
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        url: release.subject.url,
      },
      {
        title: "Check suite",
        kind: "checkSuite" as const,
        checkSuiteId: 66,
        url: release.subject.url,
      },
      {
        title: "Workflow run",
        kind: "workflowRun" as const,
        workflowRunId: 42,
        url: release.subject.url,
      },
    ]) {
      expect(notificationCanOpenInApp({ ...release, subject })).toBe(true);
    }

    expect(
      notificationCanOpenInApp({
        ...release,
        subject: {
          title: "Invitation to octocat/hello-world",
          kind: "repositoryInvitation",
          url: "https://github.com/octocat/hello-world",
        },
      })
    ).toBe(true);
  });
});
