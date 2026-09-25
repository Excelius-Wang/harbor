// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ContributionCalendar, contributionMonths } from "./github-contribution-calendar";
import type { GitHubContributionSummary } from "./github-data";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, args?: Record<string, unknown>) =>
      key === "workspace.profile.contributionDay" ? `${args?.date}: ${args?.count}` : key,
  }),
}));
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
const days = Array.from({ length: 70 }, (_, index) => {
  const date = new Date(Date.UTC(2023, 11, 28 + index));
  return {
    date: date.toISOString().slice(0, 10),
    weekday: date.getUTCDay(),
    color: "",
    contributionCount: index % 5,
    contributionLevel: "FIRST_QUARTILE" as const,
  };
});
const summary: GitHubContributionSummary = {
  login: "octocat",
  startedAt: days[0].date,
  endedAt: days[days.length - 1]!.date,
  totalContributions: 140,
  restrictedContributions: 0,
  hasRestrictedContributions: false,
  commits: 100,
  issues: 10,
  pullRequests: 20,
  pullRequestReviews: 10,
  months: [],
  weeks: [{ firstDay: days[0].date, days }],
};
function mount(data = summary) {
  return render(
    <TooltipProvider>
      <ContributionCalendar summary={data} />
    </TooltipProvider>
  );
}
it("derives month bounds across years and includes leap day without inventing unavailable days", () => {
  expect(contributionMonths(summary)).toEqual(["2023-12", "2024-01", "2024-02", "2024-03"]);
  mount();
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.monthView" }));
  const next = screen.getByRole("button", {
    name: "workspace.profile.nextMonth",
  }) as HTMLButtonElement;
  expect(next.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.previousMonth" }));
  expect(document.querySelectorAll("[data-contribution-day]")).toHaveLength(29);
  expect(document.querySelector('[data-contribution-day="2024-02-29"]')).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.previousMonth" }));
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.previousMonth" }));
  expect(
    (screen.getByRole("button", { name: "workspace.profile.previousMonth" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  expect(document.querySelectorAll("[data-contribution-day]")).toHaveLength(4);
});
it("keeps one tab stop and changes arrow geometry with the view", () => {
  mount();
  const cells = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("[data-contribution-day]"));
  fireEvent.keyDown(cells()[0], { key: "ArrowRight" });
  expect(document.activeElement).toBe(cells()[7]);
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.monthView" }));
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.previousMonth" }));
  fireEvent.keyDown(cells()[0], { key: "ArrowDown" });
  expect(document.activeElement).toBe(cells()[7]);
  fireEvent.keyDown(cells()[7], { key: "End" });
  expect(document.activeElement).toBe(cells()[cells().length - 1]);
  expect(cells().filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
});
it("keeps the selected month and mounted cells through data refresh", () => {
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.monthView" }));
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.previousMonth" }));
  const cell = document.querySelector('[data-contribution-day="2024-02-29"]');
  view.rerender(
    <TooltipProvider>
      <ContributionCalendar summary={{ ...summary, totalContributions: 150 }} />
    </TooltipProvider>
  );
  expect(document.querySelector('[data-contribution-day="2024-02-29"]')).toBe(cell);
  expect(document.querySelector('[data-month="true"]')).not.toBeNull();
});
it("disables month view when no days are available", () => {
  mount({ ...summary, weeks: [], totalContributions: 0 });
  expect(
    (screen.getByRole("button", { name: "workspace.profile.monthView" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});
it("keeps selected details below the chart and shows tooltips only for hover or keyboard focus", async () => {
  mount();
  const cells = document.querySelectorAll<HTMLButtonElement>("[data-contribution-day]");
  fireEvent.click(cells[10]);
  const selected = cells[10].getAttribute("aria-label")!;
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(document.querySelector("[data-selected-date]")?.textContent).toContain(selected);
  fireEvent.pointerEnter(cells[20], { pointerType: "mouse" });
  fireEvent.pointerMove(cells[20], { pointerType: "mouse" });
  expect((await screen.findByRole("tooltip")).textContent).toContain(
    cells[20].getAttribute("aria-label")
  );
  fireEvent.pointerLeave(cells[20], { pointerType: "mouse" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  const matches = vi.spyOn(cells[30], "matches").mockReturnValue(true);
  fireEvent.focus(cells[30]);
  expect(screen.getByRole("tooltip").textContent).toContain(cells[30].getAttribute("aria-label"));
  fireEvent.blur(cells[30]);
  matches.mockRestore();
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(document.querySelector("[data-selected-date]")?.textContent).toContain(selected);
});

it("ends the entrance window before refreshed cells are mounted", () => {
  vi.useFakeTimers();
  try {
    const view = mount();
    const calendar = document.querySelector(".harbor-contribution-calendar")!;
    expect(calendar.getAttribute("data-arriving")).toBe("true");
    act(() => vi.advanceTimersByTime(350));
    expect(calendar.getAttribute("data-arriving")).toBe("false");
    view.rerender(
      <TooltipProvider>
        <ContributionCalendar
          summary={{ ...summary, weeks: [{ firstDay: days[1].date, days: days.slice(1) }] }}
        />
      </TooltipProvider>
    );
    expect(calendar.getAttribute("data-arriving")).toBe("false");
  } finally {
    vi.useRealTimers();
  }
});

it("preserves the selected date, focus and live counts when changing appearance or refreshing", () => {
  const view = mount();
  const cell = document.querySelector<HTMLButtonElement>('[data-contribution-day="2024-02-29"]')!;
  fireEvent.focus(cell);
  fireEvent.click(cell);
  fireEvent.click(screen.getByRole("radio", { name: "workspace.profile.calendarAppearanceFlat" }));
  expect(document.querySelector(".harbor-contribution-calendar")?.getAttribute("data-depth")).toBe(
    "false"
  );
  expect(cell.getAttribute("aria-pressed")).toBe("true");
  expect(cell.tabIndex).toBe(0);
  expect(document.querySelector("[data-selected-date]")?.textContent).toContain("Feb 29, 2024");
  const updated = days.map((day) =>
    day.date === "2024-02-29" ? { ...day, contributionCount: 99 } : day
  );
  view.rerender(
    <TooltipProvider>
      <ContributionCalendar
        summary={{ ...summary, weeks: [{ firstDay: days[0].date, days: updated }] }}
      />
    </TooltipProvider>
  );
  expect(document.querySelector("[data-selected-date]")?.textContent).toContain("99");
  fireEvent.click(screen.getByRole("radio", { name: "workspace.profile.calendarAppearance3d" }));
  expect(document.querySelector('[data-contribution-day="2024-02-29"]')).toBe(cell);
  expect(cell.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("status").textContent).toContain("99");
  fireEvent.keyDown(cell, { key: "Escape" });
  expect(document.querySelector("[data-selected-date]")).toBeNull();
});

it("keeps the annual height scale across months and makes zero contributions flat", () => {
  mount();
  const zero = document.querySelector<HTMLButtonElement>(
    `[data-contribution-day="${days[0].date}"]`
  )!;
  expect(zero.style.getPropertyValue("--day-height")).toBe("0px");
  const leapDay = document.querySelector<HTMLButtonElement>(
    '[data-contribution-day="2024-02-29"]'
  )!;
  const height = leapDay.style.getPropertyValue("--day-height");
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.monthView" }));
  fireEvent.click(screen.getByRole("button", { name: "workspace.profile.previousMonth" }));
  const monthDay = document.querySelector<HTMLButtonElement>(
    '[data-contribution-day="2024-02-29"]'
  )!;
  expect(monthDay.style.getPropertyValue("--day-height")).toBe(height);
  expect(monthDay.textContent).toBe("29");
  expect(document.querySelector(".harbor-contribution-calendar")?.getAttribute("data-depth")).toBe(
    "true"
  );
});
