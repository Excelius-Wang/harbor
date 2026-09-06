// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { GitHubActionsRunDetail } from "./github-actions-run-detail";
import { GitHubCheckSuiteDetail } from "./github-check-suite-detail";
import type { GitHubRepository, GitHubWorkflowRun, GitHubCheckSuite } from "./github-data";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("./github-actions-detail", () => ({
  GitHubActionsDetail: () => <div>Run data from GitHub</div>,
}));
vi.mock("./github-pull-request-checks", () => ({
  GitHubPullRequestChecks: () => <div>Check data from GitHub</div>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const repository: GitHubRepository = {
  id: 1,
  owner: "harbor-preview",
  name: "harbor",
  fullName: "harbor-preview/harbor",
  url: "https://github.com/harbor-preview/harbor",
  stars: 1,
  forks: 1,
  openIssues: 1,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};
const run: GitHubWorkflowRun = {
  id: 1,
  workflowId: 1,
  workflowName: "Workspace checks",
  title: "Run title",
  runNumber: 12,
  runAttempt: 1,
  event: "push",
  status: "completed",
  conclusion: "success",
  headBranch: "main",
  headSha: "abc1234",
  headCommitMessage: "Run title",
  actor: "harbor-preview",
  actorAvatarUrl: null,
  startedAt: "2026-09-01T10:00:00Z",
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:05:00Z",
  url: "https://github.com/harbor-preview/harbor/actions/runs/1",
};
const suite: GitHubCheckSuite = {
  id: 1,
  headSha: "abc1234",
  headBranch: "main",
  status: "completed",
  conclusion: "success",
  appName: "Workspace checks",
};

it.each(["run", "suite"] as const)(
  "marks retained %s metadata stale and retries without removing its content",
  async (kind) => {
    const data = kind === "run" ? run : suite;
    native.invoke.mockResolvedValue(data);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        {kind === "run" ? (
          <GitHubActionsRunDetail
            repository={repository}
            runId={1}
            backLabel="Back"
            onBack={() => {}}
          />
        ) : (
          <GitHubCheckSuiteDetail
            repository={repository}
            checkSuiteId={1}
            backLabel="Back"
            onBack={() => {}}
          />
        )}
      </QueryClientProvider>
    );
    const content = kind === "run" ? "Run data from GitHub" : "Check data from GitHub";
    await screen.findByText(content);
    native.invoke.mockRejectedValue(new Error("Metadata refresh failed"));
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(screen.getByText(content)).toBeTruthy();
    expect(await screen.findByText("common.staleResults")).toBeTruthy();
    native.invoke.mockResolvedValue(data);
    await userEvent.setup().click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
    expect(screen.getByText(content)).toBeTruthy();
    client.clear();
  }
);
