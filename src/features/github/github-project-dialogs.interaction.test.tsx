// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createProjectFixtures } from "@/dev/project-fixtures";
import type {
  GitHubProjectDetail,
  GitHubProjectField,
  GitHubProjectItem,
  GitHubProjectSummary,
  GitHubRepository,
} from "./github-data";
import {
  AddProjectItemDialog,
  CreateProjectDialog,
  EditProjectDraftDialog,
  ProjectFieldEditDialog,
  ProjectSettingsDialog,
} from "./github-project-dialogs";
import { GitHubProjects } from "./github-project-view";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));

const project: GitHubProjectSummary = {
  id: "P_1",
  number: 1,
  title: "Roadmap",
  shortDescription: "Planning notes",
  url: "https://github.com/users/harbor-preview/projects/1",
  public: false,
  closed: false,
  itemCount: 1,
  updatedAt: "2026-09-01T10:00:00Z",
  viewerCanUpdate: true,
  viewerCanClose: true,
  viewerCanReopen: true,
};
const item: GitHubProjectItem = {
  id: "PI_1",
  archived: false,
  content: { kind: "draftIssue", id: "DI_1", title: "Draft title", body: "Draft body" },
  fieldValues: [{ kind: "text", fieldId: "notes", text: "Saved text" }],
  createdAt: project.updatedAt,
  updatedAt: project.updatedAt,
};
const field: GitHubProjectField = {
  id: "notes",
  name: "Notes",
  dataType: "text",
  editable: true,
  issueField: false,
  options: [],
  iterations: [],
};
const submit = vi.fn();
const changeOpen = vi.fn();
const props = { open: true, pending: false, error: "", onOpenChange: changeOpen, onSubmit: submit };
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
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mount(content: ReactNode) {
  const wrap = (children: ReactNode) => <TooltipProvider>{children}</TooltipProvider>;
  const result = render(wrap(content));
  return { rerender: (children: ReactNode) => result.rerender(wrap(children)) };
}

it.each(["create", "settings", "add", "draft", "field"])(
  "locks %s dialog controls and dismissal while pending",
  async (kind) => {
    const pending = { ...props, pending: true };
    mount(
      kind === "create" ? (
        <CreateProjectDialog {...pending} />
      ) : kind === "settings" ? (
        <ProjectSettingsDialog {...pending} project={project} readme="Saved notes" />
      ) : kind === "add" ? (
        <AddProjectItemDialog {...pending} />
      ) : kind === "draft" ? (
        <EditProjectDraftDialog {...pending} item={item} />
      ) : (
        <ProjectFieldEditDialog {...pending} field={field} item={item} />
      )
    );
    const dialog = screen.getByRole("dialog");
    for (const control of dialog.querySelectorAll(
      'input,textarea,[role="checkbox"],[role="combobox"],[role="tab"]'
    ))
      expect((control as HTMLInputElement).disabled).toBe(true);
    await userEvent.setup().keyboard("{Escape}");
    expect(changeOpen).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  }
);

it("preserves settings drafts across refreshes and uses fresh values when reopened", async () => {
  const { rerender } = mount(
    <ProjectSettingsDialog {...props} project={project} readme="Saved readme" />
  );
  const title = screen.getByRole("textbox", { name: "workspace.projects.fields.title" });
  await userEvent.setup().clear(title);
  await userEvent.setup().type(title, "My unsaved title");
  const refreshed = { ...project, title: "New server title" };
  rerender(
    <ProjectSettingsDialog
      {...props}
      project={refreshed}
      readme="New server readme"
      error="Save failed"
    />
  );
  expect((title as HTMLInputElement).value).toBe("My unsaved title");
  expect(
    (
      screen.getByRole("textbox", {
        name: "workspace.projects.fields.readme",
      }) as HTMLTextAreaElement
    ).value
  ).toBe("Saved readme");
  rerender(
    <ProjectSettingsDialog
      {...props}
      project={{ ...refreshed, viewerCanUpdate: false }}
      readme="New server readme"
    />
  );
  expect((screen.getByRole("button", { name: "common.save" }) as HTMLButtonElement).disabled).toBe(
    true
  );
  expect(
    (screen.getByRole("button", { name: "common.cancel" }) as HTMLButtonElement).disabled
  ).toBe(false);
  rerender(
    <ProjectSettingsDialog {...props} open={false} project={refreshed} readme="New server readme" />
  );
  rerender(<ProjectSettingsDialog {...props} project={refreshed} readme="New server readme" />);
  expect(
    (screen.getByRole("textbox", { name: "workspace.projects.fields.title" }) as HTMLInputElement)
      .value
  ).toBe("New server title");
});

