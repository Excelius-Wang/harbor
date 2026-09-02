// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueView } from "./github-issue-view";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("./github-pinned-issues", () => ({ GitHubPinnedIssues: () => null }));

const repository = {
  id: 1,
  owner: "octocat",
  name: "hello-world",
  fullName: "octocat/hello-world",
  url: "https://github.com/octocat/hello-world",
  stars: 0,
  forks: 0,
  openIssues: 0,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};

function renderView() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GitHubIssueView repository={repository} />
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
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === "github_list_repository_issues") {
      return Promise.resolve({
        issues: [],
        totalCount: 0,
        page: 1,
        hasPrevious: false,
        hasMore: false,
      });
    }
    if (command === "github_list_repository_issue_labels") {
      return Promise.resolve({ labels: [] });
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

afterEach(() => cleanup());

describe("GitHub Issue close-reason filter", () => {
  it("shows the filter for closed Issues and sends the selected reason", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("tab", { name: "workspace.repositories.closedIssues" }));
    const reasonTrigger = (await screen.findAllByRole("combobox"))[1];
    await user.click(reasonTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.issueCloseReasons.notPlanned",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
        owner: "octocat",
        repository: "hello-world",
        issueState: "closed",
        assignment: "all",
        query: "",
        label: "",
        closeReason: "notPlanned",
        sort: "updated",
        page: 1,
      });
    });
  });

  it("clears the reason when returning to open Issues", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("tab", { name: "workspace.repositories.closedIssues" }));
    expect(
      (await screen.findAllByText("workspace.repositories.allIssueCloseReasons"))[0]
    ).toBeDefined();
    await user.click(screen.getByRole("tab", { name: "workspace.repositories.openIssues" }));

    await waitFor(() =>
      expect(screen.queryByText("workspace.repositories.allIssueCloseReasons")).toBeNull()
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "github_list_repository_issues",
      expect.objectContaining({ closeReason: "notPlanned" })
    );
  });
});
