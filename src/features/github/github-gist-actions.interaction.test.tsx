// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitHubGist, GitHubGistComment } from "./github-data";
import { GitHubGistDetail } from "./github-gist-detail";
import { GitHubGistEditorDialog } from "./github-gist-editor-dialog";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));
vi.mock("./github-readme", () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));

const gist: GitHubGist = {
  id: "abc123",
  description: "Saved description",
  url: "https://gist.github.com/abc123",
  public: false,
  owner: "harbor-preview",
  viewerOwns: true,
  starred: false,
  comments: 1,
  commentsEnabled: true,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  files: [{ filename: "notes.md", content: "Saved file", truncated: false, size: 10 }],
};
const comment: GitHubGistComment = {
  id: 1,
  body: "Saved comment",
  author: "harbor-preview",
  createdAt: gist.createdAt,
  updatedAt: gist.updatedAt,
  viewerCanUpdate: true,
  viewerCanDelete: true,
};
const props = {
  open: true,
  pending: false,
  error: "",
  onOpenChange: vi.fn(),
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
};
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
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  );
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "github_get_gist") return structuredClone(gist);
    if (command === "github_list_gist_comments")
      return { comments: [structuredClone(comment)], page: 1, hasMore: false, hasPrevious: false };
    throw new Error(`Unexpected command: ${command}`);
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])("guards pending Gist editor dismissal (editing=%s)", async (editing) => {
  render(<GitHubGistEditorDialog {...props} gist={editing ? gist : undefined} pending />);
  const dialog = screen.getByRole("dialog");
  for (const control of dialog.querySelectorAll("input,textarea,button"))
    expect((control as HTMLInputElement).disabled).toBe(true);
  await userEvent.setup().keyboard("{Escape}");
  expect(props.onOpenChange).not.toHaveBeenCalled();
});

it("preserves file and description drafts across refresh and initializes on reopen or identity change", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<GitHubGistEditorDialog {...props} gist={gist} />);
  const description = screen.getByRole("textbox", { name: "workspace.gists.description" });
  const content = screen.getByRole("textbox", { name: "workspace.gists.fileContent" });
  await user.clear(description);
  await user.type(description, "Unsent description");
  await user.clear(content);
  await user.type(content, "Unsent file");
  const refreshed = { ...gist, description: "Refreshed description", comments: 2 };
  rerender(<GitHubGistEditorDialog {...props} gist={refreshed} error="Save failed" />);
  expect((description as HTMLInputElement).value).toBe("Unsent description");
  expect(
    (screen.getByRole("textbox", { name: "workspace.gists.fileContent" }) as HTMLTextAreaElement)
      .value
  ).toBe("Unsent file");
  await user.click(screen.getByRole("button", { name: "workspace.gists.save" }));
  expect(props.onUpdate).toHaveBeenCalledWith({
    description: "Unsent description",
    files: [
      {
        originalFilename: "notes.md",
        filename: "notes.md",
        content: "Unsent file",
        deleted: false,
      },
    ],
  });
  rerender(<GitHubGistEditorDialog {...props} gist={refreshed} open={false} />);
  rerender(<GitHubGistEditorDialog {...props} gist={refreshed} />);
  expect(
    (screen.getByRole("textbox", { name: "workspace.gists.description" }) as HTMLInputElement).value
  ).toBe("Refreshed description");
  rerender(<GitHubGistEditorDialog {...props} gist={{ ...gist, id: "different" }} />);
  expect(
    (screen.getByRole("textbox", { name: "workspace.gists.description" }) as HTMLInputElement).value
  ).toBe("Saved description");
});

it("names the visibility radio group", () => {
  render(<GitHubGistEditorDialog {...props} />);
  expect(screen.getByRole("radiogroup", { name: "workspace.gists.visibility" })).toBeTruthy();
});

