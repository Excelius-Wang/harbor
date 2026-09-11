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
it("lets a hovered date replace selected-date details and restores selection on leave", async () => {
  mount();
  const cells = document.querySelectorAll<HTMLButtonElement>("[data-contribution-day]");
  fireEvent.click(cells[10]);
  const selected = cells[10].getAttribute("aria-label")!;
  expect((await screen.findByRole("tooltip")).textContent).toContain(selected);
  fireEvent.pointerEnter(cells[20], { pointerType: "mouse" });
  fireEvent.pointerMove(cells[20], { pointerType: "mouse" });
  const hovered = cells[20].getAttribute("aria-label")!;
  expect(screen.getByRole("tooltip").textContent).toContain(hovered);
  fireEvent.pointerLeave(cells[20], { pointerType: "mouse" });
  expect(screen.getByRole("tooltip").textContent).toContain(selected);
  fireEvent.focus(cells[30]);
  expect(screen.getByRole("tooltip").textContent).toContain(cells[30].getAttribute("aria-label"));
  fireEvent.blur(cells[30]);
  expect(screen.getByRole("tooltip").textContent).toContain(selected);
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
