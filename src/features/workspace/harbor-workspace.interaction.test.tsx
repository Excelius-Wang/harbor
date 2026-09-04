// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  GitHubGists: () => null,
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

afterEach(cleanup);

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
});