it("preserves an edited draft through a refreshed item and resets for another item", async () => {
  const { rerender } = mount(<EditProjectDraftDialog {...props} item={item} />);
  const body = screen.getByRole("textbox", { name: "workspace.projects.fields.body" });
  await userEvent.setup().clear(body);
  await userEvent.setup().type(body, "My unsaved body");
  const refreshed: GitHubProjectItem = {
    ...item,
    content: { kind: "draftIssue", id: "DI_1", title: "Server title", body: "Server body" },
  };
  rerender(<EditProjectDraftDialog {...props} item={refreshed} error="Save failed" />);
  expect((body as HTMLTextAreaElement).value).toBe("My unsaved body");
  rerender(<EditProjectDraftDialog {...props} item={{ ...refreshed, id: "PI_2" }} />);
  expect((body as HTMLTextAreaElement).value).toBe("Server body");
});

it("preserves field edits through refreshes and resets when changing fields", async () => {
  const { rerender } = mount(<ProjectFieldEditDialog {...props} field={field} item={item} />);
  const input = screen.getByRole("textbox", { name: "Notes" });
  await userEvent.setup().clear(input);
  await userEvent.setup().type(input, "My field draft");
  const refreshed: GitHubProjectItem = {
    ...item,
    fieldValues: [{ kind: "text", fieldId: "notes", text: "Server text" }],
  };
  rerender(
    <ProjectFieldEditDialog {...props} field={field} item={refreshed} error="Save failed" />
  );
  expect((input as HTMLInputElement).value).toBe("My field draft");
  rerender(
    <ProjectFieldEditDialog {...props} field={{ ...field, id: "other" }} item={refreshed} />
  );
  expect((screen.getByRole("textbox", { name: "Notes" }) as HTMLInputElement).value).toBe("");
});

it("keeps numeric zero distinct from empty input and uses the explicit clear action", async () => {
  const numberField = { ...field, dataType: "number" as const };
  mount(
    <ProjectFieldEditDialog
      {...props}
      field={numberField}
      item={{ ...item, fieldValues: [{ kind: "number", fieldId: field.id, number: 0 }] }}
    />
  );
  const input = screen.getByRole("spinbutton");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "common.save" }));
  expect(submit).toHaveBeenLastCalledWith({ kind: "number", fieldId: field.id, number: 0 });
  await user.clear(input);
  expect((screen.getByRole("button", { name: "common.save" }) as HTMLButtonElement).disabled).toBe(
    true
  );
  await user.click(screen.getByRole("button", { name: "workspace.projects.clearField" }));
  expect(submit).toHaveBeenLastCalledWith({ kind: "clearField", fieldId: field.id });
});

it.each(["singleSelect", "multiSelect", "iteration"] as const)(
  "explains empty choice lists for %s fields without enabling a write",
  (dataType) => {
    mount(
      <ProjectFieldEditDialog
        {...props}
        field={{ ...field, dataType }}
        item={{ ...item, fieldValues: [] }}
      />
    );
    expect(screen.getByText("workspace.projects.noFieldOptions")).toBeTruthy();
    const select = screen.queryByRole("combobox");
    if (select) expect((select as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "common.save" }) as HTMLButtonElement).disabled
    ).toBe(true);
  }
);

