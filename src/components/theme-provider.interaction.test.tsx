// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";

const nativeWindow = vi.hoisted(() => ({
  setEffects: vi.fn().mockResolvedValue(undefined),
  setTheme: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({
  Effect: {
    HudWindow: "hudWindow",
    UnderWindowBackground: "underWindowBackground",
  },
  EffectState: { FollowsWindowActiveState: "followsWindowActiveState" },
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
  it("keeps the native vibrancy appearance in sync with the app theme", async () => {
    render(
      <ThemeProvider defaultTheme="dark" storageKey="test-theme">
        <span>Harbor</span>
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await waitFor(() => expect(nativeWindow.setTheme).toHaveBeenCalledWith("dark"));
    expect(nativeWindow.setEffects).toHaveBeenCalledWith({
      effects: ["hudWindow"],
      state: "followsWindowActiveState",
      radius: 10,
    });
  });
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
      expect(nativeWindow.setEffects).toHaveBeenLastCalledWith({
        effects: [],
        state: "followsWindowActiveState",
        radius: 10,
      })
    );
    reduced = false;
    notify?.();
    await waitFor(() =>
      expect(nativeWindow.setEffects).toHaveBeenLastCalledWith({
        effects: ["hudWindow"],
        state: "followsWindowActiveState",
        radius: 10,
      })
    );
  });
});
