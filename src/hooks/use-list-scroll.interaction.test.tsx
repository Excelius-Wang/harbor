// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useListScroll } from "./use-list-scroll";

function ListDetailHarness() {
  const [detail, setDetail] = useState(false);
  const [query, setQuery] = useState("open");
  const scroll = useListScroll(query);
  return (
    <>
      <button onClick={() => setQuery(query === "open" ? "closed" : "open")}>Change query</button>
      {detail ? (
        <button onClick={() => setDetail(false)}>Back</button>
      ) : (
        <ScrollArea {...scroll}>
          <button onClick={() => setDetail(true)}>Open detail</button>
        </ScrollArea>
      )}
    </>
  );
}

beforeEach(() => {
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

describe("list scroll restoration", () => {
  it("restores a list after detail return and keeps different queries separate", async () => {
    const user = userEvent.setup();
    const view = render(<ListDetailHarness />);
    const viewport = () =>
      view.container.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]')!;
    viewport().scrollTop = 144;
    fireEvent.scroll(viewport());
    await user.click(view.getByText("Open detail"));
    await user.click(view.getByText("Back"));
    expect(viewport().scrollTop).toBe(144);
    await user.click(view.getByText("Change query"));
    expect(viewport().scrollTop).toBe(0);
    viewport().scrollTop = 72;
    fireEvent.scroll(viewport());
    await user.click(view.getByText("Change query"));
    expect(viewport().scrollTop).toBe(144);
  });
});
