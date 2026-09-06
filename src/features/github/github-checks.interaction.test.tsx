// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GitHubPullRequestChecks } from "./github-pull-request-checks";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([undefined, 1])(
  "keeps stale checks visible and retries for suite %s",
  async (checkSuiteId) => {
    const data = {
      page: 1,
      hasPrevious: false,
      hasMore: false,
      totalCount: 1,
      checks: [{ id: 1, name: "Workspace checks", status: "completed", conclusion: "success" }],
    };
    native.invoke.mockResolvedValue(data);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GitHubPullRequestChecks
          repository={{ owner: "harbor-preview", name: "harbor" }}
          reference="abc1234"
          page={1}
          onPageChange={() => {}}
          enabled
          checkSuiteId={checkSuiteId}
        />
      </QueryClientProvider>
    );
    await screen.findByText("Workspace checks");
    native.invoke.mockRejectedValue(new Error("Checks refresh failed"));
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(screen.getByText("Workspace checks")).toBeTruthy();
    expect(await screen.findByText("common.staleResults")).toBeTruthy();
    native.invoke.mockResolvedValue(data);
    await userEvent.setup().click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
    expect(screen.getByText("Workspace checks")).toBeTruthy();
    client.clear();
  }
);
