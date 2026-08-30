// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GitHubCommitCommentCard } from "./github-commit-comment-card";
import type { GitHubCommitComment } from "./github-data";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./github-readme", () => ({ default: ({ content }: { content: string }) => content }));

const target = {
  owner: "octocat",
  repository: "hello-world",
  commitSha: "a".repeat(40),
};
const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};

function comment(body = "Old body"): GitHubCommitComment {
  return {
    id: "CC_42",
    databaseId: 42,
    commitSha: target.commitSha,
    body,
    path: "src/main.ts",
    position: 7,
    line: 14,
    author: { login: "octocat", avatarUrl: null },
    authorAssociation: "OWNER",
    url: `${repository.url}/commit/${target.commitSha}#commitcomment-42`,
    createdAt: "2026-08-30T01:00:00Z",
    updatedAt: body === "Old body" ? "2026-08-30T01:01:00Z" : "2026-08-30T01:02:00Z",
    viewerCanUpdate: true,
    viewerCanDelete: true,
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderCard(client: QueryClient) {
  client.setQueryData(githubQueryKeys.commitComments(target), {
    pages: [{ comments: [comment()], page: 1, hasPrevious: false, hasMore: false }],
    pageParams: [1],
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubCommitCommentCard target={target} repository={repository} comment={comment()} />
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

describe("GitHub commit comment card", () => {
  it("adapts the shared editor to numeric and Node ID guarded commit-comment writes", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(comment("New body"));
    const client = createQueryClient();
    const user = userEvent.setup();
    renderCard(client);

    await user.click(screen.getByRole("button", { name: "workspace.repositories.editComment" }));
    const textbox = screen.getByRole("textbox");
    await user.clear(textbox);
    expect(
      (
        screen.getByRole("button", {
          name: "workspace.repositories.saveComment",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    await user.type(textbox, "New body");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.saveComment" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("github_mutate_repository_commit_comment", {
      ...target,
      mutation: {
        action: "update",
        commentId: 42,
        commentNodeId: "CC_42",
        expectedUpdatedAt: "2026-08-30T01:01:00Z",
        body: "New body",
      },
    });
    expect(
      client.getQueryData<{
        pages: Array<{ comments: GitHubCommitComment[] }>;
      }>(githubQueryKeys.commitComments(target))?.pages[0].comments[0].body
    ).toBe("New body");
  });

  it("removes the focused comment only after confirmed deletion succeeds", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null);
    const client = createQueryClient();
    const user = userEvent.setup();
    renderCard(client);

    await user.click(screen.getByRole("button", { name: "workspace.repositories.deleteComment" }));
    await user.click(screen.getByRole("button", { name: "workspace.repositories.deleteComment" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("github_mutate_repository_commit_comment", {
      ...target,
      mutation: {
        action: "delete",
        commentId: 42,
        commentNodeId: "CC_42",
        expectedUpdatedAt: "2026-08-30T01:01:00Z",
      },
    });
    expect(
      client.getQueryData<{
        pages: Array<{ comments: GitHubCommitComment[] }>;
      }>(githubQueryKeys.commitComments(target))?.pages[0].comments
    ).toEqual([]);
  });

  it("keeps the edit open and invalidates the comment root after a stale conflict", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "githubCommentConflict",
      message: "stale",
    });
    const client = createQueryClient();
    const user = userEvent.setup();
    renderCard(client);

    await user.click(screen.getByRole("button", { name: "workspace.repositories.editComment" }));
    const textbox = screen.getByRole("textbox");
    await user.clear(textbox);
    await user.type(textbox, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.saveComment" }));

    expect(await screen.findByText("workspace.repositories.commentChanged")).toBeDefined();
    expect((textbox as HTMLTextAreaElement).value).toBe("Keep this draft");
    await waitFor(() =>
      expect(client.getQueryState(githubQueryKeys.commitComments(target))?.isInvalidated).toBe(true)
    );
  });

  it("keeps the draft and refreshes after an uncertain update", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: "github", message: "transport closed" });
    const client = createQueryClient();
    const user = userEvent.setup();
    renderCard(client);

    await user.click(screen.getByRole("button", { name: "workspace.repositories.editComment" }));
    const textbox = screen.getByRole("textbox");
    await user.clear(textbox);
    await user.type(textbox, "Check before retry");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.saveComment" }));

    expect(
      await screen.findByText("workspace.repositories.commitCommentWriteUncertain")
    ).toBeDefined();
    expect((textbox as HTMLTextAreaElement).value).toBe("Check before retry");
    await waitFor(() =>
      expect(client.getQueryState(githubQueryKeys.commitComments(target))?.isInvalidated).toBe(true)
    );
  });
});
