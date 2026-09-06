// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { moreFixture } from "@/dev/more-fixtures";
import type { GitHubRepository } from "./github-data";
import { GitHubGists } from "./github-gist-view";
import { GitHubProjects } from "./github-project-view";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
const repository: GitHubRepository = {
  id: 1,
  owner: "harbor-preview",
  name: "harbor",
  fullName: "harbor-preview/harbor",
  url: "https://github.com/harbor-preview/harbor",
  stars: 1,
  forks: 0,
  openIssues: 1,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
  updatedAt: "2026-09-01T10:00:00Z",
};
let failingCommand: string | undefined;
beforeEach(() => {
  failingCommand = undefined;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  vi.mocked(invoke).mockImplementation((command, payload) => {
    if (command === failingCommand)
      return Promise.reject({ code: "preview", message: "Refresh unavailable" });
    const result = moreFixture(
      command,
      (payload ?? {}) as Record<string, unknown>,
      [repository],
      false
    );
    return result === undefined
      ? Promise.reject(new Error(`Unexpected command: ${command}`))
      : Promise.resolve(result);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("More workspace cached detail recovery", () => {
  it.each([
    ["Gists", GitHubGists, "github_get_gist"],
    ["Projects", GitHubProjects, "github_get_personal_project"],
  ] as const)(
    "keeps %s detail visible after a failed refresh, then retries",
    async (_, Component, command) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <Component />
          </TooltipProvider>
        </QueryClientProvider>
      );
      await user.click(
        await screen.findByRole("button", { name: /Workspace navigation and reading surfaces/ })
      );
      const title = await screen.findByRole("heading", {
        name: "Workspace navigation and reading surfaces",
      });
      failingCommand = command;
      await act(async () => {
        await client.invalidateQueries();
      });
      expect(screen.getByRole("heading", { name: title.textContent! })).toBe(title);
      expect(await screen.findByText("common.staleResults")).toBeTruthy();
      expect(screen.getByText("Refresh unavailable")).toBeTruthy();
      failingCommand = undefined;
      await user.click(screen.getByRole("button", { name: "common.retry" }));
      await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
      expect(screen.getByRole("heading", { name: title.textContent! })).toBe(title);
      client.clear();
    }
  );
});
