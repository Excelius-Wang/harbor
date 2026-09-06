// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GitHubConversationControls } from "./github-conversation-controls";
import { GitHubReactionBar } from "./github-reaction-bar";
import { GitHubReactionsProvider } from "./github-reactions-provider";
import type { GitHubReactionSubject, GitHubReactionSubjectRef } from "./github-data";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const repository = {
  owner: "octocat",
  name: "harbor",
  url: "https://github.com/octocat/harbor",
  defaultBranch: "main",
};
const subject = { kind: "issue", id: "I_1" } as const;
let current: GitHubReactionSubject;
let failedCommand: string | null;
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  failedCommand = null;
  current = {
    ...subject,
    viewerCanReact: true,
    groups: [{ content: "heart", count: 1, viewerHasReacted: true }],
  };
  native.invoke.mockImplementation(async (command: string) => {
    if (command === failedCommand) throw { code: "preview", message: "Refresh unavailable" };
    if (command === "github_get_repository_reactions") return [current];
    if (command === "github_get_repository_conversation_controls")
      return {
        kind: "issue",
        number: 1,
        locked: false,
        viewerCanLock: true,
        viewerCanSubscribe: true,
        viewerSubscription: "subscribed",
      };
    throw new Error(`Unexpected test command: ${command}`);
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mount(kind: "reactions" | "conversation", reference: GitHubReactionSubjectRef = subject) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {kind === "reactions" ? (
          <GitHubReactionsProvider repository={repository} subjects={[reference]}>
            <GitHubReactionBar subject={reference} />
          </GitHubReactionsProvider>
        ) : (
          <GitHubConversationControls
            repository={repository}
            conversationKind="issue"
            conversationNumber={1}
          />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
  return client;
}

it("keeps reaction counts with visible stale feedback and retries to recover", async () => {
  const client = mount("reactions");
  const selected = await screen.findByRole("button", { pressed: true });
  failedCommand = "github_get_repository_reactions";
  await act(async () => {
    await client.invalidateQueries();
  });
  const retry = await screen.findByRole("button", { name: "common.staleRetry" });
  expect(selected.textContent).toContain("1");
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(retry);
  const tooltip = await screen.findByRole("tooltip");
  expect(retry.getAttribute("aria-describedby")).toBe(tooltip.id);
  expect(tooltip.textContent).toContain("Refresh unavailable");
  failedCommand = null;
  let finishRetry = () => {};
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRetry = () => resolve([current]);
      })
  );
  await user.click(retry);
  await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(true));
  await act(async () => {
    finishRetry();
  });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "common.staleRetry" })).toBeNull()
  );
  expect(screen.getByRole("button", { pressed: true }).textContent).toContain("1");
});

it("shows stale feedback even when the cached reaction list is empty and read only", async () => {
  current = { ...current, viewerCanReact: false, groups: [] };
  const client = mount("reactions");
  await waitFor(() => expect(client.isFetching()).toBe(0));
  failedCommand = "github_get_repository_reactions";
  await act(async () => {
    await client.invalidateQueries();
  });
  expect(await screen.findByRole("button", { name: "common.staleRetry" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "workspace.repositories.reactions.add" })).toBeNull();
});

it("retains conversation actions after refresh failure and removes the notice on retry", async () => {
  const client = mount("conversation");
  const lock = await screen.findByRole("button", {
    name: "workspace.repositories.lockConversation",
  });
  failedCommand = "github_get_repository_conversation_controls";
  await act(async () => {
    await client.invalidateQueries();
  });
  expect(await screen.findByText("common.staleResults")).toBeTruthy();
  expect(lock.isConnected).toBe(true);
  expect(
    screen.getByRole("button", { name: "workspace.repositories.unsubscribeConversation" })
  ).toBeTruthy();
  failedCommand = null;
  await userEvent.setup().click(screen.getByRole("button", { name: "common.retry" }));
  await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
  expect(lock.isConnected).toBe(true);
});

