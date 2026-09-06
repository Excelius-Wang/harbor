// @vitest-environment jsdom

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitHubRepository, GitHubRepositoryRelationship } from "./github-data";
import { githubQueryKeys } from "./github-queries";
import { GitHubRepositoryCreateDialog } from "./github-repository-create-dialog";
import { GitHubRepositoryRelationshipActions } from "./github-repository-relationship-actions";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const repository: GitHubRepository = {
  id: 1,
  owner: "octocat",
  name: "harbor",
  fullName: "octocat/harbor",
  url: "https://github.com/octocat/harbor",
  stars: 42,
  forks: 3,
  openIssues: 1,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};
const relationship: GitHubRepositoryRelationship = {
  starred: false,
  watchLevel: "participating",
  viewerLogin: "viewer",
  viewerOwnsRepository: false,
};
const options = {
  gitignoreTemplates: ["Node", "Rust"],
  licenses: [{ key: "mit", name: "MIT License" }],
};
const clients: QueryClient[] = [];
const overrides = new Map<string, () => Promise<unknown>>();
const created = vi.fn();

beforeEach(() => {
  overrides.clear();
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
  native.invoke.mockImplementation(async (command: string) => {
    const override = overrides.get(command);
    if (override) return override();
    if (command === "github_get_repository_creation_options") return options;
    if (command === "github_get_repository_relationship") return relationship;
    throw { code: "preview", message: "Request failed" };
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mount(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrap = (content: ReactNode) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>{content}</TooltipProvider>
    </QueryClientProvider>
  );
  const result = render(wrap(children));
  return { client, rerender: (content: ReactNode) => result.rerender(wrap(content)) };
}
function CreateHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open create</button>
      <GitHubRepositoryCreateDialog open={open} onOpenChange={setOpen} onCreated={created} />
    </>
  );
}
function defer(command: string) {
  let resolve!: (value: unknown) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  overrides.set(command, () => promise);
  return { resolve, reject };
}

it("names template/visibility controls and retains chosen options after a failed refresh", async () => {
  const { client } = mount(<CreateHarness />);
  const user = userEvent.setup();
  const gitignore = await screen.findByRole("combobox", {
    name: "workspace.repositories.settings.gitignore",
  });
  await waitFor(() => expect((gitignore as HTMLButtonElement).disabled).toBe(false));
  expect(
    screen.getByRole("combobox", { name: "workspace.repositories.settings.license" })
  ).toBeTruthy();
  expect(
    screen.getByRole("radiogroup", { name: "workspace.repositories.settings.visibility" })
  ).toBeTruthy();
  await user.click(gitignore);
  await user.click(await screen.findByRole("option", { name: "Rust" }));
  overrides.set("github_get_repository_creation_options", async () => {
    throw { code: "preview", message: "Templates unavailable" };
  });
  await act(async () => {
    await client.invalidateQueries({ queryKey: githubQueryKeys.repositoryCreationOptions });
  });
  expect(await screen.findByText("common.staleResults")).toBeTruthy();
  expect(gitignore.textContent).toContain("Rust");
  overrides.delete("github_get_repository_creation_options");
  await user.click(screen.getByRole("button", { name: "common.retry" }));
  await waitFor(() => expect(screen.queryByText("common.staleResults")).toBeNull());
  expect(gitignore.textContent).toContain("Rust");
});

it("allows creation without optional templates and locks inputs, dismissal and duplicate submits while pending", async () => {
  overrides.set("github_get_repository_creation_options", async () => {
    throw { code: "preview", message: "Templates unavailable" };
  });
  const pending = defer("github_create_personal_repository");
  mount(<CreateHarness />);
  const user = userEvent.setup();
  await screen.findByText("workspace.repositories.settings.templatesLoadFailed");
  const name = screen.getByRole("textbox", { name: "workspace.repositories.settings.name" });
  await user.type(name, "my-harbor");
  await user.click(screen.getByRole("button", { name: "workspace.repositories.settings.create" }));
  await waitFor(() => expect((name as HTMLInputElement).disabled).toBe(true));
  const dialog = screen.getByRole("dialog");
  for (const control of dialog.querySelectorAll("input,button"))
    expect((control as HTMLInputElement).disabled).toBe(true);
  await user.keyboard("{Escape}");
  expect(dialog.isConnected).toBe(true);
  fireEvent.submit(name.closest("form")!);
  expect(
    native.invoke.mock.calls.filter(([command]) => command === "github_create_personal_repository")
  ).toHaveLength(1);
  await act(async () => {
    pending.reject({ code: "preview", message: "Creation failed" });
  });
  expect(await screen.findByText("Creation failed")).toBeTruthy();
  expect((name as HTMLInputElement).value).toBe("my-harbor");
  await user.click(screen.getByRole("button", { name: "common.cancel" }));
  await user.click(screen.getByRole("button", { name: "Open create" }));
  expect(screen.queryByText("Creation failed")).toBeNull();
  expect(
    (
      screen.getByRole("textbox", {
        name: "workspace.repositories.settings.name",
      }) as HTMLInputElement
    ).value
  ).toBe("");
});

it("retains the open fork dialog and draft when relationship refresh fails", async () => {
  const { client } = mount(<GitHubRepositoryRelationshipActions repository={repository} />);
  const user = userEvent.setup();
  const fork = await screen.findByRole("button", { name: /workspace.repositories.forkAction/ });
  await waitFor(() => expect((fork as HTMLButtonElement).disabled).toBe(false));
  await user.click(fork);
  const name = screen.getByRole("textbox", { name: "workspace.repositories.forkName" });
  await user.clear(name);
  await user.type(name, "my-copy");
  overrides.set("github_get_repository_relationship", async () => {
    throw { code: "preview", message: "Relationship unavailable" };
  });
  await act(async () => {
    await client.invalidateQueries();
  });
  await screen.findByText("common.staleRetry");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect((name as HTMLInputElement).value).toBe("my-copy");
  await user.keyboard("{Escape}");
  const retry = await screen.findByRole("button", { name: "common.staleRetry" });
  overrides.delete("github_get_repository_relationship");
  await user.click(retry);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "common.staleRetry" })).toBeNull()
  );
});

