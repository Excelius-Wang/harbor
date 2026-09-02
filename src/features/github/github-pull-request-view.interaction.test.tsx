// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubPullRequestView } from "./github-pull-request-view";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

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
    if (command === "github_list_repository_pull_requests") {
      return Promise.resolve({
        pullRequests: [],
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

describe("GitHub Pull Request list filters", () => {
  it("sends the direct review-requested filter", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestView repository={repository} />
      </QueryClientProvider>
    );

    const reviewRequestedTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.pullRequestReviewRequestedFilter",
    });
    await user.click(reviewRequestedTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.pullRequestReviewRequested",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
        owner: "octocat",
        repository: "hello-world",
        pullRequestState: "open",
        query: "",
        label: "",
        reviewRequested: true,
        sort: "updated",
        page: 1,
      });
    });
  });

  it("sends the linked-to-Issue filter", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestView repository={repository} />
      </QueryClientProvider>
    );

    const linkedIssueTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.pullRequestLinkedIssueFilter",
    });
    await user.click(linkedIssueTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.pullRequestLinkedIssue",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
        owner: "octocat",
        repository: "hello-world",
        pullRequestState: "open",
        query: "",
        label: "",
        linkedIssue: true,
        sort: "updated",
        page: 1,
      });
    });
  });

  it("sends the selected draft filter", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestView repository={repository} />
      </QueryClientProvider>
    );

    const draftTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.pullRequestDraftFilter",
    });
    await user.click(draftTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.pullRequestDraftFilters.draft",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
        owner: "octocat",
        repository: "hello-world",
        pullRequestState: "open",
        query: "",
        label: "",
        draft: "draft",
        sort: "updated",
        page: 1,
      });
    });
  });

  it("sends the most-reactions sort", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestView repository={repository} />
      </QueryClientProvider>
    );

    const sortTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.sort",
    });
    await user.click(sortTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.sortReactions",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
        owner: "octocat",
        repository: "hello-world",
        pullRequestState: "open",
        query: "",
        label: "",
        sort: "reactions",
        page: 1,
      });
    });
  });

  it("sends the selected GitHub review status", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestView repository={repository} />
      </QueryClientProvider>
    );

    const reviewTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.pullRequestReviewFilter",
    });
    await user.click(reviewTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.pullRequestReviewFilters.approved",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
        owner: "octocat",
        repository: "hello-world",
        pullRequestState: "open",
        query: "",
        label: "",
        review: "approved",
        sort: "updated",
        page: 1,
      });
    });
  });

  it("sends the selected GitHub merge status", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestView repository={repository} />
      </QueryClientProvider>
    );

    const mergeTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.pullRequestMergeFilter",
    });
    await user.click(mergeTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.pullRequestMergeFilters.merged",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
        owner: "octocat",
        repository: "hello-world",
        pullRequestState: "closed",
        query: "",
        label: "",
        merge: "merged",
        sort: "updated",
        page: 1,
      });
    });
  });

  it("sends the selected GitHub checks status", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestView repository={repository} />
      </QueryClientProvider>
    );

    const statusTrigger = await screen.findByRole("combobox", {
      name: "workspace.repositories.pullRequestStatusFilter",
    });
    await user.click(statusTrigger);
    await user.click(
      await screen.findByRole("option", {
        name: "workspace.repositories.pullRequestStatusFilters.failure",
      })
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_repository_pull_requests", {
        owner: "octocat",
        repository: "hello-world",
        pullRequestState: "open",
        query: "",
        label: "",
        status: "failure",
        sort: "updated",
        page: 1,
      });
    });
  });
});
