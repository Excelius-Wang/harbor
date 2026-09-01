// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { GitHubDiscussionCommentMinimizeAction } from "./github-discussion-comment-minimize";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  Object.assign(HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    scrollIntoView: () => {},
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const target = {
  owner: "octocat",
  repository: "hello-world",
  discussionNumber: 42,
};

function renderAction(overrides: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GitHubDiscussionCommentMinimizeAction
        target={target}
        comment={{
          id: "DC_1",
          body: "Please keep this focused.",
          url: "https://github.com/octocat/hello-world/discussions/42#discussioncomment-1",
          authorAssociation: "COLLABORATOR",
          createdAt: "2026-08-30T08:00:00Z",
          updatedAt: "2026-08-30T08:00:00Z",
          isAnswer: false,
          isMinimized: false,
          upvoteCount: 0,
          viewerCanDelete: false,
          viewerCanMarkAsAnswer: false,
          viewerCanUnmarkAsAnswer: false,
          viewerCanUpdate: false,
          viewerCanUpvote: false,
          viewerCanMinimize: true,
          viewerCanUnminimize: false,
          viewerDidAuthor: false,
          viewerHasUpvoted: false,
          replies: [],
          repliesHaveMore: false,
          ...overrides,
        }}
      />
    </QueryClientProvider>
  );
}

describe("GitHub Discussion comment minimization", () => {
  it("requires a reason and sends the guarded mutation", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue(null);
    renderAction();

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.minimizeComment" })
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(
      screen.getByRole("option", { name: "workspace.repositories.minimizeReasons.spam" })
    );
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.confirmMinimizeComment" })
    );

    expect(invoke).toHaveBeenCalledWith("github_mutate_repository_discussion_comment", {
      ...target,
      mutation: {
        action: "minimize",
        commentId: "DC_1",
        expectedUpdatedAt: "2026-08-30T08:00:00Z",
        expectedMinimized: false,
        classifier: "spam",
      },
    });
  });

  it("only offers unminimize when GitHub grants that capability", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue(null);
    renderAction({
      isMinimized: true,
      viewerCanMinimize: false,
      viewerCanUnminimize: true,
      minimizedReason: "off-topic",
    });

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.unminimizeComment" })
    );

    expect(invoke).toHaveBeenCalledWith("github_mutate_repository_discussion_comment", {
      ...target,
      mutation: {
        action: "unminimize",
        commentId: "DC_1",
        expectedUpdatedAt: "2026-08-30T08:00:00Z",
        expectedMinimized: true,
      },
    });
  });
});