it("keeps fork inputs and dismissal locked while pending, then preserves the draft with an inline failure", async () => {
  const pending = defer("github_fork_repository");
  mount(<GitHubRepositoryRelationshipActions repository={repository} />);
  const user = userEvent.setup();
  const fork = await screen.findByRole("button", { name: /workspace.repositories.forkAction/ });
  await waitFor(() => expect((fork as HTMLButtonElement).disabled).toBe(false));
  await user.click(fork);
  const name = screen.getByRole("textbox", { name: "workspace.repositories.forkName" });
  await user.clear(name);
  await user.type(name, "my-copy");
  await user.click(screen.getByRole("button", { name: "workspace.repositories.createFork" }));
  await waitFor(() => expect((name as HTMLInputElement).disabled).toBe(true));
  expect((screen.getByRole("checkbox") as HTMLButtonElement).disabled).toBe(true);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => {
    pending.reject({ code: "preview", message: "Fork failed" });
  });
  expect(await within(screen.getByRole("dialog")).findByText("Fork failed")).toBeTruthy();
  expect((name as HTMLInputElement).value).toBe("my-copy");
  await user.click(screen.getByRole("button", { name: "common.cancel" }));
  await user.click(fork);
  expect(screen.queryByText("Fork failed")).toBeNull();
});

it("restores the visible star count after a failed write", async () => {
  mount(<GitHubRepositoryRelationshipActions repository={repository} />);
  const star = await screen.findByRole("button", { pressed: false });
  await waitFor(() => expect((star as HTMLButtonElement).disabled).toBe(false));
  await userEvent.setup().click(star);
  await waitFor(() => expect((star as HTMLButtonElement).disabled).toBe(false));
  expect(star.textContent).toContain("42");
});

it("reconciles a pending star to its original repository after switching repositories", async () => {
  const pending = defer("github_update_repository_star");
  const { client, rerender } = mount(
    <GitHubRepositoryRelationshipActions repository={repository} />
  );
  const star = await screen.findByRole("button", { pressed: false });
  await waitFor(() => expect((star as HTMLButtonElement).disabled).toBe(false));
  await userEvent.setup().click(star);
  const other = { ...repository, id: 2, name: "other", fullName: "octocat/other" };
  rerender(<GitHubRepositoryRelationshipActions repository={other} />);
  await waitFor(() =>
    expect(
      client.getQueryData(
        githubQueryKeys.repositoryRelationship({ owner: other.owner, repository: other.name })
      )
    ).toEqual(relationship)
  );
  await act(async () => {
    pending.resolve({ ...relationship, starred: true });
  });
  await waitFor(() =>
    expect(
      client.getQueryData(
        githubQueryKeys.repositoryRelationship({
          owner: repository.owner,
          repository: repository.name,
        })
      )
    ).toEqual({ ...relationship, starred: true })
  );
  expect(
    client.getQueryData(
      githubQueryKeys.repositoryRelationship({ owner: other.owner, repository: other.name })
    )
  ).toEqual(relationship);
});
