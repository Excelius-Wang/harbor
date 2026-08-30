// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue, GitHubIssueStateCapabilities } from "./github-data";
import { GitHubIssueComposer } from "./github-issue-detail";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const target = { owner: "octocat", repository: "hello-world", issueNumber: 7 };
const repository = {
  owner: target.owner,
  name: target.repository,
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};
const issue: GitHubIssue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Keep the example focused",
  url: `${repository.url}/issues/7`,
  state: "open",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 1,
  createdAt: "2026-08-25T08:00:00Z",
  updatedAt: "2026-08-30T08:00:00Z",
};
const capabilities: GitHubIssueStateCapabilities = {
  repositoryId: "R_1",
  repositoryFullName: "octocat/hello-world",
  issueNodeId: "I_7",
  number: 7,
  state: "open",
  updatedAt: issue.updatedAt,
  viewerCanClose: true,
  viewerCanReopen: false,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderComposer() {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubIssueComposer issue={issue} repository={repository} target={target} />
    </QueryClientProvider>
  );
  return queryClient;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("GitHub Issue composer state controls", () => {
  it("preserves the comment draft while closing with the selected reason", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        return Promise.resolve(capabilities);
      }
      if (command === "github_update_repository_issue_state") {
        return Promise.resolve({ ...issue, state: "closed", stateReason: "notPlanned" });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    const user = userEvent.setup();
    renderComposer();

    const textbox = await screen.findByRole("textbox");
    await user.type(textbox, "Keep this draft");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.chooseIssueCloseReason" })
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_update_repository_issue_state", {
        ...target,
        mutation: {
          desiredState: "closed",
          closeReason: "notPlanned",
          expected: {
            issueId: issue.id,
            issueNodeId: issue.reactionSubject.id,
            state: "open",
            stateReason: null,
            updatedAt: issue.updatedAt,
          },
        },
      })
    );
    expect((textbox as HTMLTextAreaElement).value).toBe("Keep this draft");
  });

  it("keeps comments usable and offers Retry when capability loading fails", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: "github", message: "unavailable" });
    const user = userEvent.setup();
    renderComposer();

    expect(await screen.findByText("workspace.repositories.issueActionsLoadFailed")).toBeDefined();
    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "Draft remains editable");

    expect((textbox as HTMLTextAreaElement).value).toBe("Draft remains editable");
    expect(screen.getByRole("button", { name: "workspace.repositories.retry" })).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: "workspace.repositories.closeIssueAsCompleted" })
        .hasAttribute("disabled")
    ).toBe(true);
  });
});
