// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { repositoryFixture } from "@/dev/repository-fixtures";
import type { GitHubRepository } from "./github-data";
import { GitHubReleaseDetail } from "./github-release-detail";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./github-readme", () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("./github-reaction-bar", () => ({ GitHubReactionBar: () => null }));
vi.mock("./github-reactions-provider", () => ({
  GitHubReactionsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const repository = {
  id: 1,
  owner: "harbor-preview",
  name: "harbor",
  fullName: "harbor-preview/harbor",
  url: "https://github.com/harbor-preview/harbor",
  defaultBranch: "main",
} as GitHubRepository;
const labels = {
  asset: "workspace.repositories.downloadReleaseAsset",
  archive: "workspace.repositories.releaseSourceZip",
};
const commands = {
  asset: "github_download_repository_release_asset",
  archive: "github_download_repository_release_archive",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(failed: "asset" | "archive", saved = true) {
  vi.mocked(invoke).mockImplementation((command, args) => {
    if (command === commands[failed])
      return Promise.reject({ code: "preview", message: "The first transfer failed" });
    if (command === commands[failed === "asset" ? "archive" : "asset"])
      return Promise.resolve({ saved, path: saved ? "/tmp/controlled-download" : null });
    const result = repositoryFixture(
      command,
      (args ?? {}) as Record<string, unknown>,
      [repository],
      false
    );
    return result === undefined
      ? Promise.reject(new Error("Unexpected command " + command))
      : Promise.resolve(structuredClone(result));
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubReleaseDetail repository={repository} releaseId={1} onBack={() => {}} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return client;
}
describe("Release transfer recovery", () => {
  it.each(["asset", "archive"] as const)(
    "clears the previous %s failure when another download succeeds",
    async (failed) => {
      const client = mount(failed);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: labels[failed] }));
      await screen.findByText("The first transfer failed");
      await user.click(
        screen.getByRole("button", { name: labels[failed === "asset" ? "archive" : "asset"] })
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(screen.queryByText("The first transfer failed")).toBeNull();
      client.clear();
    }
  );
  it("does not show stale failure or success after cancelling the next download", async () => {
    const client = mount("asset", false);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: labels.asset }));
    await screen.findByText("The first transfer failed");
    await user.click(screen.getByRole("button", { name: labels.archive }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(commands.archive, expect.anything()));
    await waitFor(() => expect(screen.queryByText("The first transfer failed")).toBeNull());
    expect(toast.success).not.toHaveBeenCalled();
    client.clear();
  });
});
