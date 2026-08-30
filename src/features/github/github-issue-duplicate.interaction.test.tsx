// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubIssue } from "./github-data";
import { GitHubIssueDuplicate } from "./github-issue-duplicate";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};

const duplicateIssue: GitHubIssue = {
  id: 7,
  reactionSubject: { id: "I_7", kind: "issue" },
  number: 7,
  title: "Duplicated Issue",
  url: "https://github.com/octocat/hello-world/issues/7",
  state: "closed",
  stateReason: "duplicate",
  author: "octocat",
  assignees: [],
  labels: [],
  locked: false,
  comments: 0,
  createdAt: "2026-08-30T08:00:00Z",
  updatedAt: "2026-08-30T08:00:00Z",
};

function renderDuplicate(issue = duplicateIssue, onNavigate = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GitHubIssueDuplicate repository={repository} issue={issue} onNavigate={onNavigate} />
    </QueryClientProvider>
  );
  return onNavigate;
}

beforeEach(() => vi.mocked(invoke).mockReset());
afterEach(() => cleanup());

describe("GitHub Issue duplicate reference", () => {
  it("loads the canonical Issue and navigates to it", async () => {
    const duplicate = {
      owner: "octocat",
      repository: "api",
      fullName: "octocat/api",
      repositoryUrl: "https://github.com/octocat/api",
      issueNumber: 9,
      title: "Canonical Issue",
      url: "https://github.com/octocat/api/issues/9",
    };
    vi.mocked(invoke).mockResolvedValueOnce(duplicate);
    const onNavigate = renderDuplicate();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Canonical Issue/ }));

    expect(onNavigate).toHaveBeenCalledWith(duplicate);
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_duplicate", {
      owner: "octocat",
      repository: "hello-world",
      issueNumber: 7,
      expectedIssueNodeId: "I_7",
    });
  });

  it("does not load a canonical Issue when this Issue is not marked duplicate", async () => {
    renderDuplicate({ ...duplicateIssue, stateReason: "completed" });

    await waitFor(() => expect(invoke).not.toHaveBeenCalled());
    expect(screen.queryByText("workspace.repositories.duplicateOfIssue")).toBeNull();
  });
});
