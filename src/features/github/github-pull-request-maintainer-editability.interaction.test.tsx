// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";
import type { GitHubPullRequest, GitHubPullRequestMaintainerEditability } from "./github-data";
import {
  GitHubPullRequestMaintainerEditability as MaintainerEditability,
  shouldShowPullRequestMaintainerEditability,
} from "./github-pull-request-maintainer-editability";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const pullRequest: GitHubPullRequest = {
  id: 3,
  number: 12,
  title: "Ship the PR workspace",
  url: "https://github.com/octocat/hello-world/pull/12",
  state: "open",
  draft: true,
  merged: false,
  maintainerCanModify: false,
  author: "contributor",
  assignees: [],
  requestedReviewers: [],
  requestedTeams: [],
  labels: [],
  locked: false,
  headRef: "feature",
  headSha: "abc1234",
  baseRef: "main",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  commits: 1,
  comments: 0,
  reviewComments: 0,
};

function status(
  value: Partial<GitHubPullRequestMaintainerEditability> = {}
): GitHubPullRequestMaintainerEditability {
  return {
    pullRequest,
    state: "available",
    workflowRisk: "present",
    pullRequestId: 3,
    pullRequestNodeId: "PR_3",
    pullRequestNumber: 12,
    authorId: 1,
    authorLogin: "contributor",
    viewerId: 1,
    currentValue: false,
    draft: true,
    merged: false,
    baseRepositoryId: 2,
    baseRepository: "octocat/hello-world",
    headRepositoryId: 4,
    headRepository: "contributor/hello-world",
    headRepositoryOwnerType: "User",
    headRepositoryPrivate: false,
    headRepositoryFork: true,
    headRef: "feature",
    headSha: "abc1234",
    ...value,
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderSetting(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MaintainerEditability
        repository={{
          owner: "octocat",
          name: "hello-world",
          fullName: "octocat/hello-world",
          url: "https://github.com/octocat/hello-world",
        }}
        pullRequest={pullRequest}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("pull request maintainer editability", () => {
  it("omits ineligible states but keeps a deleted source branch visible", () => {
    for (const state of ["notAuthor", "sameRepository", "organizationFork", "closed"] as const) {
      expect(shouldShowPullRequestMaintainerEditability(status({ state }))).toBe(false);
    }
    expect(shouldShowPullRequestMaintainerEditability(status({ state: "headUnavailable" }))).toBe(
      true
    );
  });

  it("warns about workflows and locks the checkbox while a keyboard update is pending", async () => {
    const pendingMutation = new Promise(() => undefined);
    vi.mocked(invoke).mockResolvedValueOnce(status()).mockReturnValueOnce(pendingMutation);
    const client = createQueryClient();
    const user = userEvent.setup();
    const view = renderSetting(client);

    const checkbox = await screen.findByRole("checkbox", {
      name: "workspace.repositories.allowMaintainerEditsWithSecrets",
    });
    expect(checkbox.getAttribute("aria-describedby")).toContain("warning");
    expect(
      screen.getByText("workspace.repositories.pullRequestMaintainerWorkflowWarning")
    ).toBeDefined();

    checkbox.focus();
    await user.keyboard(" ");
    await waitFor(() => expect((checkbox as HTMLButtonElement).disabled).toBe(true));

    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "github_update_repository_pull_request_maintainer_editability",
      {
        owner: "octocat",
        repository: "hello-world",
        pullRequestNumber: 12,
        expectedCurrentValue: false,
        expectedPullRequestId: 3,
        expectedPullRequestNodeId: "PR_3",
        expectedAuthorId: 1,
        expectedHeadRepositoryId: 4,
        expectedHeadRef: "feature",
        expectedHeadSha: "abc1234",
        expectedWorkflowRisk: "present",
        requestedValue: true,
      }
    );
    expect(
      screen.getByText("workspace.repositories.updatingPullRequestMaintainerEditability")
    ).toBeDefined();
    view.unmount();
    client.clear();
  });

  it("retries a failed status load", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(status({ workflowRisk: "absent" }));
    const client = createQueryClient();
    const user = userEvent.setup();
    const view = renderSetting(client);

    expect(await screen.findByText(/network unavailable/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "workspace.repositories.retry" }));

    expect(
      await screen.findByRole("checkbox", {
        name: "workspace.repositories.allowMaintainerEdits",
      })
    ).toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(2);
    view.unmount();
    client.clear();
  });

  it("shows unavailable and permission states without changing the verified value", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(status({ state: "headUnavailable" }));
    const unavailableClient = createQueryClient();
    const unavailableView = renderSetting(unavailableClient);
    expect(
      await screen.findByText("workspace.repositories.pullRequestMaintainerHeadUnavailable")
    ).toBeDefined();
    expect(screen.queryByRole("checkbox")).toBeNull();
    unavailableView.unmount();
    unavailableClient.clear();

    vi.mocked(invoke)
      .mockResolvedValueOnce(status({ workflowRisk: "absent" }))
      .mockRejectedValueOnce({ code: "githubPermission", message: "forbidden" });
    const permissionClient = createQueryClient();
    const user = userEvent.setup();
    const permissionView = renderSetting(permissionClient);
    const checkbox = await screen.findByRole("checkbox", {
      name: "workspace.repositories.allowMaintainerEdits",
    });
    await user.click(checkbox);

    expect(
      await screen.findByText(
        "workspace.repositories.pullRequestMaintainerEditabilityPermissionDenied"
      )
    ).toBeDefined();
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    permissionView.unmount();
    permissionClient.clear();
  });

  it("keeps the official workflow and secret warning in both locales", () => {
    expect(en.workspace.repositories.allowMaintainerEditsWithSecrets).toBe(
      "Allow edits and access to secrets by maintainers"
    );
    expect(en.workspace.repositories.pullRequestMaintainerWorkflowWarning).toContain(
      "potentially reveal secret values"
    );
    expect(zh.workspace.repositories.allowMaintainerEditsWithSecrets).toContain("密钥");
    expect(zh.workspace.repositories.pullRequestMaintainerWorkflowWarning).toContain("其他分支");
  });
});
