// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitHubCommitComment } from "./github-data";
import { GitHubCommitCommentFileDiff } from "./github-commit-comment-diff";

vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./github-commit-comment-card", () => ({
  GitHubCommitCommentCard: ({ comment }: { comment: GitHubCommitComment }) => (
    <article>{comment.body}</article>
  ),
}));
vi.mock("./github-commit-comment-composer", () => ({
  GitHubCommitCommentComposer: ({
    placement,
  }: {
    placement?: { path: string; position: number };
  }) => <div>{placement ? `${placement.path}:${placement.position}` : "general"}</div>,
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
const file = {
  path: "src/main.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  changes: 2,
  patch: "@@ -1 +1 @@\n-before\n+after",
};

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => cleanup());

describe("GitHub commit comment diff", () => {
  it("keeps keyboard-accessible comment actions tied to exact raw positions", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <GitHubCommitCommentFileDiff
          file={file}
          viewType="unified"
          target={target}
          repository={repository}
          comments={[]}
          canCreateComment
        />
      </TooltipProvider>
    );

    const actions = screen.getAllByRole("button", {
      name: "workspace.repositories.commentOnLine",
    });
    expect(actions).toHaveLength(2);
    await user.click(actions[1]);
    expect(screen.getByText("src/main.ts:2")).toBeDefined();
  });

  it("renders an exact placed comment without exposing write controls when reads are unavailable", () => {
    const comment: GitHubCommitComment = {
      id: "CC_42",
      databaseId: 42,
      commitSha: target.commitSha,
      body: "Line feedback",
      path: "src/main.ts",
      position: 2,
      line: 1,
      author: null,
      authorAssociation: null,
      url: `${repository.url}/commit/${target.commitSha}#commitcomment-42`,
      createdAt: "2026-08-30T01:00:00Z",
      updatedAt: "2026-08-30T01:00:00Z",
      viewerCanUpdate: false,
      viewerCanDelete: false,
    };
    render(
      <TooltipProvider>
        <GitHubCommitCommentFileDiff
          file={file}
          viewType="unified"
          target={target}
          repository={repository}
          comments={[comment]}
          canCreateComment={false}
        />
      </TooltipProvider>
    );

    expect(screen.getByText("Line feedback")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "workspace.repositories.commentOnLine" })
    ).toBeNull();
  });
});
