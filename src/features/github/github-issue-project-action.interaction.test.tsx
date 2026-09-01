// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueProjectAction } from "./github-issue-project-action";

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
const projectPage = {
  projects: [
    {
      id: "PVT_1",
      number: 1,
      title: "Roadmap",
      shortDescription: null,
      url: "https://github.com/users/octocat/projects/1",
      public: false,
      closed: false,
      itemCount: 2,
      updatedAt: "2026-08-30T08:00:00Z",
      viewerCanUpdate: true,
      viewerCanClose: true,
      viewerCanReopen: false,
    },
  ],
  totalCount: 1,
  endCursor: null,
  hasMore: false,
};
let additionShouldFail = false;

beforeEach(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  additionShouldFail = false;
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === "github_list_personal_projects") return Promise.resolve(projectPage);
    if (command === "github_add_personal_project_item") {
      return additionShouldFail
        ? Promise.reject({ code: "githubPermission", message: "project permission changed" })
        : Promise.resolve({});
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});
afterEach(() => cleanup());

describe("GitHub Issue project action", () => {
  it("loads personal projects and adds the current Issue by its canonical URL", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueProjectAction repository={repository} issue={issue} />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "workspace.repositories.addToProject" }));
    await user.click(
      await screen.findByRole("combobox", { name: "workspace.repositories.selectProject" })
    );
    await user.click(await screen.findByRole("option", { name: "Roadmap (#1)" }));
    const addButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.addToProject",
    });
    await user.click(addButtons[addButtons.length - 1]);

    expect(invoke).toHaveBeenCalledWith("github_add_personal_project_item", {
      number: 1,
      addition: { kind: "existingItem", url: issue.url },
    });
  });

  it("refreshes the Issue and Project caches after an accepted addition", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <GitHubIssueProjectAction repository={repository} issue={issue} />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "workspace.repositories.addToProject" }));
    await user.click(
      await screen.findByRole("combobox", { name: "workspace.repositories.selectProject" })
    );
    await user.click(await screen.findByRole("option", { name: "Roadmap (#1)" }));
    const addButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.addToProject",
    });
    await user.click(addButtons[addButtons.length - 1]);

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["github", "personal-projects"],
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["github", "repository", "octocat", "hello-world", "issue", 7],
      });
    });
  });

  it("keeps the dialog open and explains permission failures", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueProjectAction repository={repository} issue={issue} />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "workspace.repositories.addToProject" }));
    await user.click(
      await screen.findByRole("combobox", { name: "workspace.repositories.selectProject" })
    );
    await user.click(await screen.findByRole("option", { name: "Roadmap (#1)" }));
    additionShouldFail = true;
    const addButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.addToProject",
    });
    await user.click(addButtons[addButtons.length - 1]);

    expect(await screen.findByText("workspace.projects.permissionDescription")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("loads later personal Projects through the cursor", async () => {
    const user = userEvent.setup();
    let projectPageRequest = 0;
    const secondPage = {
      ...projectPage,
      projects: [{ ...projectPage.projects[0], id: "PVT_2", number: 2, title: "Backlog" }],
      endCursor: null,
      hasMore: false,
    };
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_list_personal_projects") {
        projectPageRequest += 1;
        return Promise.resolve(
          projectPageRequest === 1
            ? { ...projectPage, endCursor: "CURSOR_1", hasMore: true }
            : secondPage
        );
      }
      if (command === "github_add_personal_project_item") return Promise.resolve({});
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GitHubIssueProjectAction repository={repository} issue={issue} />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "workspace.repositories.addToProject" }));
    await user.click(
      await screen.findByRole("button", {
        name: "workspace.repositories.loadMorePersonalProjects",
      })
    );
    await user.click(
      await screen.findByRole("combobox", { name: "workspace.repositories.selectProject" })
    );
    await screen.findByRole("option", { name: "Backlog (#2)" });
    expect(invoke).toHaveBeenCalledWith("github_list_personal_projects", {
      projectState: "open",
      query: "",
      sort: "updated",
      after: "CURSOR_1",
    });
  });
});
