// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const lazyModuleState = vi.hoisted(() => ({
  suspendGists: false,
  pending: new Promise<never>(() => {}),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/main-title-bar", () => ({
  MainTitleBar: () => null,
}));
vi.mock("@/components/window-frame", () => ({
  WindowFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
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

afterEach(() => {
  lazyModuleState.suspendGists = false;
  cleanup();
});

describe("HarborWorkspace navigation", () => {
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

    await user.click(getByRole("button", { name: "workspace.nav.more" }));
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

    await user.click(getByRole("button", { name: "workspace.nav.more" }));

    expect(await findByRole("menuitem", { name: "workspace.nav.projects" })).toBeTruthy();
    expect(getByRole("menuitem", { name: "workspace.nav.gists" })).toBeTruthy();
    expect(getByRole("menuitem", { name: "workspace.nav.packages" })).toBeTruthy();
  });
});
