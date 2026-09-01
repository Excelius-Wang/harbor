// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubCommitComment } from "./github-data";
import { GitHubCommitCommentComposer } from "./github-commit-comment-composer";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

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

function createdComment(): GitHubCommitComment {
  return {
    id: "CC_42",
    databaseId: 42,
    commitSha: target.commitSha,
    body: "Keep this native",
    path: "src/main.ts",
    position: 7,
    line: 14,
    author: { login: "octocat", avatarUrl: null },
    authorAssociation: "OWNER",
    url: `${repository.url}/commit/${target.commitSha}#commitcomment-42`,
    createdAt: "2026-08-30T01:00:00Z",
    updatedAt: "2026-08-30T01:00:00Z",
    viewerCanUpdate: false,
    viewerCanDelete: false,
    isMinimized: false,
    minimizedReason: null,
    viewerCanMinimize: false,
    viewerCanUnminimize: false,
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("GitHub commit comment composer", () => {
  it("sends an exact diff position, synchronizes the cache, and clears the draft", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(createdComment());
    const client = createQueryClient();
    client.setQueryData(githubQueryKeys.commitComments(target), {
      pages: [{ comments: [], page: 1, hasPrevious: false, hasMore: false }],
      pageParams: [1],
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <GitHubCommitCommentComposer
          target={target}
          repository={repository}
          placement={{ path: "src/main.ts", position: 7 }}
        />
      </QueryClientProvider>
    );

    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "Keep this native");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.comment" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("github_mutate_repository_commit_comment", {
      ...target,
      mutation: {
        action: "create",
        body: "Keep this native",
        placement: { path: "src/main.ts", position: 7 },
      },
    });
    await waitFor(() => expect((textbox as HTMLTextAreaElement).value).toBe(""));
    expect(
      client.getQueryData<{
        pages: Array<{ comments: GitHubCommitComment[] }>;
      }>(githubQueryKeys.commitComments(target))?.pages[0].comments[0]
    ).toEqual(createdComment());
  });

  it("keeps the Markdown draft after a permission failure", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "githubPermission",
      message: "forbidden",
    });
    const client = createQueryClient();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <GitHubCommitCommentComposer target={target} repository={repository} />
      </QueryClientProvider>
    );

    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.comment" }));

    expect(
      await screen.findByText("workspace.repositories.commitCommentPermissionDenied")
    ).toBeDefined();
    expect((textbox as HTMLTextAreaElement).value).toBe("Keep this draft");
  });

  it("refreshes comments and warns before retry after an uncertain write", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: "github", message: "transport closed" });
    const client = createQueryClient();
    client.setQueryData(githubQueryKeys.commitComments(target), {
      pages: [{ comments: [], page: 1, hasPrevious: false, hasMore: false }],
      pageParams: [1],
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <GitHubCommitCommentComposer target={target} repository={repository} />
      </QueryClientProvider>
    );

    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "Do not duplicate this");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.comment" }));

    expect(
      await screen.findByText("workspace.repositories.commitCommentWriteUncertain")
    ).toBeDefined();
    expect((textbox as HTMLTextAreaElement).value).toBe("Do not duplicate this");
    await waitFor(() =>
      expect(client.getQueryState(githubQueryKeys.commitComments(target))?.isInvalidated).toBe(true)
    );
  });
});
