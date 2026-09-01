// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubRepository } from "./github-data";
import { GitHubRepositoryTopicsCard } from "./github-repository-topics";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
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
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GitHubRepositoryTopicsCard repository={repository} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
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
