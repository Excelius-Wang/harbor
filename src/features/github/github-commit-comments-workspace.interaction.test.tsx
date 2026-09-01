// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubChangedFile,
  GitHubCommitComment,
  GitHubCommitCommentPage,
} from "./github-data";
import { GitHubCommitCommentsWorkspace } from "./github-commit-comments-workspace";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./github-commit-comment-card", () => ({
  GitHubCommitCommentCard: ({
    comment,
    disabled,
  }: {
    comment: GitHubCommitComment;
    disabled?: boolean;
  }) => (
    <article>
      <button type="button" disabled={disabled}>
        {comment.body}
      </button>
    </article>
  ),
}));
vi.mock("./github-commit-comment-composer", () => ({
  GitHubCommitCommentComposer: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      composer
    </button>
  ),
}));
vi.mock("./github-reactions-provider", () => ({
  GitHubReactionsProvider: ({ children }: { children: ReactNode }) => children,
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

function comment(overrides: Partial<GitHubCommitComment> = {}): GitHubCommitComment {
  return {
    id: "CC_42",
    databaseId: 42,
    commitSha: target.commitSha,
    body: "General feedback",
    path: null,
    position: null,
    line: null,
    author: null,
    authorAssociation: null,
    url: `${repository.url}/commit/${target.commitSha}#commitcomment-42`,
    createdAt: "2026-08-30T01:00:00Z",
    updatedAt: "2026-08-30T01:00:00Z",
    viewerCanUpdate: false,
    viewerCanDelete: false,
    isMinimized: false,
    minimizedReason: null,
    viewerCanMinimize: false,
    viewerCanUnminimize: false,
    ...overrides,
  };
}

function page(
  comments: GitHubCommitComment[],
  pageNumber = 1,
  hasMore = false
): GitHubCommitCommentPage {
  return { comments, page: pageNumber, hasPrevious: pageNumber > 1, hasMore };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWorkspace(client: QueryClient, files: GitHubChangedFile[] = []) {
  return render(
    <QueryClientProvider client={client}>
      <GitHubCommitCommentsWorkspace
        target={target}
        repository={repository}
        files={files}
        filesStillLoading={false}
      >
        {({ comments, canCreateComment }) => (
          <div data-testid="child-state">
            {comments.length}:{String(canCreateComment)}
          </div>
        )}
      </GitHubCommitCommentsWorkspace>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("GitHub commit comments workspace", () => {
  it("announces loading, exposes an empty state, and enables the composer after the first page", async () => {
    let resolvePage: (page: GitHubCommitCommentPage) => void = () => undefined;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      })
    );
    const client = createQueryClient();
    renderWorkspace(client);

    expect(
      screen.getByRole("status", { name: "workspace.repositories.loadingCommitComments" })
    ).toBeDefined();
    expect((screen.getByRole("button", { name: "composer" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    resolvePage(page([]));

    expect(await screen.findByText("workspace.repositories.noCommitComments")).toBeDefined();
    expect((screen.getByRole("button", { name: "composer" }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(screen.getByTestId("child-state").textContent).toBe("0:true");
  });

  it("retries an initial failure without hiding the changed-file child", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(page([]));
    const client = createQueryClient();
    const user = userEvent.setup();
    renderWorkspace(client);

    expect(await screen.findByText(/network unavailable/)).toBeDefined();
    expect(screen.getByTestId("child-state").textContent).toBe("0:false");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));
    expect(await screen.findByText("workspace.repositories.noCommitComments")).toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("keeps the first page visible when loading a later comment page fails", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(page([comment()], 1, true))
      .mockRejectedValueOnce(new Error("page two unavailable"));
    const client = createQueryClient();
    const user = userEvent.setup();
    renderWorkspace(client);

    expect(await screen.findByText("General feedback")).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.loadMoreCommitComments" })
    );
    expect(await screen.findByText(/page two unavailable/)).toBeDefined();
    expect(screen.getByText("General feedback")).toBeDefined();
    expect(screen.getByTestId("child-state").textContent).toBe("1:true");
  });

  it("locks comment writes until an authoritative refetch retry succeeds", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(page([comment()]))
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce(page([comment()]));
    const client = createQueryClient();
    const user = userEvent.setup();
    renderWorkspace(client);

    expect(await screen.findByText("General feedback")).toBeDefined();
    await client.invalidateQueries({ queryKey: githubQueryKeys.commitComments(target) });

    expect(
      await screen.findByText("workspace.repositories.commitCommentsRefreshFailed")
    ).toBeDefined();
    expect((screen.getByRole("button", { name: "composer" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole("button", { name: "General feedback" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByTestId("child-state").textContent).toBe("1:false");

    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));
    await waitFor(() =>
      expect(screen.queryByText("workspace.repositories.commitCommentsRefreshFailed")).toBeNull()
    );
    expect((screen.getByRole("button", { name: "composer" }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(
      (screen.getByRole("button", { name: "General feedback" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("keeps line comments readable until their exact diff position is loaded", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(
      page([
        comment({
          body: "Line feedback",
          path: "src/main.ts",
          position: 2,
          line: 1,
        }),
      ])
    );
    const client = createQueryClient();
    const view = renderWorkspace(client);

    expect(await screen.findByText("workspace.repositories.unplacedCommitComments")).toBeDefined();
    expect(screen.getByText("Line feedback")).toBeDefined();
    view.rerender(
      <QueryClientProvider client={client}>
        <GitHubCommitCommentsWorkspace
          target={target}
          repository={repository}
          files={[
            {
              path: "src/main.ts",
              status: "modified",
              additions: 1,
              deletions: 1,
              changes: 2,
              patch: "@@ -1 +1 @@\n-before\n+after",
            },
          ]}
          filesStillLoading={false}
        >
          {({ comments }) => <div>{comments.length} loaded</div>}
        </GitHubCommitCommentsWorkspace>
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(screen.queryByText("workspace.repositories.unplacedCommitComments")).toBeNull()
    );
  });
});