it("guards the pending lock dialog and preserves a failed reason until reopening", async () => {
  mount("conversation");
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "workspace.repositories.lockConversation" })
  );
  const dialog = screen.getByRole("alertdialog");
  const reason = within(dialog).getByRole("combobox");
  await user.click(reason);
  await user.click(
    await screen.findByRole("option", { name: "workspace.repositories.lockReasons.resolved" })
  );
  let reject!: (value: unknown) => void;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      })
  );
  await user.click(
    within(dialog).getByRole("button", { name: "workspace.repositories.lockConversation" })
  );
  await waitFor(() => expect((reason as HTMLButtonElement).disabled).toBe(true));
  expect(
    (
      within(dialog).getByRole("button", {
        name: "workspace.repositories.cancel",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  await user.keyboard("{Escape}");
  expect(dialog.isConnected).toBe(true);
  expect(native.invoke).toHaveBeenCalledWith("github_update_repository_conversation_lock", {
    owner: "octocat",
    repository: "harbor",
    conversationKind: "issue",
    conversationNumber: 1,
    action: "lock",
    reason: "resolved",
  });
  await act(async () => {
    reject({ code: "githubPermission", message: "Denied" });
  });
  expect(
    await screen.findByText("workspace.repositories.conversationControlPermissionDenied")
  ).toBeTruthy();
  expect(reason.textContent).toContain("workspace.repositories.lockReasons.resolved");
  await user.click(within(dialog).getByRole("button", { name: "workspace.repositories.cancel" }));
  await user.click(screen.getByRole("button", { name: "workspace.repositories.lockConversation" }));
  expect(
    screen.queryByText("workspace.repositories.conversationControlPermissionDenied")
  ).toBeNull();
  expect(screen.getByRole("combobox").textContent).toContain("workspace.repositories.noLockReason");
  native.invoke.mockResolvedValueOnce({
    kind: "issue",
    number: 1,
    locked: true,
    viewerCanLock: true,
    viewerCanSubscribe: true,
    viewerSubscription: "subscribed",
  });
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "workspace.repositories.lockConversation",
    })
  );
  await screen.findByRole("button", { name: "workspace.repositories.unlockConversation" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("recovers from a subscription failure while retaining its current status", async () => {
  mount("conversation");
  const user = userEvent.setup();
  const unsubscribe = await screen.findByRole("button", {
    name: "workspace.repositories.unsubscribeConversation",
  });
  native.invoke.mockRejectedValueOnce({ code: "githubPermission", message: "Denied" });
  await user.click(unsubscribe);
  await screen.findByText("workspace.repositories.conversationControlPermissionDenied");
  expect(unsubscribe.isConnected).toBe(true);
  native.invoke.mockResolvedValueOnce({
    kind: "issue",
    number: 1,
    locked: false,
    viewerCanLock: true,
    viewerCanSubscribe: true,
    viewerSubscription: "unsubscribed",
  });
  await user.click(unsubscribe);
  await screen.findByRole("button", { name: "workspace.repositories.subscribeConversation" });
  expect(
    screen.queryByText("workspace.repositories.conversationControlPermissionDenied")
  ).toBeNull();
});

it("allows owned reaction removal without add permission and rolls back a failed write", async () => {
  current = { ...current, viewerCanReact: false };
  mount("reactions");
  const selected = await screen.findByRole("button", { pressed: true });
  expect(screen.queryByRole("button", { name: "workspace.repositories.reactions.add" })).toBeNull();
  let reject!: (value: unknown) => void;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      })
  );
  await userEvent.setup().click(selected);
  await waitFor(() => expect(screen.queryByRole("button", { pressed: true })).toBeNull());
  expect(native.invoke).toHaveBeenCalledWith("github_update_repository_reaction", {
    owner: "octocat",
    repository: "harbor",
    subject,
    content: "heart",
    reacted: false,
  });
  await act(async () => {
    reject({ code: "preview", message: "Reaction update failed" });
  });
  expect((await screen.findByRole("button", { pressed: true })).textContent).toContain("1");
});

it("offers only the six supported Release reaction choices", async () => {
  const release = { kind: "release", id: "release_1" } as const;
  current = { ...current, ...release };
  mount("reactions", release);
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "workspace.repositories.reactions.add" }));
  expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(6);
  expect(screen.queryByRole("menuitemcheckbox", { name: /reactions.names.thumbsDown/ })).toBeNull();
  expect(screen.queryByRole("menuitemcheckbox", { name: /reactions.names.confused/ })).toBeNull();
});
