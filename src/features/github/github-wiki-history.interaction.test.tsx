// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GitHubWikiHistoryDialog } from "./github-wiki-history-dialog";
import type { GitHubRepository, GitHubWikiOverview, GitHubWikiPage } from "./github-data";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("./github-readme", () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
const page: GitHubWikiPage = {
  path: "Home.md",
  title: "Home",
  kind: "home",
  markdown: true,
  blobSha: "current-blob",
  byteSize: 20,
  content: "Current notes",
  headSha: "current",
};
const overview: GitHubWikiOverview = {
  repositoryId: 1,
  enabled: true,
  initialized: true,
  canEdit: true,
  archived: false,
  headSha: page.headSha,
  pages: [page],
  unsupportedFileCount: 0,
  truncated: false,
  stale: false,
  webUrl: `${repository.url}/wiki`,
};
const revisions = [
  {
    sha: "current",
    shortSha: "current",
    message: "Current revision",
    authorName: "Alex",
    authoredAt: 1788256800,
  },
  {
    sha: "previous",
    shortSha: "previou",
    message: "Earlier revision",
    authorName: "Lin",
    authoredAt: 1788170400,
  },
];
const patch =
  "diff --git a/Home.md b/Home.md\nindex aaaaaaa..bbbbbbb 100644\n--- a/Home.md\n+++ b/Home.md\n@@ -1 +1 @@\n-Old note\n+New note\n";
let failedCommand: string | null;
let emptyHistory: boolean;
let rawPatch: boolean;
const clients: QueryClient[] = [];
beforeEach(() => {
  failedCommand = null;
  emptyHistory = false;
  rawPatch = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  native.invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
    if (command === failedCommand) throw { code: "preview", message: "Wiki request failed" };
    if (command === "github_list_repository_wiki_history")
      return {
        revisions: emptyHistory ? [] : revisions,
        page: 1,
        hasMore: false,
        truncated: false,
      };
    if (command === "github_get_repository_wiki_revision")
      return {
        revision: revisions.find((item) => item.sha === args.commitSha),
        path: page.path,
        blobSha: "blob",
        content: args.commitSha === "previous" ? "Earlier notes" : page.content,
        markdown: true,
        deleted: false,
      };
    if (command === "github_compare_repository_wiki_revisions")
      return {
        path: page.path,
        baseSha: "previous",
        headSha: "current",
        patch: rawPatch ? "Binary revision content differs" : patch,
        additions: 1,
        deletions: 1,
        truncated: false,
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
function mountHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubWikiHistoryDialog
          open
          onOpenChange={() => {}}
          repository={repository}
          overview={overview}
          page={page}
          onReverted={() => {}}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return client;
}
async function chooseEarlier() {
  await userEvent.setup().click(await screen.findByRole("button", { name: /Earlier revision/ }));
  await screen.findByText("Earlier notes");
}

it("shows an empty history without an indefinitely pending revision", async () => {
  emptyHistory = true;
  mountHistory();
  await screen.findByText("workspace.repositories.wiki.historyEmpty");
  expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
});

it.each([
  "github_list_repository_wiki_history",
  "github_get_repository_wiki_revision",
  "github_compare_repository_wiki_revisions",
])("retains history, body and comparison when %s refresh fails", async (command) => {
  const client = mountHistory();
  await chooseEarlier();
  await screen.findByText("New note");
  await waitFor(() => expect(client.isFetching()).toBe(0));
  failedCommand = command;
  await act(async () => {
    await client.invalidateQueries();
  });
  await screen.findByText("common.staleResults");
  expect(screen.getByRole("button", { name: /Earlier revision/ })).toBeTruthy();
  expect(screen.getByText("Earlier notes")).toBeTruthy();
  expect(screen.getByText("New note")).toBeTruthy();
  failedCommand = null;
  await userEvent.setup().click(screen.getByRole("button", { name: "common.retry" }));
  await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
});

it("shows the source of an unparseable comparison instead of claiming no changes", async () => {
  rawPatch = true;
  mountHistory();
  await chooseEarlier();
  await screen.findByText("Binary revision content differs");
  expect(screen.queryByText("workspace.repositories.wiki.noRevisionChanges")).toBeNull();
});

it("keeps a restore error in its confirmation and clears it on reopening", async () => {
  const user = userEvent.setup();
  mountHistory();
  await chooseEarlier();
  const opener = screen.getByRole("button", { name: "workspace.repositories.wiki.revert" });
  await user.click(opener);
  const dialog = await screen.findByRole("alertdialog");
  failedCommand = "github_revert_repository_wiki_page";
  await user.click(
    within(dialog).getByRole("button", { name: "workspace.repositories.wiki.revert" })
  );
  await within(dialog).findByText("Wiki request failed");
  expect(
    within(dialog)
      .getByRole("button", { name: "workspace.repositories.wiki.revert" })
      .hasAttribute("disabled")
  ).toBe(false);
  await user.click(within(dialog).getByRole("button", { name: "common.cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await user.click(opener);
  expect(
    within(await screen.findByRole("alertdialog")).queryByText("Wiki request failed")
  ).toBeNull();
});
