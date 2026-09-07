// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createPackageFixtures } from "@/dev/package-fixtures";
import { GitHubPackagesView } from "./github-packages-view";
import { githubQueryKeys } from "./github-queries";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));
let client: QueryClient;
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
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function setup(mode: string | null = null) {
  const fixture = createPackageFixtures(mode, true);
  native.invoke.mockImplementation(async (command, args) => fixture(command, args, false));
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubPackagesView />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /harbor-desktop/ }));
  await screen.findByRole("tab", { name: "workspace.packages.deletedVersions" });
  return { user, fixture };
}
it("restores a deleted version and retains the selected version tab until the user switches", async () => {
  const { user } = await setup();
  await user.click(screen.getByRole("tab", { name: "workspace.packages.deletedVersions" }));
  await user.click(await screen.findByRole("button", { name: "workspace.packages.restore" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "workspace.packages.restore",
    })
  );
  await screen.findByText("workspace.packages.noDeletedVersions");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await user.click(screen.getByRole("tab", { name: "workspace.packages.activeVersions" }));
  expect((await screen.findAllByText("1.2.0", { selector: "span" })).length).toBeGreaterThan(0);
});
it("retains confirmation after failure, retries and resets error on reopen", async () => {
  const { user } = await setup("retry");
  await user.click(screen.getAllByRole("button", { name: "workspace.packages.deleteVersion" })[0]);
  const dialog = screen.getByRole("alertdialog");
  const submit = within(dialog).getByRole("button", { name: "workspace.packages.deleteVersion" });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  await user.type(within(dialog).getByRole("textbox"), "harbor-desktop");
  await user.click(submit);
  await within(dialog).findByText("The package operation could not be completed. Please retry.");
  expect((within(dialog).getByRole("textbox") as HTMLInputElement).value).toBe("harbor-desktop");
  await user.click(submit);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await user.click(screen.getAllByRole("button", { name: "workspace.packages.deleteVersion" })[0]);
  expect(
    (within(screen.getByRole("alertdialog")).getByRole("textbox") as HTMLInputElement).value
  ).toBe("");
});
it("blocks dismissal and inputs while deletion is pending", async () => {
  const { user, fixture } = await setup();
  native.invoke.mockImplementation(async (command, args) =>
    command === "github_mutate_personal_package_version"
      ? new Promise(() => {})
      : fixture(command, args, false)
  );
  await user.click(screen.getAllByRole("button", { name: "workspace.packages.deleteVersion" })[0]);
  const dialog = screen.getByRole("alertdialog");
  await user.type(within(dialog).getByRole("textbox"), "harbor-desktop");
  await user.click(
    within(dialog).getByRole("button", { name: "workspace.packages.deleteVersion" })
  );
  for (const control of dialog.querySelectorAll("input,button"))
    expect((control as HTMLInputElement).disabled).toBe(true);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBe(dialog);
});
it("marks retained detail stale when only its refresh fails", async () => {
  const { user, fixture } = await setup();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "github_get_personal_package")
      throw { code: "preview", message: "Detail refresh failed" };
    return fixture(command, args, false);
  });
  await client.invalidateQueries({
    queryKey: githubQueryKeys.package({ packageType: "container", packageName: "harbor-desktop" }),
  });
  await screen.findByText("Detail refresh failed");
  expect(screen.getByRole("heading", { name: "harbor-desktop" })).toBeTruthy();
  native.invoke.mockImplementation(async (command, args) => fixture(command, args, false));
  await user.click(screen.getByRole("button", { name: "common.retry" }));
  await waitFor(() => expect(screen.queryByText("Detail refresh failed")).toBeNull());
});

it("marks an empty retained inventory stale after refresh failure", async () => {
  let fail = false;
  native.invoke.mockImplementation(async () => {
    if (fail) throw { code: "preview", message: "Inventory refresh failed" };
    return { packages: [], page: 1, hasMore: false, hasPrevious: false };
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubPackagesView />
      </TooltipProvider>
    </QueryClientProvider>
  );
  await screen.findByText("workspace.packages.emptyTitle");
  fail = true;
  await userEvent.setup().click(screen.getByRole("button", { name: "common.refresh" }));
  await screen.findByText("Inventory refresh failed");
  expect(screen.getByText("workspace.packages.emptyTitle")).toBeTruthy();
});

it.each(["loading", "error"])("returns to the retained list from %s detail", async (state) => {
  const fixture = createPackageFixtures(null, true);
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "github_get_personal_package") {
      if (state === "loading") return new Promise(() => {});
      throw { code: "preview", message: "Detail unavailable" };
    }
    return fixture(command, args, false);
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <GitHubPackagesView />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /harbor-desktop/ }));
  if (state === "error") await screen.findByText("Detail unavailable");
  await user.click(await screen.findByRole("button", { name: "workspace.packages.back" }));
  expect(
    screen.getByRole("button", { name: /harbor-desktop/ }).closest("aside")?.className
  ).not.toContain("hidden");
});
