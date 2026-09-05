// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Command, CommandInput, CommandItem, CommandList } from "./command";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
beforeAll(() => {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLElement.prototype.scrollIntoView = () => {};
});

function Candidates({
  loaded,
  includeAccessibility = true,
  value,
}: {
  loaded: boolean;
  includeAccessibility?: boolean;
  value?: string;
}) {
  return (
    <Command label="Review teams" value={value}>
      <CommandInput />
      <CommandList>
        {loaded ? (
          <>
            <CommandItem value="Workspace maintainers">Workspace maintainers</CommandItem>
            {includeAccessibility ? (
              <CommandItem value="Accessibility reviewers">Accessibility reviewers</CommandItem>
            ) : null}
          </>
        ) : null}
      </CommandList>
    </Command>
  );
}

it("links the input to its active option after async registration, filtering and keyboard movement", async () => {
  const user = userEvent.setup();
  const view = render(<Candidates loaded={false} />);
  view.rerender(<Candidates loaded />);
  const input = screen.getByRole("combobox", { name: "Review teams" });
  const first = screen.getByRole("option", { name: "Workspace maintainers" });
  await waitFor(() => expect(input.getAttribute("aria-activedescendant")).toBe(first.id));
  await user.click(input);
  await user.keyboard("{ArrowDown}");
  const second = screen.getByRole("option", { name: "Accessibility reviewers" });
  await waitFor(() => expect(input.getAttribute("aria-activedescendant")).toBe(second.id));
  await user.type(input, "Workspace");
  await waitFor(() => expect(input.getAttribute("aria-activedescendant")).toBe(first.id));
  await user.clear(input);
  await user.type(input, "No such team");
  await waitFor(() => expect(input.hasAttribute("aria-activedescendant")).toBe(false));
});

it("moves the active descendant when the selected async option is removed", async () => {
  const user = userEvent.setup();
  const view = render(<Candidates loaded />);
  const input = screen.getByRole("combobox", { name: "Review teams" });
  await user.click(input);
  await user.keyboard("{ArrowDown}");
  await waitFor(() =>
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Accessibility reviewers" }).id
    )
  );
  view.rerender(<Candidates loaded includeAccessibility={false} />);
  await waitFor(() =>
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Workspace maintainers" }).id
    )
  );
});

it("links a controlled value when its matching async option arrives", async () => {
  const view = render(<Candidates loaded={false} value="Accessibility reviewers" />);
  view.rerender(<Candidates loaded value="Accessibility reviewers" />);
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Review teams" }).getAttribute("aria-activedescendant")
    ).toBe(screen.getByRole("option", { name: "Accessibility reviewers" }).id)
  );
});
