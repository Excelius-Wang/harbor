// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitHubDiscussionComment } from "./github-data";
import { administrationFixture } from "@/dev/administration-fixtures";
import { GitHubDiscussionDetail } from "./github-discussion-detail";
import type { GitHubDiscussionDetailPage, GitHubRepository } from "./github-data";
import { GitHubDiscussionCommentCard } from "./github-discussion-comment";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./github-readme", () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("./github-reactions-provider", () => ({
  GitHubReactionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./github-reaction-bar", () => ({ GitHubReactionBar: () => null }));
const repository = {
  owner: "octocat",
  name: "harbor",
  url: "https://github.com/octocat/harbor",
  defaultBranch: "main",
};
const target = { owner: repository.owner, repository: repository.name, discussionNumber: 1 };
const comment: GitHubDiscussionComment = {
  id: "DC_1",
  body: "Parent comment",
  url: `${repository.url}/discussions/1#discussioncomment-1`,
  author: "octocat",
  authorAssociation: "OWNER",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  isAnswer: false,
  isMinimized: false,
  upvoteCount: 1,
  viewerCanDelete: true,
  viewerCanMarkAsAnswer: true,
  viewerCanUnmarkAsAnswer: false,
  viewerCanUpdate: true,
  viewerCanUpvote: true,
  viewerCanMinimize: true,
  viewerCanUnminimize: false,
  viewerDidAuthor: true,
  viewerHasUpvoted: false,
  replies: [],
  repliesHaveMore: false,
};
function mount(nested = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const value = nested
    ? { ...comment, replies: [{ ...comment, id: "DC_2", body: "Nested reply", replies: [] }] }
    : comment;
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubDiscussionCommentCard
          repository={repository}
          target={target}
          comment={value}
          canReply
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.assign(HTMLElement.prototype, {
    scrollIntoView() {},
    hasPointerCapture: () => false,
    setPointerCapture() {},
    releasePointerCapture() {},
  });
});
beforeEach(() => {
  vi.mocked(invoke).mockReset();
});
afterEach(() => cleanup());

describe("Discussion reply operations", () => {
  it.each(["reply", "edit"])(
    "keeps a pending %s editor mounted and blocks competing actions",
    async (kind) => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();
      mount();
      const toggle = screen.getByRole("button", { name: `workspace.repositories.${kind}` });
      await user.click(toggle);
      await user.clear(screen.getByRole("textbox"));
      await user.type(screen.getByRole("textbox"), "Preserve my draft");
      await user.click(
        screen.getByRole("button", {
          name:
            kind === "reply"
              ? "workspace.repositories.postDiscussionComment"
              : "workspace.repositories.saveChanges",
        })
      );
      await waitFor(() => expect(invoke).toHaveBeenCalled());
      expect(toggle.hasAttribute("disabled")).toBe(true);
      expect(
        screen
          .getByRole("button", { name: "workspace.repositories.delete" })
          .hasAttribute("disabled")
      ).toBe(true);
      await user.click(toggle);
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Preserve my draft");
    }
  );

  it("does not open overlapping reply and edit fields for the same comment", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.reply" }));
    await user.type(screen.getByRole("textbox"), "Reply draft");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.edit" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Reply draft");
  });

  it("blocks deleting a parent while its nested reply is saving", async () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    mount(true);
    await user.click(screen.getAllByRole("button", { name: "workspace.repositories.edit" })[1]);
    await user.type(screen.getByRole("textbox"), " Updated");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.saveChanges" }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(
      screen
        .getAllByRole("button", { name: "workspace.repositories.delete" })[0]
        .hasAttribute("disabled")
    ).toBe(true);
  });
});

describe("Discussion-level write exclusion", () => {
  it.each(["vote", "close", "delete", "reopen"])(
    "blocks an existing reply during a pending %s",
    async (action) => {
      const page = administrationFixture(
        "github_get_repository_discussion",
        target,
        [{ ...repository, fullName: "octocat/harbor" }] as GitHubRepository[],
        false
      ) as GitHubDiscussionDetailPage;
      page.discussion.state = action === "reopen" ? "closed" : "open";
      page.discussion.viewerCanUpvote =
        page.discussion.viewerCanClose =
        page.discussion.viewerCanDelete =
        page.discussion.viewerCanReopen =
          true;
      vi.mocked(invoke).mockImplementation((command) =>
        command === "github_get_repository_discussion"
          ? Promise.resolve(page)
          : new Promise(() => {})
      );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <GitHubDiscussionDetail
              repository={repository}
              discussionNumber={1}
              categories={[]}
              onBack={() => {}}
            />
            <GitHubDiscussionCommentCard
              repository={repository}
              target={target}
              comment={comment}
              canReply
            />
          </TooltipProvider>
        </QueryClientProvider>
      );
      const user = userEvent.setup();
      await user.click(
        screen.getAllByRole("button", { name: "workspace.repositories.reply" }).slice(-1)[0]
      );
      await user.type(screen.getByRole("textbox"), "Keep this reply draft");
      const names = {
        vote: "upvoteDiscussion",
        close: "closeDiscussion",
        delete: "deleteDiscussion",
        reopen: "reopenDiscussion",
      };
      await user.click(
        await screen.findByRole("button", {
          name: `workspace.repositories.${names[action as keyof typeof names]}`,
        })
      );
      if (action === "close" || action === "delete")
        await user.click(
          screen.getByRole("button", {
            name: `workspace.repositories.${names[action]}`,
          })
        );
      await waitFor(() =>
        expect(
          screen
            .getByRole("button", {
              name: "workspace.repositories.postDiscussionComment",
              hidden: true,
            })
            .hasAttribute("disabled")
        ).toBe(true)
      );
      expect((screen.getByRole("textbox", { hidden: true }) as HTMLTextAreaElement).value).toBe(
        "Keep this reply draft"
      );
      expect(
        vi
          .mocked(invoke)
          .mock.calls.some(([command]) => command === "github_create_repository_discussion_comment")
      ).toBe(false);
    }
  );
});
