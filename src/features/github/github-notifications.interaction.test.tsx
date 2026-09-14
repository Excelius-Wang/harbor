// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { GitHubNotifications } from "./github-notifications";
import { openExternalUrl } from "@/lib/window";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn().mockResolvedValue(undefined) }));
const clients: QueryClient[] = [];
let writes: { threadId?: number; resolve: () => void; reject: () => void }[];
let read: Set<number>;
beforeEach(async () => {
  writes = [];
  read = new Set();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  await i18n.changeLanguage("en");
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "github_list_notifications")
      return {
        page: 1,
        hasPrevious: false,
        hasMore: false,
        notifications: [1, 2]
          .filter((id) => !read.has(id))
          .map((id) => ({
            id,
            repository: {
              id: 1,
              owner: "acme",
              name: "repo",
              fullName: "acme/repo",
              url: "https://github.com/acme/repo",
            },
            subject: { kind: "other", title: `Notice ${id}`, url: "https://github.com/acme/repo" },
            reason: "mention",
            unread: true,
            updatedAt: "2026-09-01T10:00:00Z",
          })),
      } as never;
    if (
      command === "github_update_notification" ||
      command === "github_mark_all_notifications_read"
    ) {
      const threadId = (args as { threadId?: number } | undefined)?.threadId;
      return await new Promise((resolve, reject) => {
        writes.push({
          threadId,
          resolve: () => {
            if (threadId) read.add(threadId);
            else {
              read.add(1);
              read.add(2);
            }
            resolve(undefined as never);
          },
          reject: () => reject({ code: "github", message: "Request failed" }),
        });
      });
    }
    throw new Error(`Unexpected ${command}`);
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubNotifications onSelectRepository={() => {}} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
function row(id: number) {
  return within(screen.getByText(`Notice ${id}`).closest("article")!);
}
function readButton(id: number) {
  return row(id).getByRole("button", { name: "Mark as read" }) as HTMLButtonElement;
}

it("tracks concurrent threads independently and blocks duplicate writes until each settles", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText("Notice 1");
  await user.click(readButton(1));
  await waitFor(() => expect(readButton(1).disabled).toBe(true));
  await user.click(readButton(2));
  await waitFor(() => expect(readButton(2).disabled).toBe(true));
  expect(readButton(1).disabled).toBe(true);
  await user.click(readButton(1));
  expect(writes).toHaveLength(2);
  expect(
    (screen.getByRole("button", { name: "Mark all as read" }) as HTMLButtonElement).disabled
  ).toBe(true);
  await act(async () => writes[1].resolve());
  await waitFor(() => expect(screen.queryByText("Notice 2")).toBeNull());
  expect(readButton(1).disabled).toBe(true);
  await act(async () => writes[0].reject());
  await waitFor(() => expect(readButton(1).disabled).toBe(false));
  await user.click(readButton(1));
  expect(writes).toHaveLength(3);
  await act(async () => writes[2].resolve());
  await waitFor(() => expect(screen.queryByText("Notice 1")).toBeNull());
});

it("opening a pending notification does not submit a second automatic mark-read", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText("Notice 1");
  await user.click(readButton(1));
  await user.click(row(1).getByRole("button", { name: /Notice 1/ }));
  await user.click(row(1).getByRole("button", { name: /Notice 1/ }));
  expect(writes).toHaveLength(1);
  expect(openExternalUrl).toHaveBeenCalled();
  await act(async () => writes[0].resolve());
});

it("bulk pending blocks thread writes and Escape, then allows retry after failure", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText("Notice 1");
  await user.click(screen.getByRole("button", { name: "Mark all as read" }));
  const dialog = screen.getByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Mark all as read" }));
  await waitFor(() =>
    expect(
      (within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled
    ).toBe(true)
  );
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  const reads = screen.getAllByRole("button", {
    name: "Mark as read",
    hidden: true,
  }) as HTMLButtonElement[];
  expect(reads.every((button) => button.disabled)).toBe(true);
  await act(async () => writes[0].reject());
  await waitFor(() =>
    expect(
      (within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled
    ).toBe(false)
  );
  await user.click(within(dialog).getByRole("button", { name: "Mark all as read" }));
  expect(writes).toHaveLength(2);
  await act(async () => writes[1].resolve());
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});

it("single done pending cannot be dismissed with Escape", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText("Notice 1");
  await user.click(row(1).getByRole("button", { name: "Mark as done" }));
  const dialog = screen.getByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Mark as done" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await act(async () => writes[0].resolve());
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.queryByText("Notice 1")).toBeNull();
});
