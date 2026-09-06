// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HarborRail } from "./harbor-rail";
import userEvent from "@testing-library/user-event";
import { invoke, isTauri } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(isTauri).mockReturnValue(false);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

it.each(["answer", "error"])("ignores a late %s from the previous repository", async (kind) => {
  vi.mocked(isTauri).mockReturnValue(true);
  let finishOld!: (answer: unknown) => void;
  let failOld!: (error: unknown) => void;
  let finishNew!: (answer: unknown) => void;
  vi.mocked(invoke)
    .mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finishOld = resolve;
          failOld = reject;
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNew = resolve;
        })
    );
  const user = userEvent.setup();
  const view = (name: string) => (
    <TooltipProvider>
      <HarborRail
        selectedRepository={{ owner: "octocat", name }}
        activeView="harbor"
        onViewChange={() => {}}
      />
    </TooltipProvider>
  );
  const { rerender } = render(view("first"));
  await user.click(screen.getByRole("button", { name: "workspace.rail.harbor" }));
  await user.type(screen.getByRole("textbox"), "First question");
  await user.click(screen.getByRole("button", { name: "workspace.agent.send" }));
  rerender(view("second"));
  await user.type(screen.getByRole("textbox"), "Second question");
  await user.click(screen.getByRole("button", { name: "workspace.agent.send" }));
  await act(async () => {
    if (kind === "answer")
      finishOld({ repository: "octocat/first", provider: "preview", answer: "Old answer" });
    else failOld(new Error("Old error"));
  });
  expect(screen.queryByText("Old answer")).toBeNull();
  expect(screen.queryByText("Old error")).toBeNull();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Second question");
  expect(
    (screen.getByRole("button", { name: "workspace.agent.send" }) as HTMLButtonElement).disabled
  ).toBe(true);
  await act(async () => {
    finishNew({ repository: "octocat/second", provider: "preview", answer: "Current answer" });
  });
  expect(await screen.findByText("Current answer")).toBeTruthy();
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(""));
});