async function mountDetail(comments = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubGistDetail
          gistId={gist.id}
          onBack={vi.fn()}
          onDeleted={vi.fn()}
          onForked={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
  await screen.findByText("Saved description");
  if (comments) {
    await userEvent.setup().click(screen.getByRole("tab", { name: "workspace.gists.comments" }));
    await screen.findByText("Saved comment");
  }
}

it("saving an edited comment preserves a separate new-comment draft", async () => {
  await mountDetail(true);
  const user = userEvent.setup();
  const draft = screen.getByRole("textbox", { name: "workspace.gists.addComment" });
  await user.type(draft, "Unsent new comment");
  const article = screen.getByText("Saved comment").closest("article")!;
  await user.click(within(article).getByRole("button", { name: "common.edit" }));
  const editor = within(article).getByRole("textbox");
  await user.clear(editor);
  await user.type(editor, "Updated comment");
  native.invoke.mockResolvedValueOnce({ ...comment, body: "Updated comment" });
  await user.click(within(article).getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(within(article).queryByRole("textbox")).toBeNull());
  expect((draft as HTMLTextAreaElement).value).toBe("Unsent new comment");
});

it("keeps comment delete pending and confines/reset its error to that confirmation", async () => {
  await mountDetail(true);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "workspace.gists.deleteComment" }));
  let reject!: (reason: unknown) => void;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "common.delete" })
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeNull();
  await act(async () => reject({ code: "githubPermission", message: "Delete denied" }));
  expect(await screen.findAllByText("Delete denied")).toHaveLength(1);
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "common.cancel" })
  );
  await user.click(screen.getByRole("button", { name: "workspace.gists.deleteComment" }));
  expect(screen.queryByText("Delete denied")).toBeNull();
});

it("keeps comment controls locked during creation and preserves an open edit", async () => {
  await mountDetail(true);
  const user = userEvent.setup();
  const article = screen.getByText("Saved comment").closest("article")!;
  await user.click(within(article).getByRole("button", { name: "common.edit" }));
  const editor = within(article).getByRole("textbox");
  await user.type(editor, " unsent edit");
  await user.type(
    screen.getByRole("textbox", { name: "workspace.gists.addComment" }),
    "New comment"
  );
  let resolve!: (value: unknown) => void;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await user.click(screen.getByRole("button", { name: "workspace.gists.comment" }));
  expect(
    (within(article).getByRole("button", { name: "common.edit" }) as HTMLButtonElement).disabled
  ).toBe(true);
  expect(
    (
      within(article).getByRole("button", {
        name: "workspace.gists.deleteComment",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  await act(async () => resolve({ ...comment, id: 2, body: "New comment" }));
  expect((within(article).getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "Saved comment unsent edit"
  );
});

it.each(["create", "update"])(
  "confines a failed comment %s to its form and retains both drafts",
  async (action) => {
    await mountDetail(true);
    const user = userEvent.setup();
    const article = screen.getByText("Saved comment").closest("article")!;
    await user.click(within(article).getByRole("button", { name: "common.edit" }));
    await user.type(within(article).getByRole("textbox"), " unsent edit");
    const draft = screen.getByRole("textbox", { name: "workspace.gists.addComment" });
    await user.type(draft, "Unsent comment");
    native.invoke.mockRejectedValueOnce({ code: "githubPermission", message: "Save denied" });
    await user.click(
      action === "create"
        ? screen.getByRole("button", { name: "workspace.gists.comment" })
        : within(article).getByRole("button", { name: "common.save" })
    );
    expect(await screen.findAllByText("Save denied")).toHaveLength(1);
    const form = draft.closest("form")!;
    expect(within(action === "create" ? form : article).getByText("Save denied")).toBeTruthy();
    expect(within(action === "create" ? article : form).queryByText("Save denied")).toBeNull();
    expect((draft as HTMLTextAreaElement).value).toBe("Unsent comment");
    expect((within(article).getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Saved comment unsent edit"
    );
  }
);

it("keeps Gist deletion confirmation open while pending and resets a failure on reopen", async () => {
  await mountDetail();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "workspace.gists.delete" }));
  await user.type(within(screen.getByRole("alertdialog")).getByRole("textbox"), gist.id);
  let reject!: (reason: unknown) => void;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  await user.click(screen.getByRole("button", { name: "workspace.gists.deletePermanently" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeNull();
  await act(async () => reject({ code: "githubPermission", message: "Delete denied" }));
  await screen.findByText("Delete denied");
  await user.click(screen.getByRole("button", { name: "common.cancel" }));
  await user.click(screen.getByRole("button", { name: "workspace.gists.delete" }));
  expect(screen.queryByText("Delete denied")).toBeNull();
  expect(
    (within(screen.getByRole("alertdialog")).getByRole("textbox") as HTMLInputElement).value
  ).toBe("");
});

it("names the Gist file picker and switches the selected file", async () => {
  native.invoke.mockResolvedValueOnce({
    ...gist,
    files: [
      ...gist.files,
      { filename: "other.md", content: "Other file content", truncated: false, size: 18 },
    ],
  });
  await mountDetail();
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "workspace.gists.files" }));
  await user.click(screen.getByRole("option", { name: "other.md" }));
  expect(await screen.findByText("Other file content")).toBeTruthy();
});
