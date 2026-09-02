// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubRepository } from "./github-data";
import { githubQueryKeys } from "./github-queries";
import { GitHubRepositoryTopicsCard } from "./github-repository-topics";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const repository: GitHubRepository = {
  id: 42,
  owner: "octocat",
  name: "harbor",
  fullName: "octocat/harbor",
  url: "https://github.com/octocat/harbor",
  stars: 12,
  forks: 3,
  openIssues: 4,
  defaultBranch: "main",
  isPrivate: true,
  isFork: false,
  isArchived: false,
};

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <GitHubRepositoryTopicsCard repository={repository} />
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === "github_get_personal_repository_topics") {
      return Promise.resolve({ names: ["rust", "tauri"] });
    }
    if (command === "github_update_personal_repository_topics") {
      return Promise.resolve({ names: ["rust", "desktop-app"] });
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

afterEach(() => cleanup());

describe("GitHub repository topics", () => {
  it("loads, edits, and saves normalized topics with the expected snapshot", async () => {
    const user = userEvent.setup();
    renderCard();

    const input = await screen.findByRole("textbox", {
      name: "workspace.repositories.settings.topicList",
    });
    expect((input as HTMLTextAreaElement).value).toBe("rust, tauri");
    await user.clear(input);
    await user.type(input, "RUST, desktop-app");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.settings.saveTopics" })
    );

    expect(invoke).toHaveBeenCalledWith("github_update_personal_repository_topics", {
      owner: "octocat",
      repository: "harbor",
      mutation: {
        names: ["rust", "desktop-app"],
        expectedNames: ["rust", "tauri"],
      },
    });
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe("rust, desktop-app"));
  });

  it("allows clearing all topics and keeps the save control guarded by validation", async () => {
    const user = userEvent.setup();
    renderCard();

    const input = await screen.findByRole("textbox", {
      name: "workspace.repositories.settings.topicList",
    });
    await user.clear(input);
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.settings.saveTopics" })
    );

    expect(invoke).toHaveBeenCalledWith("github_update_personal_repository_topics", {
      owner: "octocat",
      repository: "harbor",
      mutation: { names: [], expectedNames: ["rust", "tauri"] },
    });
  });

  it("keeps the edit-start snapshot when a background refresh changes the topics", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderCard();

    const input = await screen.findByRole("textbox", {
      name: "workspace.repositories.settings.topicList",
    });
    await user.clear(input);
    await user.type(input, "rust, desktop-app");
    await act(async () => {
      queryClient.setQueryData(
        githubQueryKeys.repositoryTopics({ owner: repository.owner, repository: repository.name }),
        {
          names: ["external-change"],
        }
      );
    });
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.settings.saveTopics" })
    );

    expect(invoke).toHaveBeenCalledWith("github_update_personal_repository_topics", {
      owner: "octocat",
      repository: "harbor",
      mutation: {
        names: ["rust", "desktop-app"],
        expectedNames: ["rust", "tauri"],
      },
    });
  });

  it("warns that a conflicted write may have succeeded", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_personal_repository_topics") {
        return Promise.resolve({ names: ["rust", "tauri"] });
      }
      if (command === "github_update_personal_repository_topics") {
        return Promise.reject({
          code: "githubRepositoryTopicsConflict",
          message: "the update may have persisted",
        });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderCard();

    const input = await screen.findByRole("textbox", {
      name: "workspace.repositories.settings.topicList",
    });
    await user.clear(input);
    await user.type(input, "rust, desktop-app");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.settings.saveTopics" })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("workspace.repositories.settings.topicsSaveFailed", {
        description: "workspace.repositories.settings.topicsSaveUncertain",
      })
    );
  });

  it("distinguishes a stale snapshot from an uncertain write", async () => {
    const user = userEvent.setup();
    let readCount = 0;
    let writeCount = 0;
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "github_get_personal_repository_topics") {
        readCount += 1;
        return Promise.resolve({
          names: readCount === 1 ? ["rust", "tauri"] : ["external-change"],
        });
      }
      if (command === "github_update_personal_repository_topics") {
        writeCount += 1;
        return writeCount === 1
          ? Promise.reject({
              code: "githubRepositoryTopicsStale",
              message: "repository topics changed before saving",
            })
          : Promise.resolve({ names: ["rust", "desktop-app"] });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderCard();

    const input = await screen.findByRole("textbox", {
      name: "workspace.repositories.settings.topicList",
    });
    await user.clear(input);
    await user.type(input, "rust, desktop-app");
    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.settings.saveTopics" })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("workspace.repositories.settings.topicsSaveFailed", {
        description: "workspace.repositories.settings.topicsStale",
      })
    );
    const saveButton = screen.getByRole("button", {
      name: "workspace.repositories.settings.saveTopics",
    });
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false));
    await user.click(saveButton);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("github_update_personal_repository_topics", {
        owner: "octocat",
        repository: "harbor",
        mutation: {
          names: ["rust", "desktop-app"],
          expectedNames: ["external-change"],
        },
      })
    );
  });

  it("shows a retry action when topics cannot be loaded", async () => {
    vi.mocked(invoke).mockImplementation((command) =>
      command === "github_get_personal_repository_topics"
        ? Promise.reject({ code: "githubRateLimited", message: "slow down" })
        : Promise.reject(new Error(`unexpected command ${command}`))
    );
    renderCard();

    expect(
      await screen.findByText("workspace.repositories.settings.topicsLoadFailed")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "common.retry" })).toBeDefined();
  });
});
