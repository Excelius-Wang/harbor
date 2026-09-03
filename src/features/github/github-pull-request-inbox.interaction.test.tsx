// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubPullRequestInbox } from "./github-pull-request-inbox";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue({
    pullRequests: [],
    totalCount: 0,
    page: 1,
    hasPrevious: false,
    hasMore: false,
  });
});

afterEach(() => cleanup());

describe("GitHub Pull Request inbox filters", () => {
  it("requests pull requests involving the signed-in user", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestInbox onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "workspace.pullRequests.involved" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("github_list_pull_request_inbox", {
        scope: "involved",
        pullRequestState: "open",
        query: "",
        sort: "updated",
        page: 1,
      });
    });
  });
});