it("keeps a read-only Project's fields, item actions and draft editor non-editable", async () => {
  const readonly = { ...project, viewerCanUpdate: false };
  const status: GitHubProjectField = {
    ...field,
    id: "status",
    name: "Status",
    dataType: "singleSelect",
    options: [{ id: "todo", name: "Todo", color: "GRAY", description: "" }],
  };
  const detail: GitHubProjectDetail = {
    project: readonly,
    readme: "",
    fields: [field, status],
    views: ["table", "board", "roadmap"].map((layout, index) => ({
      id: layout,
      number: index + 1,
      name: layout,
      layout: layout as "table" | "board" | "roadmap",
      filter: "",
      visibleFieldIds: [field.id],
      groupByFieldIds: [status.id],
      verticalGroupByFieldIds: [],
    })),
    items: { items: [item], totalCount: 1, hasMore: false, endCursor: null },
  };
  native.invoke.mockImplementation(async (command: string) =>
    command === "github_list_personal_projects"
      ? { projects: [readonly], totalCount: 1, hasMore: false, endCursor: null }
      : detail
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  mount(
    <QueryClientProvider client={client}>
      <GitHubProjects />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Roadmap/ }));
  await screen.findByRole("button", { name: "Draft title" });
  expect(screen.queryByRole("button", { name: "workspace.projects.editField" })).toBeNull();
  expect(screen.queryByRole("button", { name: "workspace.projects.itemActions" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "board" }));
  expect(screen.queryByRole("button", { name: "workspace.projects.changeStatus" })).toBeNull();
  expect(screen.queryByRole("button", { name: "workspace.projects.itemActions" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "roadmap" }));
  expect(screen.queryByRole("button", { name: "workspace.projects.itemActions" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Draft title" }));
  const dialog = screen.getByRole("dialog");
  expect(
    (
      within(dialog).getByRole("textbox", {
        name: "workspace.projects.fields.title",
      }) as HTMLInputElement
    ).readOnly
  ).toBe(true);
  expect(within(dialog).queryByRole("button", { name: "common.save" })).toBeNull();
  await waitFor(() =>
    expect(
      native.invoke.mock.calls.every(
        ([command]) => command.startsWith("github_get_") || command.startsWith("github_list_")
      )
    ).toBe(true)
  );
});

it("guards pending archive/delete confirmations and recovers a failed Project deletion", async () => {
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
  const fixture = createProjectFixtures([repository], "fields", true);
  native.invoke.mockImplementation(async (command: string, args: Record<string, unknown> = {}) => {
    const result = fixture(command, args, false);
    if (result === undefined) throw new Error(`Unexpected Project test command: ${command}`);
    return result;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  mount(
    <QueryClientProvider client={client}>
      <GitHubProjects />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: /Workspace navigation and reading surfaces/ })
  );
  const table = await screen.findByRole("table");
  const firstTitle = "Workspace navigation and reading surfaces";
  await user.click(
    within(table).getAllByRole("button", { name: "workspace.projects.itemActions" })[0]
  );
  await user.click(screen.getByRole("menuitem", { name: "workspace.projects.archiveItem" }));
  let finishArchive!: () => void;
  native.invoke.mockImplementationOnce(
    (command: string, args: Record<string, unknown>) =>
      new Promise((resolve) => {
        finishArchive = () => resolve(fixture(command, args, false));
      })
  );
  const archiveDialog = screen.getByRole("alertdialog");
  const confirm = within(archiveDialog).getByRole("button", {
    name: "workspace.projects.itemAction.archive",
  });
  await user.click(confirm);
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(true));
  await user.keyboard("{Escape}");
  expect(archiveDialog.isConnected).toBe(true);
  await act(async () => {
    finishArchive();
  });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await waitFor(() => expect(within(table).queryByRole("button", { name: firstTitle })).toBeNull());
  const openDelete = async () => {
    await user.click(screen.getByRole("button", { name: "workspace.projects.projectActions" }));
    await user.click(screen.getByRole("menuitem", { name: "workspace.projects.deleteProject" }));
  };
  await openDelete();
  let failDelete!: () => void;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        failDelete = () => reject({ code: "preview", message: "Deletion failed" });
      })
  );
  const deleteDialog = screen.getByRole("alertdialog");
  const deleteButton = within(deleteDialog).getByRole("button", {
    name: "workspace.projects.deleteProject",
  });
  await user.click(deleteButton);
  await waitFor(() => expect((deleteButton as HTMLButtonElement).disabled).toBe(true));
  await user.keyboard("{Escape}");
  expect(deleteDialog.isConnected).toBe(true);
  await act(async () => {
    failDelete();
  });
  await screen.findByText("Deletion failed");
  await user.click(within(deleteDialog).getByRole("button", { name: "common.cancel" }));
  await openDelete();
  expect(screen.queryByText("Deletion failed")).toBeNull();
});
