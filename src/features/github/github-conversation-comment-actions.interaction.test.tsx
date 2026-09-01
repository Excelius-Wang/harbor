// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GitHubConversationCommentActions } from "./github-conversation-comment-actions";
import type { GitHubIssueTimelineItem } from "./github-data";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const target = {
  kind: "issue" as const,
  owner: "octocat",
  repository: "hello-world",
  issueNumber: 7,
};
const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};
const comment: GitHubIssueTimelineItem = {
  id: "IC_42",
  kind: "comment",
  event: "commented",
  actor: "octocat",
  body: "Keep this issue focused.",
  createdAt: "2026-08-29T08:00:00Z",
  updatedAt: "2026-08-29T08:01:00Z",
  viewerCanUpdate: false,
  viewerCanDelete: false,
  isPinned: false,
  viewerCanPin: true,
  viewerCanUnpin: false,
  isMinimized: false,
};

function renderActions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GitHubConversationCommentActions
          comment={comment}
          target={target}
          repository={repository}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("GitHub Issue comment pin action", () => {
  it("sends the guarded pin mutation and reports success", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_mutate_repository_issue_comment") {
        return Promise.resolve({
          ...comment,
          isPinned: true,
          viewerCanPin: false,
          viewerCanUnpin: true,
        });
      }
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "workspace.repositories.pinComment" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_mutate_repository_issue_comment", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        mutation: {
          action: "pin",
          commentId: "IC_42",
          expectedUpdatedAt: "2026-08-29T08:01:00Z",
          expectedPinned: false,
        },
      })
    );
  });
});
