// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GitHubCommentActions } from "./github-comment-actions";

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

afterEach(() => cleanup());

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};

function renderActions(overrides: Record<string, unknown> = {}, mutateComment = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    mutateComment,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <GitHubCommentActions
            comment={{
              id: "IC_1",
              body: "Please keep this focused.",
              updatedAt: "2026-08-30T08:00:00Z",
              viewerCanUpdate: false,
              viewerCanDelete: false,
              isMinimized: false,
              viewerCanMinimize: true,
              viewerCanUnminimize: false,
              ...overrides,
            }}
            repository={repository}
            reference="main"
            permissionMessage="permission denied"
            mutateComment={mutateComment}
            onSuccess={vi.fn()}
          />
        </TooltipProvider>
      </QueryClientProvider>
    ),
  };
}

describe("GitHub comment minimization", () => {
  it("requires a reason and sends a guarded minimize mutation", async () => {
    const user = userEvent.setup();
    const mutateComment = vi.fn().mockResolvedValue(null);
    renderActions({}, mutateComment);

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.minimizeComment" })
    );
    expect(screen.getByText("workspace.repositories.minimizeCommentDescription")).toBeDefined();
    await user.click(screen.getByRole("combobox"));
    await user.click(
      screen.getByRole("option", { name: "workspace.repositories.minimizeReasons.spam" })
    );
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.confirmMinimizeComment" })
    );

    expect(mutateComment.mock.calls[0]?.[0]).toEqual({
      action: "minimize",
      commentId: "IC_1",
      expectedUpdatedAt: "2026-08-30T08:00:00Z",
      expectedMinimized: false,
      classifier: "spam",
    });
  });

  it("sends an unminimize mutation only when GitHub grants the capability", async () => {
    const user = userEvent.setup();
    const mutateComment = vi.fn().mockResolvedValue(null);
    renderActions(
      {
        isMinimized: true,
        viewerCanMinimize: false,
        viewerCanUnminimize: true,
      },
      mutateComment
    );

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.unminimizeComment" })
    );

    expect(mutateComment.mock.calls[0]?.[0]).toEqual({
      action: "unminimize",
      commentId: "IC_1",
      expectedUpdatedAt: "2026-08-30T08:00:00Z",
      expectedMinimized: true,
    });
  });
});
