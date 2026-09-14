import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { convertToShortcut, registerShortcut, unregisterShortcut } from "./shortcut";

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
    expect(await registerShortcut("Ctrl+Shift+K", "Ctrl+Shift+H")).toBe(false);
    expect(unregister).not.toHaveBeenCalled();
  });

  it("removes the old shortcut only after its replacement registers", async () => {
    expect(await registerShortcut("Ctrl+Shift+K", "Ctrl+Shift+H")).toBe(true);
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

it.each([
  [{ ctrlKey: true }, "Ctrl+K"],
  [{ metaKey: true }, "Cmd+K"],
  [{ ctrlKey: true, metaKey: true }, "Ctrl+Cmd+K"],
  [{ ctrlKey: true, metaKey: true, altKey: true, shiftKey: true }, "Ctrl+Cmd+Alt+Shift+K"],
])("retains every pressed modifier: %j", (modifiers, expected) => {
  expect(convertToShortcut({ key: "k", ...modifiers } as KeyboardEvent)).toBe(expected);
});

it("keeps an already registered shortcut without replacing its native handler", async () => {
  expect(await registerShortcut("Ctrl+Shift+H")).toBe(true);
  expect(register).not.toHaveBeenCalled();
  expect(unregister).not.toHaveBeenCalled();
});
it("accepts concurrent restoration only when the app now owns the shortcut", async () => {
  vi.mocked(isRegistered).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  vi.mocked(register).mockRejectedValue(new Error("Already registered"));
  expect(await registerShortcut("Ctrl+Cmd+K")).toBe(true);
});

it.each(["existing", "concurrent", "created"])(
  "rolls back only a registration created by this call: %s",
  async (owner) => {
    const current = new Set(["Ctrl+Shift+H"]);
    if (owner === "existing") current.add("Ctrl+Cmd+K");
    vi.mocked(isRegistered).mockImplementation(async (value) => current.has(value));
    vi.mocked(register).mockImplementation(async () => {
      current.add("Ctrl+Cmd+K");
      if (owner === "concurrent") throw new Error("Already restored elsewhere");
    });
    vi.mocked(unregister).mockImplementation(async (value) => {
      if (value === "Ctrl+Shift+H") throw new Error("Cannot remove old shortcut");
      current.delete(value as string);
    });
    expect(await registerShortcut("Ctrl+Cmd+K", "Ctrl+Shift+H")).toBe(false);
    expect(current.has("Ctrl+Shift+H")).toBe(true);
    expect(current.has("Ctrl+Cmd+K")).toBe(owner !== "created");
  }
);
