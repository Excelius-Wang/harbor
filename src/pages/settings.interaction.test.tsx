// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import SettingsPage from "./settings";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shortcut", async () => ({
  ...(await vi.importActual<typeof import("@/lib/shortcut")>("@/lib/shortcut")),
  registerShortcut: vi.fn(),
  unregisterShortcut: vi.fn(),
}));

beforeEach(async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.mocked(registerShortcut).mockReset().mockResolvedValue(true);
  vi.mocked(unregisterShortcut).mockReset().mockResolvedValue(true);
  localStorage.clear();
  localStorage.setItem("tauri-ui-theme", "dark");
  await i18n.changeLanguage("en");
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("settings appearance", () => {
  it("updates the WindowFrame theme and persists the selected mode", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SettingsPage />
      </TooltipProvider>
    );
    await user.click(screen.getByRole("button", { name: "Light" }));
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    expect(localStorage.getItem("tauri-ui-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Dark" }));
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(localStorage.getItem("tauri-ui-theme")).toBe("dark");
  });
});

it("retains the saved shortcut when registration fails", async () => {
  localStorage.setItem("global-shortcut-show-main", "Ctrl+Shift+H");
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <SettingsPage />
    </TooltipProvider>
  );
  await user.click(screen.getByRole("button", { name: "Shortcuts" }));
  vi.mocked(registerShortcut).mockResolvedValue(false);
  const capture = screen.getByRole("button", { name: /^Show Main Window/ });
  capture.focus();
  await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(capture.querySelector("kbd")?.textContent).toBe("Ctrl+Shift+H");
  expect(localStorage.getItem("global-shortcut-show-main")).toBe("Ctrl+Shift+H");
});

it("disables capture during registration and saves only its successful result", async () => {
  let finish!: (success: boolean) => void;
  vi.mocked(registerShortcut).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <SettingsPage />
    </TooltipProvider>
  );
  await user.click(screen.getByRole("button", { name: "Shortcuts" }));
  const capture = screen.getByRole("button", { name: /^Show Main Window/ });
  capture.focus();
  await user.keyboard("{Control>}{Shift>}h{/Shift}{/Control}");
  await waitFor(() => expect((capture as HTMLButtonElement).disabled).toBe(true));
  expect(localStorage.getItem("global-shortcut-show-main")).toBeNull();
  finish(true);
  await waitFor(() =>
    expect(localStorage.getItem("global-shortcut-show-main")).toBe("Ctrl+Shift+H")
  );
  expect(capture.querySelector("kbd")?.textContent).toBe("Ctrl+Shift+H");
});
