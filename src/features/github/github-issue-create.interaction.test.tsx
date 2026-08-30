// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueCreate } from "./github-issue-create";
import { openExternalUrl } from "@/lib/window";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

function renderIssueCreate() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <GitHubIssueCreate repository={repository} onCancel={vi.fn()} onCreated={vi.fn()} />
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
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(openExternalUrl).mockReset();
});
afterEach(() => cleanup());

describe("GitHub Issue creation policy", () => {
  it("blocks the native blank-Issue form and opens GitHub templates for a restricted repository", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      blankIssueAllowed: false,
      contactLinks: [
        {
          name: "Community support",
          about: "Ask a question",
          url: "https://example.com/support",
        },
      ],
      templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
    });
    const user = userEvent.setup();
    renderIssueCreate();

    expect(await screen.findByText("workspace.repositories.issueTemplatesRequired")).toBeDefined();
    expect(screen.queryByRole("button", { name: "workspace.repositories.createIssue" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.openIssueTemplates" })
    );

    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://github.com/octocat/hello-world/issues/new/choose"
    );
    expect(invoke).toHaveBeenCalledWith("github_get_repository_issue_creation_policy", {
      owner: "octocat",
      repository: "hello-world",
    });
  });

  it("keeps the native form available when the repository permits blank Issues", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      blankIssueAllowed: true,
      contactLinks: [],
      templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
    });
    renderIssueCreate();

    expect(
      await screen.findByRole("button", { name: "workspace.repositories.createIssue" })
    ).toBeDefined();
    expect(screen.queryByText("workspace.repositories.issueTemplatesRequired")).toBeNull();
  });

  it("keeps the native form hidden until a failed policy check is retried", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce({ code: "githubPermission", message: "policy denied" })
      .mockResolvedValueOnce({
        blankIssueAllowed: true,
        contactLinks: [],
        templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
      });
    const user = userEvent.setup();
    renderIssueCreate();

    expect(
      await screen.findByText("workspace.repositories.issueCreationPolicyPermissionDenied")
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "workspace.repositories.createIssue" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));

    expect(
      await screen.findByRole("button", { name: "workspace.repositories.createIssue" })
    ).toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
