// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarColumnResident, columnTravel } from "./github-calendar-column-resident";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
  width,
  height,
  toJSON() {},
});
function fixture() {
  const map = document.createElement("div");
  map.innerHTML =
    '<button data-contribution-day="2026-09-02"><svg><polygon class="harbor-contribution-top" /></svg></button><button data-contribution-day="2026-09-03"><svg><polygon class="harbor-contribution-top" /></svg></button>';
  Object.defineProperties(map, { offsetWidth: { value: 400 }, offsetHeight: { value: 200 } });
  map.getBoundingClientRect = () => rect(100, 50, 400, 200);
  const faces = map.querySelectorAll("polygon");
  let height = 20;
  faces[0].getBoundingClientRect = () => rect(200, 100 - height, 16, 8);
  faces[1].getBoundingClientRect = () => rect(200, 118 - height, 16, 8);
  return {
    map,
    setHeight: (value: number) => {
      height = value;
    },
  };
}
it("anchors feet at the top centroid and remeasures refreshed heights without replay", () => {
  const f = fixture();
  const animate = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  const view = render(
    <CalendarColumnResident map={f.map} date="2026-09-02" period="year" active reduced={false} />
  );
  const marker = view.container.firstElementChild as HTMLElement;
  marker.animate = animate;
  expect(marker.style.left).toBe("108px");
  expect(marker.style.top).toBe("34px");
  f.setHeight(40);
  view.rerender(
    <CalendarColumnResident
      map={f.map}
      date="2026-09-02"
      period="year"
      revision="new-height"
      active
      reduced={false}
    />
  );
  expect(marker.style.top).toBe("14px");
  expect(animate).not.toHaveBeenCalled();
});
it("hops only to nearby dates and fades across the calendar", () => {
  const from = { x: 30, y: 30, date: "2026-09-02", period: "year" };
  expect(columnTravel(from, { ...from, y: 47, date: "2026-09-03" })).toBe("hop");
  expect(columnTravel(from, { ...from, x: 800, date: "2026-09-03" })).toBe("fade");
  expect(columnTravel(from, { ...from, date: "2026-09-20" })).toBe("fade");
});
it("cancels replaced travel, pauses in flight, and does not replay a completed landing", () => {
  const f = fixture();
  const animations: {
    playState: string;
    cancel: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
  }[] = [];
  const view = render(
    <CalendarColumnResident map={f.map} date="2026-09-02" period="year" active reduced={false} />
  );
  const marker = view.container.firstElementChild as HTMLElement;
  marker.getBoundingClientRect = () => rect(199, 66.36, 18, 18);
  marker.animate = vi.fn(() => {
    const animation = { playState: "running", cancel: vi.fn(), pause: vi.fn(), play: vi.fn() };
    animations.push(animation);
    return animation as unknown as Animation;
  });
  const draw = (date: string, active = true, reduced = false) =>
    view.rerender(
      <CalendarColumnResident
        map={f.map}
        date={date}
        period="year"
        active={active}
        reduced={reduced}
      />
    );
  draw("2026-09-03");
  expect(marker.dataset.travel).toBe("hop");
  draw("2026-09-03", false);
  expect(animations[0].pause).toHaveBeenCalled();
  marker.getBoundingClientRect = () => rect(999, 66.36, 18, 18);
  draw("2026-09-02");
  expect(marker.dataset.travel).toBe("fade");
  expect(animations[0].cancel).toHaveBeenCalled();
  act(() => {
    animations[1].playState = "finished";
  });
  draw("2026-09-02", false);
  draw("2026-09-02");
  expect(animations[1].play).not.toHaveBeenCalled();
  draw("2026-09-03", true, true);
  expect(animations).toHaveLength(2);
  expect(marker.style.top).toBe("52px");
});
