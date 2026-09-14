// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { toast, type Action } from "sonner";
import type { MouseEvent } from "react";
import { registerShortcut } from "@/lib/shortcut";
import { openSettingsWindow, toggleWindow } from "@/lib/window";
import i18n from "@/i18n";
import HomePage from "./home";
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@/lib/shortcut", () => ({ registerShortcut: vi.fn() }));
vi.mock("@/lib/window", () => ({
  toggleWindow: vi.fn(),
  openSettingsWindow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/workspace/harbor-workspace", () => ({ HarborWorkspace: () => null }));
vi.mock("@/components/updater-dialog", () => ({ UpdaterDialog: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));
beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("global-shortcut-show-main", "Ctrl+Cmd+K");
  await i18n.changeLanguage("en");
});
afterEach(cleanup);
it("reports failed restoration from main and provides a settings action", async () => {
  vi.mocked(registerShortcut).mockResolvedValue(false);
  render(<HomePage />);
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  const options = vi.mocked(toast.error).mock.calls[0][1]!;
  expect(options.id).toBe("shortcut-restore");
  const action = options.action as Action;
  action.onClick({} as MouseEvent<HTMLButtonElement>);
  expect(openSettingsWindow).toHaveBeenCalledWith("Settings");
  expect(localStorage.getItem("global-shortcut-show-main")).toBe("Ctrl+Cmd+K");
});
it("does not report an obsolete restore failure after the saved shortcut changes", async () => {
  let finish!: (value: boolean) => void;
  vi.mocked(registerShortcut).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render(<HomePage />);
  localStorage.setItem("global-shortcut-show-main", "Ctrl+Shift+K");
  finish(false);
  await Promise.resolve();
  expect(toast.error).not.toHaveBeenCalled();
});
it("clears prior restore feedback when registration succeeds", async () => {
  vi.mocked(registerShortcut).mockResolvedValue(true);
  render(<HomePage />);
  await waitFor(() => expect(toast.dismiss).toHaveBeenCalledWith("shortcut-restore"));
  expect(toast.error).not.toHaveBeenCalled();
});

it("clears restoration feedback when settings clears the shortcut", async () => {
  vi.mocked(registerShortcut).mockResolvedValue(false);
  render(<HomePage />);
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  localStorage.removeItem("global-shortcut-show-main");
  const handler = vi.mocked(listen).mock.calls.find(([name]) => name === "shortcut-changed")![1];
  await handler({ event: "shortcut-changed", id: 1, payload: { shortcut: "" } });
  expect(toast.dismiss).toHaveBeenCalledWith("shortcut-restore");
});

it("uses settings restoration results without registering a second time", async () => {
  vi.mocked(registerShortcut).mockResolvedValue(false);
  render(<HomePage />);
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  const handler = vi.mocked(listen).mock.calls.find(([name]) => name === "shortcut-changed")![1];
  await handler({
    event: "shortcut-changed",
    id: 1,
    payload: { shortcut: "Ctrl+Cmd+K", restored: true },
  });
  expect(registerShortcut).toHaveBeenCalledTimes(1);
  expect(toast.dismiss).toHaveBeenCalledWith("shortcut-restore");
  await handler({
    event: "shortcut-changed",
    id: 1,
    payload: { shortcut: "Ctrl+Cmd+K", restored: false },
  });
  expect(toast.error).toHaveBeenCalledTimes(2);
});

it("handles native pressed events in main and catches toggle failures", async () => {
  vi.mocked(registerShortcut).mockResolvedValue(true);
  vi.mocked(toggleWindow)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Window unavailable"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<HomePage />);
    const handler = vi.mocked(listen).mock.calls.find(([name]) => name === "shortcut-pressed")![1];
    await handler({ event: "shortcut-pressed", id: 1, payload: null });
    expect(toggleWindow).toHaveBeenCalledWith("main");
    await handler({ event: "shortcut-pressed", id: 2, payload: null });
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Failed to toggle main window:", expect.any(Error))
    );
  } finally {
    error.mockRestore();
  }
});
