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
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
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
      templates: [],
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
      templates: [],
      templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
    });
    renderIssueCreate();

    expect(
      await screen.findByRole("button", { name: "workspace.repositories.createIssue" })
    ).toBeDefined();
    expect(screen.queryByText("workspace.repositories.issueTemplatesRequired")).toBeNull();
  });

  it("keeps a native Markdown template available when blank Issues are restricted", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      blankIssueAllowed: false,
      contactLinks: [],
      templates: [
        {
          path: ".github/ISSUE_TEMPLATE/bug.md",
          kind: "markdown",
          name: "Bug report",
          about: "Tell us what happened",
          defaultTitle: "[Bug] ",
          body: "## What happened?\n",
          labels: ["bug"],
          assignees: [],
          templateUrl: "https://github.com/octocat/hello-world/issues/new?template=bug.md",
        },
      ],
      templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
    });
    renderIssueCreate();

    expect(
      await screen.findByRole("button", { name: "workspace.repositories.createIssue" })
    ).toBeDefined();
    expect(screen.queryByText("workspace.repositories.issueTemplatesRequired")).toBeNull();
    expect(
      (screen.getByLabelText("workspace.repositories.issueTitle") as HTMLInputElement).value
    ).toBe("[Bug] ");
  });

  it("keeps the native form hidden until a failed policy check is retried", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce({ code: "githubPermission", message: "policy denied" })
      .mockResolvedValueOnce({
        blankIssueAllowed: true,
        contactLinks: [],
        templates: [],
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

  it("prefills a Markdown template, preserves its metadata for creation, and routes forms to GitHub", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_repository_issue_creation_policy") {
        return Promise.resolve({
          blankIssueAllowed: true,
          contactLinks: [],
          templates: [
            {
              path: ".github/ISSUE_TEMPLATE/bug.yml",
              kind: "form",
              name: "Structured bug",
              about: "Use the required GitHub fields",
              defaultTitle: "",
              body: "",
              labels: [],
              assignees: [],
              templateUrl: "https://github.com/octocat/hello-world/issues/new?template=bug.yml",
            },
            {
              path: ".github/ISSUE_TEMPLATE/bug.md",
              kind: "markdown",
              name: "Bug report",
              about: "Tell us what happened",
              defaultTitle: "[Bug] ",
              body: "## What happened?\n",
              labels: ["bug", "triage"],
              assignees: ["octocat"],
              templateUrl: "https://github.com/octocat/hello-world/issues/new?template=bug.md",
            },
          ],
          templateChooserUrl: "https://github.com/octocat/hello-world/issues/new/choose",
        });
      }
      return new Promise(() => {});
    });
    const user = userEvent.setup();
    renderIssueCreate();

    await user.click(
      await screen.findByRole("combobox", { name: "workspace.repositories.issueTemplate" })
    );
    await user.click(await screen.findByRole("option", { name: "Bug report" }));
    expect(
      (screen.getByLabelText("workspace.repositories.issueTitle") as HTMLInputElement).value
    ).toBe("[Bug] ");
    await user.click(screen.getByRole("button", { name: "workspace.repositories.createIssue" }));
    expect(invoke).toHaveBeenLastCalledWith("github_create_repository_issue", {
      owner: "octocat",
      repository: "hello-world",
      title: "[Bug]",
      body: "## What happened?\n",
      labels: ["bug", "triage"],
      assignees: ["octocat"],
    });

    await user.click(
      screen.getByRole("button", { name: /workspace\.repositories\.openIssueTemplate/ })
    );
    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://github.com/octocat/hello-world/issues/new?template=bug.yml"
    );
  });
});
