// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueView } from "./github-issue-view";
import { githubQueryKeys } from "./github-queries";

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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <GitHubIssueView repository={repository} />
    </QueryClientProvider>
  );
  return { ...view, client };
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
    if (command === "github_list_repository_issue_milestones") {
      return Promise.resolve({
        milestones: [
          {
            number: 3,
            title: "Harbor 0.2",
            state: "open",
            openIssues: 4,
            closedIssues: 7,
          },
          {
            number: 4,
            title: "__all_milestones__",
            state: "open",
            openIssues: 1,
            closedIssues: 0,
          },
        ],
      });
    }
    if (command === "github_list_repository_issue_types") {
      return Promise.resolve([
        { id: 410, nodeId: "IT_bug", name: "Bug", description: "An unexpected problem" },
      ]);
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

afterEach(() => cleanup());

describe("GitHub Issue assignment filter", () => {
  it("sends the assigned-to-me search filter", async () => {
    const user = userEvent.setup();
    renderView();

    const assignmentTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueAssignmentFilter",
    });
    await user.click(assignmentTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.assignedToMeIssues",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
        owner: "octocat",
        repository: "hello-world",
        issueState: "open",
        assignment: "assignedToMe",
        query: "",
        label: "",
        sort: "updated",
        page: 1,
      });
    });
  });
});

describe("GitHub Issue author filter", () => {
  it("sends the created-by-me search filter", async () => {
    const user = userEvent.setup();
    renderView();

    const authorTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueAuthorFilter",
    });
    await user.click(authorTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.createdByMeIssues",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
        owner: "octocat",
        repository: "hello-world",
        issueState: "open",
        assignment: "all",
        createdByMe: true,
        query: "",
        label: "",
        sort: "updated",
        page: 1,
      });
    });
  });
});

describe("GitHub Issue close-reason filter", () => {
  it("shows the filter for closed Issues and sends the selected reason", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("tab", { name: "workspace.repositories.closedIssues" }));
    const reasonTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueCloseReasonFilter",
    });
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
    const { client } = renderView();

    await user.click(screen.getByRole("tab", { name: "workspace.repositories.closedIssues" }));
    const reasonTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueCloseReasonFilter",
    });
    await user.click(reasonTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.issueCloseReasons.notPlanned",
      })
    );
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "github_list_repository_issues",
        expect.objectContaining({ closeReason: "notPlanned" })
      );
    });
    vi.mocked(invoke).mockClear();
    client.removeQueries({
      queryKey: githubQueryKeys.issues({
        owner: repository.owner,
        repository: repository.name,
        state: "open",
        assignment: "all",
        query: "",
        label: "",
        closeReason: null,
        sort: "updated",
        page: 1,
      }),
      exact: true,
    });
    await user.click(screen.getByRole("tab", { name: "workspace.repositories.openIssues" }));

    await waitFor(() =>
      expect(screen.queryByText("workspace.repositories.allIssueCloseReasons")).toBeNull()
    );
    await waitFor(() => {
      const issueRequests = vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "github_list_repository_issues")
        .map(([, request]) => request as Record<string, unknown>);
      expect(issueRequests.length).toBeGreaterThan(0);
      expect(issueRequests[issueRequests.length - 1]).not.toHaveProperty("closeReason");
    });
  });
});

describe("GitHub Issue sort", () => {
  it("sends the selected ascending sort", async () => {
    const user = userEvent.setup();
    renderView();

    const sortTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.sort",
    });
    await user.click(sortTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.sortUpdatedAscending",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
        owner: "octocat",
        repository: "hello-world",
        issueState: "open",
        assignment: "all",
        query: "",
        label: "",
        sort: "updatedAscending",
        page: 1,
      });
    });
  });
});

describe("GitHub Issue milestone filter", () => {
  it("keeps the filter disabled while milestones load and exposes the empty state", async () => {
    let resolveMilestones!: (value: { milestones: never[] }) => void;
    const milestonesPromise = new Promise<{ milestones: never[] }>((resolve) => {
      resolveMilestones = resolve;
    });
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
      if (command === "github_list_repository_issue_milestones") return milestonesPromise;
      if (command === "github_list_repository_issue_types") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });

    renderView();
    const milestoneTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueMilestoneFilter",
    });
    expect((milestoneTrigger as HTMLButtonElement).disabled).toBe(true);

    resolveMilestones({ milestones: [] });
    await waitFor(() => expect((milestoneTrigger as HTMLButtonElement).disabled).toBe(false));
    await userEvent.setup().click(milestoneTrigger);
    expect(
      await screen.findByRole("option", { name: "workspace.repositories.allIssueMilestones" })
    ).toBeDefined();
  });

  it("shows a permission error and retries the milestone query", async () => {
    let milestoneAttempts = 0;
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
      if (command === "github_list_repository_issue_milestones") {
        milestoneAttempts += 1;
        return milestoneAttempts === 1
          ? Promise.reject({ code: "githubPermission", message: "milestone permission changed" })
          : Promise.resolve({ milestones: [] });
      }
      if (command === "github_list_repository_issue_types") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });

    const user = userEvent.setup();
    renderView();
    expect(await screen.findByText("milestone permission changed")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));
    await waitFor(() => expect(milestoneAttempts).toBe(2));
    await waitFor(() => expect(screen.queryByText("milestone permission changed")).toBeNull());
  });

  it("loads repository milestones and sends the selected title", async () => {
    const user = userEvent.setup();
    renderView();

    const milestoneTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueMilestoneFilter",
    });
    await user.click(milestoneTrigger);
    await user.click(await screen.findByRole("option", { name: "Harbor 0.2" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
        owner: "octocat",
        repository: "hello-world",
        issueState: "open",
        assignment: "all",
        query: "",
        label: "",
        milestone: "Harbor 0.2",
        sort: "updated",
        page: 1,
      });
    });
  });

  it("can select a milestone whose title matches the clear sentinel", async () => {
    const user = userEvent.setup();
    renderView();

    const milestoneTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueMilestoneFilter",
    });
    await user.click(milestoneTrigger);
    await user.click(await screen.findByRole("option", { name: "__all_milestones__" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "github_list_repository_issues",
        expect.objectContaining({ milestone: "__all_milestones__" })
      );
    });
  });
});

describe("GitHub Issue linked pull request filter", () => {
  it("sends the linked pull request search filter", async () => {
    const user = userEvent.setup();
    renderView();

    const linkedTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueLinkedPullRequestFilter",
    });
    await user.click(linkedTrigger);
    await user.click(
      await screen.findByRole("option", { name: "workspace.repositories.issueLinkedPullRequest" })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
        owner: "octocat",
        repository: "hello-world",
        issueState: "open",
        assignment: "all",
        query: "",
        label: "",
        linkedPullRequest: true,
        sort: "updated",
        page: 1,
      });
    });
  });
});

describe("GitHub Issue type filter", () => {
  it("loads repository Issue types and sends the selected name", async () => {
    const user = userEvent.setup();
    renderView();

    const typeTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.issueTypeFilter",
    });
    await user.click(typeTrigger);
    await user.click(await screen.findByRole("option", { name: "Bug" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_issues", {
        owner: "octocat",
        repository: "hello-world",
        issueState: "open",
        assignment: "all",
        query: "",
        label: "",
        issueType: "Bug",
        sort: "updated",
        page: 1,
      });
    });
  });
});
