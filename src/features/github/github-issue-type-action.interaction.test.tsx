// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueTypeAction } from "./github-issue-type-action";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
};
const issue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" as const },
  number: 7,
  title: "Issue",
  body: "Body",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "open" as const,
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-08-30T08:00:00Z",
  updatedAt: "2026-08-30T08:00:00Z",
};
const status = {
  repositoryId: "R_1",
  repositoryFullName: "octocat/hello-world",
  issueNodeId: "I_7",
  issueNumber: 7,
  currentIssueType: {
    id: 410,
    nodeId: "IT_bug",
    name: "Bug",
    description: "An unexpected problem",
  },
  availableIssueTypes: [
    {
      id: 410,
      nodeId: "IT_bug",
      name: "Bug",
      description: "An unexpected problem",
    },
    { id: 411, nodeId: "IT_task", name: "Task", description: null },
  ],
  viewerCanType: true,
};
let updateShouldFail = false;

beforeEach(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  updateShouldFail = false;
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === "github_get_repository_issue_type_status") return Promise.resolve(status);
    if (command === "github_update_repository_issue_type") {
      return updateShouldFail
        ? Promise.reject({ code: "githubRateLimited", message: "slow down" })
        : Promise.resolve(status);
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});
afterEach(() => cleanup());

describe("GitHub Issue type action", () => {
  it("shows the authoritative type choices and sends a selected type", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueTypeAction repository={repository} issue={issue} />
      </QueryClientProvider>
    );

    const trigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueType",
    });
    expect(trigger.textContent).toContain("Bug");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Task" }));

    expect(invoke).toHaveBeenCalledWith("github_update_repository_issue_type", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
      expectedIssueTypeNodeId: "IT_bug",
      issueTypeNodeId: "IT_task",
    });
  });

  it("surfaces mutation errors and refreshes the authoritative status", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <GitHubIssueTypeAction repository={repository} issue={issue} />
      </QueryClientProvider>
    );

    const trigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueType",
    });
    updateShouldFail = true;
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Task" }));

    expect(await screen.findByText("workspace.repositories.githubRateLimited")).toBeTruthy();
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["github", "repository", "octocat", "hello-world", "issue", 7, "issue-type"],
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["github", "repository", "octocat", "hello-world", "issues"],
      });
    });
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "github_get_repository_issue_type_status")
        .length
    ).toBeGreaterThan(1);
  });
});
