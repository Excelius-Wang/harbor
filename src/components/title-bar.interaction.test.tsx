// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauriWindow = vi.hoisted(() => ({
  close: vi.fn().mockResolvedValue(undefined),
  isMaximized: vi.fn().mockResolvedValue(false),
  label: "main",
  minimize: vi.fn().mockResolvedValue(undefined),
  onResized: vi.fn().mockResolvedValue(vi.fn()),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => tauriWindow,
}));

import { TitleBar } from "./title-bar";

beforeEach(() => {
  vi.clearAllMocks();
  tauriWindow.isMaximized.mockResolvedValue(false);
  tauriWindow.onResized.mockResolvedValue(vi.fn());
});

afterEach(() => cleanup());

describe("TitleBar window controls", () => {
  it("places macOS-style controls before the draggable title content", () => {
    render(<TitleBar leftActions={<span>Harbor</span>} />);

    const controls = screen.getByRole("group", { name: "Window controls" });
    expect(
      within(controls)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Close", "Minimize", "Maximize"]);
    expect(controls.compareDocumentPosition(screen.getByText("Harbor"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(controls.className).toContain("harbor-traffic-lights");
  });

  it("keeps the Tauri window actions functional", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Minimize" }));
    await user.click(screen.getByRole("button", { name: "Maximize" }));

    expect(tauriWindow.close).toHaveBeenCalledOnce();
    expect(tauriWindow.minimize).toHaveBeenCalledOnce();
    expect(tauriWindow.toggleMaximize).toHaveBeenCalledOnce();
  });

  it("shows restore when the window is maximized and honors hidden controls", async () => {
    tauriWindow.isMaximized.mockResolvedValue(true);
    const { rerender } = render(<TitleBar />);

    expect(await screen.findByRole("button", { name: "Restore" })).toBeTruthy();

    rerender(<TitleBar showMinimize={false} showMaximize={false} />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Minimize" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});
