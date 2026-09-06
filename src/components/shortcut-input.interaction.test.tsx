// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { ShortcutInput } from "./shortcut-input";

beforeEach(async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shortcut capture keyboard access", () => {
  it("lets Tab leave the capture and reach the clear action", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <button>Before</button>
        <ShortcutInput value="Cmd+Shift+H" onChange={onChange} />
        <button>After</button>
      </TooltipProvider>
    );
    const capture = screen.getByRole("button", { name: "Show Main Window" });
    capture.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }));
    await user.tab();
    expect(document.activeElement).toBe(capture);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Clear shortcut" }));
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }));
  });

  it("still captures a complete modified shortcut and supports deleting it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutInput onChange={onChange} />);
    screen.getByRole("button", { name: "Show Main Window" }).focus();
    await user.keyboard("{Control>}{Shift>}h{/Shift}{/Control}");
    expect(onChange).toHaveBeenCalledWith("Ctrl+Shift+H");
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
