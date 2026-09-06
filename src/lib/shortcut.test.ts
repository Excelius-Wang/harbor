import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { registerShortcut, unregisterShortcut } from "./shortcut";

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  isRegistered: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  unregisterAll: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isRegistered).mockImplementation(async (value) => value === "Ctrl+Shift+H");
  vi.mocked(register).mockResolvedValue(undefined);
  vi.mocked(unregister).mockResolvedValue(undefined);
});

describe("shortcut registration results", () => {
  it("retains the existing shortcut when a replacement cannot register", async () => {
    vi.mocked(register).mockRejectedValue(new Error("Shortcut unavailable"));
    expect(await registerShortcut("Ctrl+Shift+K", vi.fn(), "Ctrl+Shift+H")).toBe(false);
    expect(unregister).not.toHaveBeenCalled();
  });

  it("removes the old shortcut only after its replacement registers", async () => {
    expect(await registerShortcut("Ctrl+Shift+K", vi.fn(), "Ctrl+Shift+H")).toBe(true);
    expect(unregister).toHaveBeenCalledWith("Ctrl+Shift+H");
    expect(vi.mocked(register).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(unregister).mock.invocationCallOrder[0]
    );
  });

  it("reports a failed clear instead of silently claiming success", async () => {
    vi.mocked(unregister).mockRejectedValue(new Error("Shortcut unavailable"));
    expect(await unregisterShortcut("Ctrl+Shift+H")).toBe(false);
  });
});
