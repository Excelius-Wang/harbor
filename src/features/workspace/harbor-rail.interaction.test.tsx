// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HarborRail } from "./harbor-rail";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("HarborRail", () => {
  it("stays out of the workspace when there is no repository context", () => {
    render(
      <TooltipProvider>
        <HarborRail selectedRepository={null} activeView="harbor" onViewChange={() => {}} />
      </TooltipProvider>
    );

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("shows only contextual repository tools", () => {
    render(
      <TooltipProvider>
        <HarborRail
          selectedRepository={{ owner: "octocat", name: "hello-world" }}
          activeView="harbor"
          onViewChange={() => {}}
        />
      </TooltipProvider>
    );

    const rail = screen.getByRole("complementary", { name: "workspace.harborRail" });

    expect(rail.classList.contains("harbor-pane")).toBe(true);
    expect(rail.classList.contains("harbor-glass")).toBe(false);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByText("HARBOR")).toBeNull();
  });
});
