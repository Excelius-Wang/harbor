// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CalendarCompanion,
  companionProgress,
  encounterForDay,
  type CalendarVisit,
} from "./github-calendar-companion";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, args?: Record<string, unknown>) =>
      key === "workspace.profile.contributionDay"
        ? `${args?.date}: ${args?.count}`
        : key === "workspace.profile.companion.level"
          ? `Lv. ${args?.level}`
          : key,
  }),
}));
let hidden = false;
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  hidden = false;
  reduced = false;
  props.map = document.createElement("div");
  props.map.innerHTML =
    '<button data-contribution-day="2026-08-20">20</button><button data-contribution-day="2026-08-21">21</button>';
  document.body.append(props.map);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  props.map?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const visit: CalendarVisit = {
  request: 1,
  day: {
    date: "2026-08-20",
    weekday: 4,
    color: "",
    contributionCount: 12,
    contributionLevel: "FOURTH_QUARTILE",
  },
};
const props = {
  visit: null as CalendarVisit | null,
  period: "year",
  total: 474,
  visible: true,
  map: null as HTMLDivElement | null,
  homeDate: "2026-08-20",
  onClear: vi.fn(),
};
function tick(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}
const phase = () =>
  document.querySelector(".harbor-calendar-companion")?.getAttribute("data-phase");
it("appears immediately, finishes arrival, and bases levels solely on contributions", () => {
  render(<CalendarCompanion {...props} />);
  expect(phase()).toBe("welcome");
  expect(screen.getByText("Lv. 5")).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "workspace.profile.companion.settings",
      description: "Lv. 5",
    })
  ).toBeTruthy();
  tick(650);
  expect(phase()).toBe("idle");
  expect(companionProgress(474)).toEqual({ level: 5, progress: 74 });
});
it("shows the clicked date immediately and replaces an unfinished encounter without queuing", () => {
  const view = render(<CalendarCompanion {...props} visit={visit} />);
  expect(screen.getByRole("status").textContent).toContain("12");
  expect(phase()).toBe("walking");
  tick(650);
  expect(phase()).toBe("encounter");
  const next = {
    ...visit,
    request: 2,
    day: { ...visit.day, date: "2026-08-21", contributionCount: 0 },
  };
  view.rerender(<CalendarCompanion {...props} visit={next} />);
  expect(phase()).toBe("walking");
  expect(document.querySelector('[data-encounter="rest"]')).toBeTruthy();
  tick(650);
  expect(phase()).toBe("encounter");
  tick(900);
  expect(phase()).toBe("idle");
  expect(screen.getByText("Lv. 5")).toBeTruthy();
});
it("pauses remaining travel time offscreen and resumes without stale callbacks", () => {
  const view = render(<CalendarCompanion {...props} visit={visit} />);
  tick(250);
  view.rerender(<CalendarCompanion {...props} visit={visit} visible={false} />);
  tick(5000);
  expect(phase()).toBe("walking");
  view.rerender(<CalendarCompanion {...props} visit={visit} />);
  tick(399);
  expect(phase()).toBe("walking");
  tick(1);
  expect(phase()).toBe("encounter");
});
it("pauses for document visibility and manual pause", () => {
  render(<CalendarCompanion {...props} visit={visit} />);
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  tick(5000);
  expect(phase()).toBe("walking");
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.companion.settings" }));
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.companion.pause" }));
  tick(5000);
  expect(phase()).toBe("walking");
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.companion.resume" }));
  tick(650);
  expect(phase()).toBe("encounter");
});
it("keeps reduced-motion feedback static and readable", () => {
  reduced = true;
  render(<CalendarCompanion {...props} visit={visit} />);
  expect(phase()).toBe("encounter");
  expect(screen.getByRole("status").textContent).toContain("12");
  expect(document.querySelector('[data-active="false"]')).toBeTruthy();
  tick(5000);
  expect(phase()).toBe("encounter");
});
it("preserves state on refresh and celebrates only a real level increase", () => {
  const view = render(<CalendarCompanion {...props} visit={visit} />);
  tick(650);
  view.rerender(<CalendarCompanion {...props} visit={{ ...visit }} />);
  expect(phase()).toBe("encounter");
  view.rerender(<CalendarCompanion {...props} total={500} visit={visit} />);
  expect(phase()).toBe("reward");
  expect(screen.getByText("Lv. 6")).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "workspace.profile.companion.settings",
      description: "Lv. 6",
    })
  ).toBeTruthy();
  tick(600);
  expect(phase()).toBe("idle");
});
it("keeps encounters deterministic and treats zero contribution as rest", () => {
  expect(encounterForDay(visit.day)).toBe("chest");
  expect(encounterForDay({ ...visit.day, contributionCount: 0 })).toBe("rest");
  const ordinary = { ...visit.day, contributionLevel: "FIRST_QUARTILE" as const };
  expect(encounterForDay({ ...ordinary })).toBe(encounterForDay(ordinary));
});

it("mounts a non-interactive sprite inside the date map and keeps controls outside it", () => {
  render(<CalendarCompanion {...props} visit={visit} />);
  expect(props.map?.querySelector(".harbor-calendar-companion")).toBeTruthy();
  expect(props.map?.querySelector(".harbor-calendar-companion")?.getAttribute("aria-hidden")).toBe(
    "true"
  );
  expect(props.map?.querySelector(".harbor-companion-controls")).toBeNull();
  expect(document.querySelector(".harbor-companion-stage")).toBeNull();
});

function mockCellOffsets(left: () => number) {
  const map = props.map!;
  const cells = map.querySelectorAll("button");
  Object.defineProperty(map, "clientWidth", { configurable: true, value: 200 });
  for (const cell of cells) {
    Object.defineProperties(cell, {
      offsetWidth: { configurable: true, value: 12 },
      offsetHeight: { configurable: true, value: 12 },
      offsetParent: { configurable: true, value: map },
      offsetTop: { configurable: true, value: 24 },
      offsetLeft: { configurable: true, get: left },
    });
  }
}
it("remeasures a rolling calendar without restarting the selected encounter", () => {
  let left = 100;
  mockCellOffsets(() => left);
  const view = render(<CalendarCompanion {...props} visit={visit} layoutRevision="week-a" />);
  tick(650);
  expect(phase()).toBe("encounter");
  expect((document.querySelector(".harbor-companion-position") as HTMLElement).style.left).toBe(
    "106px"
  );
  left = 84;
  view.rerender(<CalendarCompanion {...props} visit={visit} layoutRevision="week-b" />);
  expect((document.querySelector(".harbor-companion-position") as HTMLElement).style.left).toBe(
    "90px"
  );
  expect(phase()).toBe("encounter");
});
it("keeps leftward facing when ResizeObserver repeats unchanged coordinates", () => {
  let left = 140;
  mockCellOffsets(() => left);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private notify: () => void) {}
      observe() {
        this.notify();
      }
      disconnect() {}
    }
  );
  const view = render(<CalendarCompanion {...props} />);
  tick(650);
  left = 20;
  view.rerender(
    <CalendarCompanion {...props} visit={{ ...visit, day: { ...visit.day, date: "2026-08-21" } }} />
  );
  expect((document.querySelector(".harbor-companion-facing") as HTMLElement).style.transform).toBe(
    "scaleX(-1)"
  );
});
