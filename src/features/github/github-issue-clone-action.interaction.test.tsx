// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueCloneAction } from "./github-issue-clone-action";
import type { GitHubIssue } from "./github-data";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};
const issue: GitHubIssue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Current Issue",
  body: "Current body",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "open",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => vi.mocked(invoke).mockReset());
afterEach(() => cleanup());

function renderAction(onCloned = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueCloneAction repository={repository} issue={issue} onCloned={onCloned} />
    </QueryClientProvider>
  );
  return onCloned;
}

describe("GitHub Issue clone action", () => {
  it("loads authoritative status, preserves editable content, and creates the clone", async () => {
    const clone = {
      repositoryId: "R_1",
      repositoryFullName: "octocat/hello-world",
      sourceIssueNodeId: "I_7",
      sourceIssueNumber: 7,
      targetIssueNodeId: "I_8",
      targetIssueNumber: 8,
      targetIssueUrl: "https://github.com/octocat/hello-world/issues/8",
    };
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_clone_status") {
        return Promise.resolve({
          repositoryId: "R_1",
          repositoryFullName: "octocat/hello-world",
          issueNodeId: "I_7",
          issueNumber: 7,
          title: "Current Issue",
          body: "Current body",
          sourceOpen: true,
          destinationAllowsBlankIssues: true,
          viewerCanClone: true,
        });
      }
      if (command === "github_clone_repository_issue") return Promise.resolve(clone);
      return Promise.resolve(undefined);
    });
    const onCloned = renderAction();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "workspace.repositories.cloneIssue" })
    );
    expect(
      (screen.getByLabelText("workspace.repositories.issueTitle") as HTMLInputElement).value
    ).toBe("Current Issue");
    expect(screen.getByText("workspace.repositories.cloneIssueDescription")).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.cloneIssueConfirm" })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_clone_repository_issue", {
        owner: "octocat",
        repository: "hello-world",
        issueNumber: 7,
        expectedIssueNodeId: "I_7",
        title: "Current Issue",
        body: "Current body",
      })
    );
    expect(onCloned).toHaveBeenCalledWith(clone);
  });
});
