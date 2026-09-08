// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { MainTitleBar } from "./main-title-bar";
import i18n from "@/i18n";
import { isTauri } from "@tauri-apps/api/core";

const nativeWindow = vi.hoisted(() => ({ toggleMaximize: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => nativeWindow }));

beforeEach(async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  nativeWindow.toggleMaximize.mockClear();
  localStorage.clear();
  await i18n.changeLanguage("en");
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
  cleanup();
  vi.unstubAllGlobals();
});

describe("title bar theme toggle", () => {
  it.each([false, true])(
    "toggles the visible system theme after an OS change: %s",
    async (changeAfterMount) => {
      let dark = !changeAfterMount;
      const listeners = new Set<() => void>();
      vi.stubGlobal("matchMedia", (query: string) => ({
        get matches() {
          return query.includes("color-scheme") && dark;
        },
        addEventListener: (_type: string, listener: () => void) => {
          if (query.includes("color-scheme")) listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener);
        },
      }));
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <TooltipProvider>
            <ThemeProvider defaultTheme="system" storageKey="tauri-ui-theme">
              <MainTitleBar />
            </ThemeProvider>
          </TooltipProvider>
        </QueryClientProvider>
      );
      if (changeAfterMount) {
        act(() => {
          dark = true;
          listeners.forEach((listener) => listener());
        });
      }
      await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
      await user.click(screen.getByRole("button", { name: "Open account menu" }));
      await user.click(screen.getByRole("menuitem", { name: "Toggle theme" }));
      await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
      expect(localStorage.getItem("tauri-ui-theme")).toBe("light");
    }
  );
});

it("keeps navigation toggle double-clicks out of the native window maximize handler", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const toggle = vi.fn();
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="light">
          <MainTitleBar onToggleNavigation={toggle} navigationExpanded />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
  // Enable the native click path after mounting, without invoking unrelated window setup.
  vi.mocked(isTauri).mockReturnValue(true);
  const navigationToggle = screen.getByRole("button", { name: "Collapse navigation" });
  await user.dblClick(navigationToggle);
  expect(toggle).toHaveBeenCalledTimes(2);
  expect(nativeWindow.toggleMaximize).not.toHaveBeenCalled();
  await user.dblClick(navigationToggle.closest("[data-tauri-drag-region]")!);
  expect(nativeWindow.toggleMaximize).toHaveBeenCalledTimes(1);
});
