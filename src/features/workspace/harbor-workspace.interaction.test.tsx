// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const lazyModuleState = vi.hoisted(() => ({
  suspendGists: false,
  pending: new Promise<never>(() => {}),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/main-title-bar", () => ({
  MainTitleBar: ({
    navigationExpanded,
    onToggleNavigation,
  }: {
    navigationExpanded: boolean;
    onToggleNavigation: () => void;
  }) => (
    <button
      aria-label="Toggle navigation"
      aria-expanded={navigationExpanded}
      onClick={onToggleNavigation}
    />
  ),
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/window-frame", () => ({
  WindowFrame: ({
    children,
    titleBar,
    contentClassName,
  }: {
    children: ReactNode;
    titleBar: ReactNode;
    contentClassName?: string;
  }) => (
    <>
      <header>{titleBar}</header>
      <main className={contentClassName}>{children}</main>
    </>
  ),
}));
vi.mock("@/features/github/github-discovery-view", () => ({
  GitHubDiscoveryView: () => null,
}));
vi.mock("@/features/github/github-gist-view", () => ({
  GitHubGists: () => {
    if (lazyModuleState.suspendGists) throw lazyModuleState.pending;
    return null;
  },
}));
vi.mock("@/features/github/github-issue-inbox", () => ({
  GitHubIssueInbox: () => null,
}));
vi.mock("@/features/github/github-notifications", () => ({
  GitHubNotifications: () => null,
}));
vi.mock("@/features/github/github-packages-view", () => ({
  GitHubPackagesView: () => null,
}));
vi.mock("@/features/github/github-profile-view", () => ({
  GitHubProfileView: () => null,
}));
vi.mock("@/features/github/github-project-view", () => ({
  GitHubProjects: () => null,
}));
vi.mock("@/features/github/github-pull-request-inbox", () => ({
  GitHubPullRequestInbox: () => null,
}));
vi.mock("@/features/github/github-repository-browser", () => ({
  GitHubRepositoryBrowser: () => null,
}));
vi.mock("./harbor-rail", () => ({
  HarborRail: () => null,
}));

import { HarborWorkspace } from "./harbor-workspace";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  lazyModuleState.suspendGists = false;
  cleanup();
});

describe("HarborWorkspace navigation", () => {
  it("places the workspace directly on the outer window plane", () => {
    const { container } = render(
      <TooltipProvider>
        <HarborWorkspace />
      </TooltipProvider>
    );
    const workspace = container.querySelector(".harbor-workspace-shell");

    expect(workspace).not.toBeNull();
    expect(workspace?.classList.contains("border")).toBe(false);
    expect(workspace?.classList.contains("rounded-[10px]")).toBe(false);
    expect(workspace?.classList.contains("mx-3")).toBe(false);
  });

  it("keeps the primary navigation on the workspace acrylic plane", () => {
    const { container } = render(
      <TooltipProvider>
        <HarborWorkspace />
      </TooltipProvider>
    );
    const primaryNavigation = container.querySelector(".harbor-primary-nav");

    expect(primaryNavigation?.classList.contains("harbor-pane")).toBe(true);
    expect(primaryNavigation?.classList.contains("harbor-glass")).toBe(false);
  });

  it("keeps the inset separator inside the primary navigation", () => {
    const { container } = render(
      <TooltipProvider>
        <HarborWorkspace />
      </TooltipProvider>
    );
    const separator = container.querySelector('[data-slot="separator"]');

    expect(separator?.className.split(" ")).toContain("data-[orientation=horizontal]:w-auto!");
  });

  it("keeps the content surface and page structure while a lazy module loads", async () => {
    lazyModuleState.suspendGists = true;
    const user = userEvent.setup();
    const { container, findByRole, getByRole } = render(
      <TooltipProvider>
        <HarborWorkspace />
      </TooltipProvider>
    );

    await user.click(getByRole("button", { name: /^workspace.nav.more/ }));
    await user.click(await findByRole("menuitem", { name: "workspace.nav.gists" }));

    await waitFor(() => {
      expect(container.querySelector(".harbor-content")).not.toBeNull();
    });
    expect(getByRole("status", { name: "workspace.loading" }).getAttribute("aria-busy")).toBe(
      "true"
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(18);
    expect(container.querySelector('[data-slot="spinner"]')).toBeNull();
  });

  it("keeps secondary destinations in one More menu", async () => {
    const user = userEvent.setup();
    const { findByRole, getByRole, queryByRole } = render(
      <TooltipProvider>
        <HarborWorkspace />
      </TooltipProvider>
    );

    expect(queryByRole("button", { name: "workspace.nav.projects" })).toBeNull();
    expect(queryByRole("button", { name: "workspace.nav.gists" })).toBeNull();
    expect(queryByRole("button", { name: "workspace.nav.packages" })).toBeNull();

    await user.click(getByRole("button", { name: /^workspace.nav.more/ }));

    expect(await findByRole("menuitem", { name: "workspace.nav.projects" })).toBeTruthy();
    expect(getByRole("menuitem", { name: "workspace.nav.gists" })).toBeTruthy();
    expect(getByRole("menuitem", { name: "workspace.nav.packages" })).toBeTruthy();
  });
});

it("shows labels initially and preserves the navigation choice across remounts", async () => {
  const user = userEvent.setup();
  const view = render(
    <TooltipProvider>
      <HarborWorkspace />
    </TooltipProvider>
  );
  const toggle = view.getByRole("button", { name: "Toggle navigation" });
  const navigation = view.container.querySelector(".harbor-primary-nav");
  expect(navigation?.getAttribute("data-expanded")).toBe("true");
  await user.click(view.getByRole("button", { name: "workspace.nav.issues" }));
  await user.click(toggle);
  expect(navigation?.getAttribute("data-expanded")).toBe("false");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(
    view.getByRole("button", { name: "workspace.nav.issues" }).getAttribute("aria-current")
  ).toBe("page");
  expect(localStorage.getItem("harbor-navigation-expanded")).toBe("false");
  view.unmount();
  const restored = render(
    <TooltipProvider>
      <HarborWorkspace />
    </TooltipProvider>
  );
  const restoredToggle = restored.getByRole("button", { name: "Toggle navigation" });
  expect(restoredToggle.getAttribute("aria-expanded")).toBe("false");
  restoredToggle.focus();
  await user.keyboard("{Enter}");
  expect(restoredToggle.getAttribute("aria-expanded")).toBe("true");
});

it("keeps toggling usable when preference storage is unavailable", async () => {
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  try {
    const view = render(
      <TooltipProvider>
        <HarborWorkspace />
      </TooltipProvider>
    );
    const toggle = view.getByRole("button", { name: "Toggle navigation" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await userEvent.setup().click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});
