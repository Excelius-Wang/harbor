// @vitest-environment jsdom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RepositoryTabStrip, RepositoryTabTrigger } from "./github-repository-tabs";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const names = ["Code", "Wiki", "Issues", "Pull requests", "Actions", "Settings"];
const observers = new Set<ResizeObserverStub>();

class ResizeObserverStub {
  targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});
afterEach(() => {
  cleanup();
  observers.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Fixture() {
  const [selected, setSelected] = useState(names[0]);
  return (
    <TooltipProvider>
      <Tabs value={selected} onValueChange={setSelected}>
        <RepositoryTabStrip activeTab={selected}>
          {names.map((name) => (
            <RepositoryTabTrigger key={name} value={name}>
              {name}
            </RepositoryTabTrigger>
          ))}
        </RepositoryTabStrip>
      </Tabs>
    </TooltipProvider>
  );
}

function mountStrip() {
  render(<Fixture />);
  const list = screen.getByRole("tablist");
  const viewport = list.parentElement!;
  const strip = viewport.parentElement!;
  let dimensions = { strip: 400, viewport: 300, content: 720 };
  let offset = 0;
  const clamp = (value: number) =>
    Math.max(0, Math.min(value, Math.max(0, dimensions.content - dimensions.viewport)));

  // jsdom supplies no layout. Feed measured geometry into the real controls;
  // native/browser regression evidence separately verifies CSS and scrollbar rendering.
  Object.defineProperty(strip, "clientWidth", { get: () => dimensions.strip });
  Object.defineProperty(list, "scrollWidth", { get: () => dimensions.content });
  Object.defineProperties(viewport, {
    clientWidth: { get: () => dimensions.viewport },
    scrollWidth: { get: () => dimensions.content },
    scrollLeft: {
      get: () => offset,
      set: (value: number) => {
        offset = clamp(value);
      },
    },
    scrollBy: {
      value: vi.fn((options: ScrollToOptions) => {
        viewport.scrollLeft += options.left ?? 0;
        viewport.dispatchEvent(new Event("scroll"));
      }),
    },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 0, dimensions.viewport, 40)
  );
  screen.getAllByRole("tab").forEach((tab, index) => {
    vi.spyOn(tab, "getBoundingClientRect").mockImplementation(
      () =>
        new DOMRect(
          (index * dimensions.content) / names.length - offset,
          0,
          dimensions.content / names.length,
          40
        )
    );
  });

  const resize = (next = dimensions) => {
    act(() => {
      dimensions = next;
      offset = clamp(offset);
      for (const observer of [...observers]) {
        if (!observer.targets.has(strip)) continue;
        observer.callback([], observer as unknown as ResizeObserver);
      }
    });
  };
  const selectedIsVisible = () => {
    const tab = screen
      .getAllByRole("tab")
      .find((item) => item.getAttribute("aria-selected") === "true")!;
    const bounds = tab.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= dimensions.viewport;
  };
  resize();
  return { viewport, resize, selectedIsVisible };
}

const left = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "workspace.repositories.scrollTabsLeft" });
const right = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "workspace.repositories.scrollTabsRight" });

it("scrolls with the arrows, disables boundaries, and preserves the selected tab", async () => {
  const user = userEvent.setup();
  const { viewport } = mountStrip();
  expect(left().disabled).toBe(true);
  expect(right().disabled).toBe(false);
  await user.click(right());
  expect(viewport.scrollLeft).toBeGreaterThan(0);
  expect(left().disabled).toBe(false);
  await user.click(right());
  expect(right().disabled).toBe(true);
  expect(screen.getByRole("tab", { name: "Code" }).getAttribute("aria-selected")).toBe("true");
  await user.click(left());
  expect(right().disabled).toBe(false);
  await user.click(left());
  expect(viewport.scrollLeft).toBe(0);
  expect(left().disabled).toBe(true);
});

it("updates boundary controls when the viewport scrolls independently of the arrows", () => {
  const { viewport } = mountStrip();
  act(() => {
    viewport.scrollLeft = viewport.scrollWidth;
  });
  fireEvent.scroll(viewport);
  expect(right().disabled).toBe(true);
  expect(left().disabled).toBe(false);
  act(() => {
    viewport.scrollLeft = 0;
  });
  fireEvent.scroll(viewport);
  expect(right().disabled).toBe(false);
  expect(left().disabled).toBe(true);
});

it("reveals keyboard-selected tabs at both ends without requiring a resize", async () => {
  const user = userEvent.setup();
  const { viewport, selectedIsVisible } = mountStrip();
  screen.getByRole("tab", { name: "Code" }).focus();
  await user.keyboard("{End}");
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected")).toBe("true")
  );
  expect(viewport.scrollLeft).toBeGreaterThan(0);
  expect(selectedIsVisible()).toBe(true);
  await user.keyboard("{Home}");
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Code" }).getAttribute("aria-selected")).toBe("true")
  );
  expect(viewport.scrollLeft).toBe(0);
  expect(selectedIsVisible()).toBe(true);
});

it("reveals the retained selection after resize and removes arrows when content fits", async () => {
  const user = userEvent.setup();
  const { resize, selectedIsVisible } = mountStrip();
  resize({ strip: 800, viewport: 784, content: 720 });
  expect(
    screen.queryByRole("button", { name: "workspace.repositories.scrollTabsRight" })
  ).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Settings" }));
  resize({ strip: 320, viewport: 240, content: 720 });
  expect(selectedIsVisible()).toBe(true);
  expect(right().disabled).toBe(true);
  expect(left().disabled).toBe(false);
  resize({ strip: 800, viewport: 784, content: 720 });
  expect(
    screen.queryByRole("button", { name: "workspace.repositories.scrollTabsLeft" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "workspace.repositories.scrollTabsRight" })
  ).toBeNull();
  expect(screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected")).toBe("true");
  expect(selectedIsVisible()).toBe(true);
});
