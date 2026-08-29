// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubPullRequest, GitHubPullRequestBaseBranchPage } from "./github-data";
import { GitHubPullRequestBaseEdit } from "./github-pull-request-base-edit";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react");
  const DialogContext = React.createContext({
    open: false,
    onOpenChange: (() => undefined) as (open: boolean) => void,
  });
  const Container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) => (
      <DialogContext.Provider value={{ open, onOpenChange }}>
        <div data-dialog-open={String(open)}>{children}</div>
      </DialogContext.Provider>
    ),
    DialogTrigger: ({ children }: { children: React.ReactNode }) => {
      const context = React.useContext(DialogContext);
      return (
        <div
          role="button"
          tabIndex={0}
          data-testid="base-dialog-trigger"
          onClick={() => context.onOpenChange(true)}
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") context.onOpenChange(true);
          }}
        >
          {children}
        </div>
      );
    },
    DialogContent: ({
      children,
      showCloseButton,
      ...props
    }: {
      children: React.ReactNode;
      showCloseButton: boolean;
      "aria-busy"?: boolean;
    }) => {
      const context = React.useContext(DialogContext);
      return context.open ? (
        <section
          aria-busy={props["aria-busy"]}
          data-close-button={String(showCloseButton)}
          data-testid="base-dialog-content"
        >
          {children}
        </section>
      ) : null;
    },
    DialogDescription: Container,
    DialogFooter: Container,
    DialogHeader: Container,
    DialogTitle: Container,
  };
});
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (props: React.ComponentProps<"input">) => <input role="combobox" {...props} />,
  CommandItem: ({
    children,
    disabled,
    onSelect,
    value,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
    value: string;
  }) => (
    <button
      type="button"
      role="option"
      disabled={disabled}
      data-value={value}
      onClick={() => onSelect?.()}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect?.();
      }}
    >
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div role="listbox">{children}</div>
  ),
}));

const pullRequest: GitHubPullRequest = {
  id: 3,
  number: 12,
  title: "Ship the PR workspace",
  body: "Pull request body",
  url: "https://github.com/octocat/hello-world/pull/12",
  state: "open",
  draft: false,
  merged: false,
  mergeable: true,
  mergeableState: "clean",
  author: "octocat",
  assignees: [],
  requestedReviewers: [],
  requestedTeams: [],
  labels: [],
  locked: false,
  headRef: "feature/pr-workspace",
  headSha: "abc1234",
  baseRef: "main",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  commits: 1,
  comments: 0,
  reviewComments: 0,
};

function branchPage(
  page: number,
  branches: GitHubPullRequestBaseBranchPage["branches"],
  hasMore: boolean
): GitHubPullRequestBaseBranchPage {
  return {
    pullRequestNumber: 12,
    currentBase: "main",
    currentBaseSha: "base1234",
    headSha: "abc1234",
    branches,
    page,
    hasPrevious: page > 1,
    hasMore,
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

function renderBaseEdit(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <GitHubPullRequestBaseEdit
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

describe("pull request base edit dialog interactions", () => {
  it("opens by keyboard, loads every page, selects by keyboard, and locks while pending", async () => {
    const pendingMutation = new Promise(() => undefined);
    vi.mocked(invoke)
      .mockResolvedValueOnce(
        branchPage(1, [{ name: "main", sha: "base1234", protected: true }], true)
      )
      .mockResolvedValueOnce(
        branchPage(2, [{ name: "release", sha: "release123", protected: false }], false)
      )
      .mockReturnValueOnce(pendingMutation);
    const client = createQueryClient();
    const user = userEvent.setup();
    const view = renderBaseEdit(client);

    screen.getByTestId("base-dialog-trigger").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_repository_pull_request_base_branches", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 1,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repository_pull_request_base_branches", {
      owner: "octocat",
      repository: "hello-world",
      pullRequestNumber: 12,
      page: 2,
    });
    const release = screen.getByRole("option", { name: /release/ });
    release.focus();
    await user.keyboard("{Enter}");
    const confirmButtons = screen.getAllByRole("button", {
      name: "workspace.repositories.changePullRequestBase",
    });
    const confirm = confirmButtons[confirmButtons.length - 1];
    expect((confirm as HTMLButtonElement).disabled).toBe(false);

    await user.click(confirm);
    await waitFor(() =>
      expect((screen.getByRole("combobox") as HTMLInputElement).disabled).toBe(true)
    );

    expect(screen.getByTestId("base-dialog-content").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("base-dialog-content").getAttribute("data-close-button")).toBe(
      "false"
    );
    expect(
      within(screen.getByTestId("base-dialog-content"))
        .getAllByRole("button", { hidden: true })
        .filter((button) => button.hasAttribute("disabled")).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByRole("option").every((option) => (option as HTMLButtonElement).disabled)
    ).toBe(true);

    view.unmount();
    client.clear();
  });

  it("keeps the current base visible and retries a failed branch load", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(
        branchPage(1, [{ name: "release", sha: "release123", protected: false }], false)
      );
    const client = createQueryClient();
    const user = userEvent.setup();
    const view = renderBaseEdit(client);

    await user.click(screen.getByTestId("base-dialog-trigger"));
    await screen.findByText(/network unavailable/);

    expect(screen.getByText("main")).toBeDefined();
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.retry",
      })
    );

    expect(await screen.findByRole("option", { name: /release/ })).toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(2);
    view.unmount();
    client.clear();
  });
});
