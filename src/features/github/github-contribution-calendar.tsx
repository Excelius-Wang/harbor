import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarCompanion,
  encounterForDay,
  type CalendarVisit,
} from "./github-calendar-companion";
import type { GitHubContributionDay, GitHubContributionSummary } from "./github-data";

const levels = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);

export function contributionMonths(summary: GitHubContributionSummary) {
  return [
    ...new Set(summary.weeks.flatMap((week) => week.days.map((day) => day.date.slice(0, 7)))),
  ].sort();
}

export function ContributionCalendar({ summary }: { summary: GitHubContributionSummary }) {
  const { t, i18n } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [visible, setVisible] = useState(true);
  const [visit, setVisit] = useState<CalendarVisit | null>(null);
  const [map, setMap] = useState<HTMLDivElement | null>(null);
  const [companionMenuOpen, setCompanionMenuOpen] = useState(false);
  const [tooltipFocusDay, setTooltipFocusDay] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const visitCounter = useRef(0);
  const [month, setMonth] = useState<string | null>(null);
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const months = useMemo(() => contributionMonths(summary), [summary]);
  const selectedMonth =
    month === null ? null : months.includes(month) ? month : (months[months.length - 1] ?? null);
  const monthIndex = selectedMonth ? months.indexOf(selectedMonth) : -1;
  const calendarViewport = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (viewport && !selectedMonth) viewport.scrollLeft = viewport.scrollWidth;
    },
    [selectedMonth]
  );
  const allDays = summary.weeks.flatMap((week) => week.days);
  const days = selectedMonth
    ? allDays.filter((day) => day.date.startsWith(selectedMonth))
    : allDays;
  const currentVisitDay = visit ? days.find((day) => day.date === visit.day.date) : undefined;
  const currentVisit = visit && currentVisitDay ? { ...visit, day: currentVisitDay } : null;
  useEffect(() => {
    if (!visit) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-companion-menu]")) return;
      if (event.target instanceof Node && !root.current?.contains(event.target)) setVisit(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [visit]);
  const focusDate = days.some((day) => day.date === focusedDay) ? focusedDay : days[0]?.date;
  const dayFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const monthFormatter = new Intl.DateTimeFormat(i18n.language, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const weekdayFormatter = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    timeZone: "UTC",
  });

  // Play the entrance once, while visibility continues to pause the resident companion.
  useEffect(() => {
    if (!root.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setEntered(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((entry) => entry.isIntersecting));
        if (entries.some((entry) => entry.isIntersecting)) {
          setEntered(true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  const navigateDays = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = selectedMonth
      ? { ArrowDown: 7, ArrowUp: -7, ArrowRight: 1, ArrowLeft: -1 }
      : { ArrowDown: 1, ArrowUp: -1, ArrowRight: 7, ArrowLeft: -7 };
    if (!(event.key in steps) && event.key !== "Home" && event.key !== "End") return;
    const cells = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-contribution-day]")
    );
    const index = cells.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? cells.length - 1
          : Math.max(0, Math.min(cells.length - 1, index + steps[event.key]));
    cells[next]?.focus();
  };
  const tooltipDate = hoveredDay ?? tooltipFocusDay ?? currentVisit?.day.date;
  const renderDay = (day: GitHubContributionDay, index: number) => {
    const label = t("workspace.profile.contributionDay", {
      count: day.contributionCount,
      date: dayFormatter.format(utcDate(day.date)),
    });
    return (
      <Tooltip key={day.date} open={!companionMenuOpen && tooltipDate === day.date}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-contribution-day={day.date}
            data-level={levels.indexOf(day.contributionLevel)}
            className="harbor-contribution-cell"
            aria-label={label}
            aria-pressed={visit?.day.date === day.date}
            onClick={() => {
              setVisit({ day, request: ++visitCounter.current });
            }}
            tabIndex={day.date === focusDate ? 0 : -1}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setHoveredDay(day.date);
            }}
            onPointerLeave={() =>
              setHoveredDay((current) => (current === day.date ? null : current))
            }
            onFocus={() => {
              setFocusedDay(day.date);
              setTooltipFocusDay(day.date);
            }}
            onBlur={() => setTooltipFocusDay((current) => (current === day.date ? null : current))}
            style={
              {
                gridRow: selectedMonth ? undefined : day.weekday + 2,
                "--day-delay": `${Math.min(index * 0.45, 160)}ms`,
              } as CSSProperties
            }
          >
            {selectedMonth ? (
              <span className="harbor-contribution-number">{Number(day.date.slice(-2))}</span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {label}
          {visit?.day.date === day.date ? (
            <span className="ml-2">{t(`workspace.profile.companion.${encounterForDay(day)}`)}</span>
          ) : null}
        </TooltipContent>
      </Tooltip>
    );
  };
  const changeMonth = (value: string | null) => {
    setVisit(null);
    setHoveredDay(null);
    setTooltipFocusDay(null);
    setFocusedDay(null);
    setMonth(value);
  };
  const firstOfMonth = selectedMonth ? utcDate(`${selectedMonth}-01`) : null;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const monthLength = firstOfMonth
    ? new Date(
        Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)
      ).getUTCDate()
    : 0;
  const legend = (
    <div className="flex items-center justify-end gap-1.5 text-xs" aria-hidden="true">
      <span>{t("workspace.profile.contributionLess")}</span>
      {levels.map((level, index) => (
        <span key={level} className="harbor-contribution-swatch" data-level={index} />
      ))}
      <span>{t("workspace.profile.contributionMore")}</span>
    </div>
  );

  return (
    <section
      ref={root}
      className="harbor-contribution-calendar flex min-w-0 flex-col gap-3 border-b pb-5"
      data-entered={entered}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setVisit(null);
          setHoveredDay(null);
          setTooltipFocusDay(null);
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {t("workspace.profile.contributions", { count: summary.totalContributions })}
        </h2>
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label={t("workspace.profile.calendarView")}
        >
          <Button
            variant={selectedMonth ? "ghost" : "secondary"}
            size="sm"
            aria-pressed={!selectedMonth}
            onClick={() => changeMonth(null)}
          >
            {t("workspace.profile.yearView")}
          </Button>
          <Button
            variant={selectedMonth ? "secondary" : "ghost"}
            size="sm"
            disabled={!months.length}
            aria-pressed={Boolean(selectedMonth)}
            onClick={() => {
              if (!selectedMonth) changeMonth(months[months.length - 1] ?? null);
            }}
          >
            {t("workspace.profile.monthView")}
          </Button>
          <CalendarCompanion
            visit={currentVisit}
            period={selectedMonth ?? "year"}
            total={summary.totalContributions}
            visible={visible}
            map={map}
            layoutRevision={summary.weeks.map((week) => week.firstDay).join(":")}
            onMenuOpenChange={setCompanionMenuOpen}
            homeDate={
              [...days].reverse().find((day) => day.contributionCount > 0)?.date ??
              days[days.length - 1]?.date
            }
            onClear={() => setVisit(null)}
          />
        </div>
      </div>
      {summary.hasRestrictedContributions ? (
        <p className="text-muted-foreground text-xs">
          {t("workspace.profile.privateContributions", { count: summary.restrictedContributions })}
        </p>
      ) : null}
      {selectedMonth ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={monthIndex <= 0}
            aria-label={t("workspace.profile.previousMonth")}
            title={t("workspace.profile.previousMonth")}
            onClick={() => changeMonth(months[monthIndex - 1])}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium" aria-live="polite">
            {monthFormatter.format(utcDate(`${selectedMonth}-01`))}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={monthIndex >= months.length - 1}
            aria-label={t("workspace.profile.nextMonth")}
            title={t("workspace.profile.nextMonth")}
            onClick={() => changeMonth(months[monthIndex + 1])}
          >
            <ChevronRight />
          </Button>
          <span className="text-muted-foreground text-xs">
            {t("workspace.profile.monthContributions", {
              count: days.reduce((total, day) => total + day.contributionCount, 0),
              from: days[0] ? dayFormatter.format(utcDate(days[0].date)) : "",
              to: days[days.length - 1]
                ? dayFormatter.format(utcDate(days[days.length - 1]!.date))
                : "",
            })}
          </span>
        </div>
      ) : null}
      <div
        key={selectedMonth ?? "year"}
        className="harbor-contribution-period"
        data-month={Boolean(selectedMonth)}
      >
        <div className="flex min-w-0 gap-1">
          {!selectedMonth ? (
            <div
              className="grid grid-rows-[32px_repeat(7,12px)] gap-1 pt-1 pr-1 text-xs"
              aria-hidden="true"
            >
              <span />
              {Array.from({ length: 7 }, (_, day) => (
                <span key={day}>
                  {[1, 3, 5].includes(day)
                    ? weekdayFormatter.format(new Date(Date.UTC(2026, 0, 4 + day)))
                    : ""}
                </span>
              ))}
            </div>
          ) : null}
          <ScrollArea className="min-w-0 flex-1 pb-2" viewportRef={calendarViewport}>
            <div className={selectedMonth ? "w-full max-w-[392px] p-1" : "w-max p-1"}>
              <div
                ref={setMap}
                role="group"
                aria-label={t("workspace.profile.contributionCalendarLabel")}
                onKeyDown={navigateDays}
                className={
                  selectedMonth
                    ? "harbor-contribution-map relative grid grid-cols-7 gap-1.5"
                    : "harbor-contribution-map relative flex gap-1"
                }
              >
                {selectedMonth ? (
                  <>
                    {Array.from({ length: 7 }, (_, day) => (
                      <span key={`weekday-${day}`} className="pb-1 text-center text-xs">
                        {weekdayFormatter.format(new Date(Date.UTC(2026, 0, 4 + day)))}
                      </span>
                    ))}
                    {Array.from({ length: 42 }, (_, index) => {
                      const number = index - firstOfMonth!.getUTCDay() + 1;
                      const date = `${selectedMonth}-${String(number).padStart(2, "0")}`;
                      const day = byDate.get(date);
                      return day ? (
                        renderDay(day, index)
                      ) : (
                        <span
                          key={`blank-${index}`}
                          className="text-muted-foreground/60 flex h-12 items-center justify-center text-xs"
                          aria-hidden="true"
                        >
                          {number > 0 && number <= monthLength ? number : ""}
                        </span>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {summary.weeks.map((week, weekIndex) => {
                      const showMonth =
                        weekIndex === 0 ||
                        week.firstDay.slice(0, 7) !==
                          summary.weeks[weekIndex - 1].firstDay.slice(0, 7);
                      return (
                        <div
                          key={week.firstDay}
                          className="grid grid-rows-[32px_repeat(7,12px)] gap-1"
                        >
                          <span className="w-3 overflow-visible text-xs whitespace-nowrap">
                            {showMonth
                              ? new Intl.DateTimeFormat(i18n.language, {
                                  month: "short",
                                  timeZone: "UTC",
                                }).format(utcDate(week.firstDay))
                              : ""}
                          </span>
                          {week.days.map((day, index) => renderDay(day, weekIndex * 7 + index))}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
              <div className="mt-3">{legend}</div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      {selectedMonth ? (
        <p className="text-muted-foreground text-xs">{t("workspace.profile.yearMetrics")}</p>
      ) : null}
      <dl className="grid grid-cols-2 gap-1 overflow-hidden rounded-md border min-[700px]:grid-cols-4">
        {[
          ["commits", summary.commits],
          ["pullRequests", summary.pullRequests],
          ["reviews", summary.pullRequestReviews],
          ["issues", summary.issues],
        ].map(([label, value]) => (
          <div key={label} className="bg-muted/15 px-3 py-2">
            <dt className="text-muted-foreground text-xs">
              {t(`workspace.profile.metrics.${label}`)}
            </dt>
            <dd className="font-mono text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
