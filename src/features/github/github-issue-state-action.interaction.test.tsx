// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GitHubIssueStateAction } from "./github-issue-state-action";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => cleanup());

function renderAction(props: ComponentProps<typeof GitHubIssueStateAction>) {
  return render(
    <TooltipProvider>
      <GitHubIssueStateAction {...props} />
    </TooltipProvider>
  );
}

describe("GitHub Issue state action", () => {
  it("lets the user close an open Issue as not planned", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAction({ state: "open", pending: false, onChange });

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.chooseIssueCloseReason" })
    );
    expect(
      screen.getByText("workspace.repositories.closeIssueNotPlannedDescription")
    ).toBeDefined();
    await user.click(
      screen.getByRole("menuitem", {
        name: /workspace\.repositories\.closeIssueAsNotPlanned/,
      })
    );
    expect(onChange).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    );

    expect(onChange).toHaveBeenCalledWith({
      desiredState: "closed",
      closeReason: "notPlanned",
    });
  });

  it("reopens a closed Issue without a close reason", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAction({ state: "closed", pending: false, onChange });

    await user.click(screen.getByRole("button", { name: "workspace.repositories.reopenIssue" }));

    expect(onChange).toHaveBeenCalledWith({
      desiredState: "open",
      closeReason: null,
    });
  });

  it("supports keyboard reason selection and exposes split-button semantics", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAction({ state: "open", pending: false, onChange });

    const trigger = screen.getByRole("button", {
      name: "workspace.repositories.chooseIssueCloseReason",
    });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    trigger.focus();
    await user.keyboard("{Enter}{End}{Enter}");

    expect(
      screen.getByRole("button", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    ).toBeDefined();
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBe("false");
  });

  it("locks both halves and reports busy while a close is pending", () => {
    renderAction({ state: "open", pending: true, onChange: vi.fn() });

    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-busy")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "workspace.repositories.closingIssue" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "workspace.repositories.chooseIssueCloseReason" })
        .hasAttribute("disabled")
    ).toBe(true);
  });
});
