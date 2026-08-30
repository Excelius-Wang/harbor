// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue, GitHubIssueStateCapabilities } from "./github-data";
import { GitHubIssueComposer } from "./github-issue-detail";
import { githubIssueStateQueryKeys } from "./github-issue-state-queries";
import { githubQueryKeys } from "./github-queries";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
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

function renderComposer(renderedIssue = issue) {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GitHubIssueComposer issue={renderedIssue} repository={repository} target={target} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return queryClient;
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
    const queryClient = renderComposer();
    const detailKey = githubQueryKeys.issueDetail({ ...target, timelinePage: 2 });
    queryClient.setQueryData(detailKey, { cached: true });

    const textbox = await screen.findByRole("textbox");
    await user.type(textbox, "Keep this draft");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.chooseIssueCloseReason" })
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: /workspace\.repositories\.closeIssueAsNotPlanned/,
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
    await waitFor(() => expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true));
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

  it("preserves the selected reason and comment draft after permission denial", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        return Promise.resolve(capabilities);
      }
      if (command === "github_update_repository_issue_state") {
        return Promise.reject({ code: "githubPermission", message: "forbidden" });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    const user = userEvent.setup();
    const queryClient = renderComposer();
    const detailKey = githubQueryKeys.issueDetail({ ...target, timelinePage: 2 });
    queryClient.setQueryData(detailKey, { cached: true });

    const textbox = await screen.findByRole("textbox");
    await user.type(textbox, "Keep this permission draft");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.chooseIssueCloseReason" })
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: /workspace\.repositories\.closeIssueAsNotPlanned/,
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    );

    expect(
      await screen.findByText("workspace.repositories.issueWritePermissionDenied")
    ).toBeDefined();
    expect((textbox as HTMLTextAreaElement).value).toBe("Keep this permission draft");
    expect(
      screen.getByRole("button", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    ).toBeDefined();
  });

  it("locks comment submission while an Issue state write is pending", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        return Promise.resolve(capabilities);
      }
      if (command === "github_update_repository_issue_state") {
        return new Promise(() => undefined);
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    const user = userEvent.setup();
    renderComposer();

    const textbox = await screen.findByRole("textbox");
    await user.type(textbox, "Do not submit this yet");
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.closeIssueAsCompleted",
      })
    );

    expect(
      screen
        .getByRole("button", { name: "workspace.repositories.comment" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "workspace.repositories.closingIssue" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("locks stale controls when a background capability refresh fails", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(capabilities)
      .mockRejectedValueOnce({ code: "github", message: "refresh unavailable" });
    const queryClient = renderComposer();

    const close = await screen.findByRole("button", {
      name: "workspace.repositories.closeIssueAsCompleted",
    });
    expect(close.hasAttribute("disabled")).toBe(false);
    await queryClient.invalidateQueries({
      queryKey: githubIssueStateQueryKeys.capabilitiesRoot(target),
    });

    expect(await screen.findByText("workspace.repositories.issueActionsLoadFailed")).toBeDefined();
    await waitFor(() => expect(close.hasAttribute("disabled")).toBe(true));
  });

  it("keeps Retry reachable when a failed mutation is followed by a failed capability refresh", async () => {
    let capabilityReads = 0;
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        capabilityReads += 1;
        return capabilityReads === 2
          ? Promise.reject({ code: "github", message: "refresh unavailable" })
          : Promise.resolve(capabilities);
      }
      if (command === "github_update_repository_issue_state") {
        return Promise.reject({ code: "github", message: "temporary write failure" });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    const user = userEvent.setup();
    const queryClient = renderComposer();
    const detailKey = githubQueryKeys.issueDetail({ ...target, timelinePage: 2 });
    queryClient.setQueryData(detailKey, { cached: true });

    await user.click(
      await screen.findByRole("button", {
        name: "workspace.repositories.closeIssueAsCompleted",
      })
    );

    expect(await screen.findByText("workspace.repositories.issueActionsLoadFailed")).toBeDefined();
    const retry = screen.getByRole("button", { name: "workspace.repositories.retry" });
    const close = screen.getByRole("button", {
      name: "workspace.repositories.closeIssueAsCompleted",
    });
    expect(close.hasAttribute("disabled")).toBe(true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);

    await user.click(retry);

    await waitFor(() => expect(capabilityReads).toBe(3));
    await waitFor(() => expect(close.hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("button", { name: "workspace.repositories.retry" })).toBeNull();
    expect(screen.getByText("workspace.repositories.issueStateChangeFailed")).toBeDefined();
  });

  it("refreshes repository navigation when GitHub reports a moved Issue", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_state_capabilities") {
        return Promise.resolve(capabilities);
      }
      if (command === "github_update_repository_issue_state") {
        return Promise.reject({ code: "githubIssueMoved", message: "moved" });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    const queryClient = renderComposer();
    queryClient.setQueryData(githubQueryKeys.repositories, { pages: [] });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: "workspace.repositories.closeIssueAsCompleted",
      })
    );

    expect(await screen.findByText("workspace.repositories.issueMoved")).toBeDefined();
    await waitFor(() =>
      expect(queryClient.getQueryState(githubQueryKeys.repositories)?.isInvalidated).toBe(true)
    );
  });

  it("does not expose Reopen when GitHub denies that capability", async () => {
    const closedIssue: GitHubIssue = {
      ...issue,
      state: "closed",
      stateReason: "completed",
    };
    vi.mocked(invoke).mockResolvedValueOnce({
      ...capabilities,
      state: "closed",
      stateReason: "completed",
      viewerCanClose: false,
      viewerCanReopen: false,
    });
    renderComposer(closedIssue);

    expect(await screen.findByText("workspace.repositories.issueStateUnavailable")).toBeDefined();
    expect(screen.queryByRole("button", { name: "workspace.repositories.reopenIssue" })).toBeNull();
  });
});
