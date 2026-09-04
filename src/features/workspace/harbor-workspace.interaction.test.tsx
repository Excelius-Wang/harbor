// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
    const { container, getByRole } = render(
      <TooltipProvider>
        <HarborWorkspace />
      </TooltipProvider>
    );

    fireEvent.click(getByRole("button", { name: "workspace.nav.gists" }));

    await waitFor(() => {
      expect(container.querySelector(".harbor-content")).not.toBeNull();
    });
    expect(getByRole("status", { name: "workspace.loading" }).getAttribute("aria-busy")).toBe(
      "true"
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(18);
    expect(container.querySelector('[data-slot="spinner"]')).toBeNull();
  });
});
