// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowFrame } from "./window-frame";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

afterEach(() => cleanup());

describe("WindowFrame", () => {
  it("uses the shared glass window surface by default", () => {
    render(<WindowFrame titleBar={<header>Title</header>}>Content</WindowFrame>);

    const frame = screen.getByRole("main").parentElement;

    expect(frame?.className).toContain("harbor-window");
    expect(frame?.className).not.toContain("bg-background");
  });
});
