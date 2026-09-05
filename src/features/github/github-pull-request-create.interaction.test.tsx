// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { GitHubPullRequestCreate } from "./github-pull-request-create";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
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

it("retains a PR draft through comparison failure, a new suggested title, and refreshed branch choices", async () => {
  const repository = {
    id: 1,
    owner: "octocat",
    name: "harbor",
    fullName: "octocat/harbor",
    url: "https://github.com/octocat/harbor",
    defaultBranch: "main",
    stars: 0,
    forks: 0,
    openIssues: 0,
    isPrivate: false,
    isFork: false,
    isArchived: false,
  };
  let phase = "initial";
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === "github_get_repository_code_overview") {
      return Promise.resolve({
        branches: (phase === "refreshed"
          ? ["main", "feature", "release"]
          : ["main", "feature"]
        ).map((name) => ({ name, sha: "abc1234", protected: name === "main" })),
        tags: [],
        tagsHaveMore: false,
        commits: [],
        commitsHaveMore: false,
        canWrite: true,
        isArchived: false,
      });
    }
    if (command === "github_compare_repository_pull_request_branches") {
      if (phase === "failed") return Promise.reject({ code: "githubNetwork", message: "offline" });
      return Promise.resolve({
        base: "main",
        head: "feature",
        status: "ahead",
        aheadBy: 1,
        behindBy: 0,
        totalCommits: 1,
        changedFiles: 1,
        additions: 2,
        deletions: 1,
        commits: [],
        suggestedTitle: phase === "refreshed" ? "A newer commit title" : "Initial commit title",
      });
    }
    return Promise.reject(new Error(`Unexpected command ${command}`));
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <GitHubPullRequestCreate repository={repository} onCancel={vi.fn()} onCreated={vi.fn()} />
    </QueryClientProvider>
  );
  const title = (await screen.findByLabelText(
    "workspace.repositories.pullRequestTitle"
  )) as HTMLInputElement;
  const body = screen.getByLabelText(
    "workspace.repositories.pullRequestBody"
  ) as HTMLTextAreaElement;
  await user.clear(title);
  await user.type(title, "An unsaved PR title");
  await user.type(body, "An unsaved description");
  await user.click(screen.getByRole("checkbox"));
  phase = "failed";
  await act(() => queryClient.invalidateQueries());
  expect(await screen.findByText("common.staleResults")).toBeTruthy();
  const submit = screen.getByRole("button", {
    name: "workspace.repositories.createDraftPullRequest",
  });
  expect(submit.hasAttribute("disabled")).toBe(true);
  await user.click(submit);
  expect(title.value).toBe("An unsaved PR title");
  expect(body.value).toBe("An unsaved description");
  phase = "refreshed";
  await user.click(screen.getByRole("button", { name: "common.retry" }));
  await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
  await act(() => queryClient.invalidateQueries());
  expect(title.value).toBe("An unsaved PR title");
  expect(body.value).toBe("An unsaved description");
  expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  expect(submit.hasAttribute("disabled")).toBe(false);
  expect(
    vi
      .mocked(invoke)
      .mock.calls.every(
        ([command]) =>
          command === "github_get_repository_code_overview" ||
          command === "github_compare_repository_pull_request_branches"
      )
  ).toBe(true);
});
