// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";

const nativeWindow = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  setTheme: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: nativeWindow.invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => nativeWindow,
}));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ThemeProvider", () => {
  it.each(["light", "dark"] as const)(
    "uses background-responsive vibrancy for %s appearance",
    async (theme) => {
      render(
        <ThemeProvider defaultTheme={theme} storageKey="test-theme">
          <span>Harbor</span>
        </ThemeProvider>
      );

      expect(document.documentElement.classList.contains(theme)).toBe(true);
      await waitFor(() => expect(nativeWindow.setTheme).toHaveBeenCalledWith(theme));
      expect(nativeWindow.invoke).toHaveBeenCalledWith("sync_window_vibrancy", { enabled: true });
    }
  );
  it("removes and restores native vibrancy when reduced transparency changes", async () => {
    let reduced = true;
    let notify: (() => void) | undefined;
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          get matches() {
            return query.includes("reduced-transparency") && reduced;
          },
          addEventListener: (_event: string, listener: () => void) => {
            if (query.includes("reduced-transparency")) notify = listener;
          },
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
    render(
      <ThemeProvider defaultTheme="dark">
        <span>Harbor</span>
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(nativeWindow.invoke).toHaveBeenLastCalledWith("sync_window_vibrancy", {
        enabled: false,
      })
    );
    reduced = false;
    notify?.();
    await waitFor(() =>
      expect(nativeWindow.invoke).toHaveBeenLastCalledWith("sync_window_vibrancy", {
        enabled: true,
      })
    );
  });
});
