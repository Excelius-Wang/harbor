// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GitHubDiscoveryView } from "./github-discovery-view";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => cleanup());

describe("GitHub discovery navigation", () => {
  it("keeps overflow available without showing native scrollbars", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GitHubDiscoveryView onSelectRepository={() => {}} />
      </QueryClientProvider>
    );

    const tabList = screen.getByRole("tablist");
    const activeTab = screen.getByRole("tab", { name: "workspace.discovery.tabs.feed" });
    const feedWindow = screen.getByText("workspace.discovery.feedWindow");

    expect(tabList.closest("section")?.className).toContain("harbor-content");
    expect(tabList.className).toContain("scrollbar-none");
    expect(tabList.className).toContain("overflow-x-auto");
    expect(tabList.className).toContain("overflow-y-hidden");
    expect(activeTab.className).toContain("after:bottom-0!");
    expect(feedWindow.className).toContain("min-[1240px]:block");
    expect(feedWindow.className).not.toContain("min-[900px]:block");
  });
});
