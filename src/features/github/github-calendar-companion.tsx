import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { GitHubContributionDay } from "./github-data";
import sprites from "@/assets/calendar-traveler.png";

export type CalendarVisit = { day: GitHubContributionDay; request: number };
export type Encounter = "rest" | "explore" | "bug" | "chest";
export function encounterForDay(day: GitHubContributionDay): Encounter {
  if (day.contributionCount === 0) return "rest";
  if (day.contributionLevel === "FOURTH_QUARTILE") return "chest";
  const hash = Array.from(day.date).reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
    0
  );
  return hash % 3 === 0 ? "bug" : "explore";
}
export function companionProgress(contributions: number) {
  const total = Math.max(0, Math.floor(contributions));
  return { level: 1 + Math.floor(total / 100), progress: total % 100 };
}

type Phase = "welcome" | "walking" | "encounter" | "reward" | "idle";

// Preserve remaining time when the calendar or document is hidden; cancel on a new destination.
export function useCompanionStep(
  phase: Phase,
  active: boolean,
  next: () => void,
  resetKey: string
) {
  const remaining = useRef(0);
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);
  useEffect(() => {
    remaining.current = phase === "encounter" ? 900 : phase === "reward" ? 600 : 650;
  }, [phase, resetKey]);
  useEffect(() => {
    if (!active || phase === "idle") return;
    const started = performance.now();
    const timeout = window.setTimeout(() => nextRef.current(), remaining.current);
    return () => {
      window.clearTimeout(timeout);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [active, phase, resetKey]);
}

export function CalendarCompanion({
  visit,
  period,
  total,
  visible,
  onClear,
  map,
  homeDate,
  layoutRevision,
  onMenuOpenChange,
}: {
  visit: CalendarVisit | null;
  period: string;
  total: number;
  visible: boolean;
  onClear: () => void;
  map?: HTMLDivElement | null;
  homeDate?: string;
  layoutRevision?: string;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const positionRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [phase, setPhase] = useState<Phase>("welcome");
  const key = `${period}:${visit?.request ?? 0}`;
  const hasVisit = Boolean(visit);
  const [position, setPosition] = useState({ x: 0, y: 0, reverse: false });
  const [facing, setFacing] = useState(1);
  const previousX = useRef(0);
  const targetDate = visit?.day.date ?? homeDate;
  useLayoutEffect(() => {
    if (!map || !targetDate) return;
    const measure = () => {
      const cell = Array.from(map.querySelectorAll<HTMLElement>("[data-contribution-day]")).find(
        (element) => element.dataset.contributionDay === targetDate
      );
      if (!cell) return;
      // Offset geometry is unaffected by the date's hover scale or scrolling.
      let x = cell.offsetWidth / 2;
      let y = cell.offsetHeight;
      let parent: HTMLElement | null = cell;
      while (parent && parent !== map) {
        x += parent.offsetLeft;
        y += parent.offsetTop;
        parent = parent.offsetParent as HTMLElement | null;
      }
      const size = period === "year" ? 32 : 48;
      x = Math.max(size / 2, Math.min(map.clientWidth - size / 2, x));
      if (x !== previousX.current) setFacing(x < previousX.current ? -1 : 1);
      previousX.current = x;
      setPosition({ x, y, reverse: x > map.clientWidth - size * 1.5 });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(map);
    return () => observer?.disconnect();
  }, [map, targetDate, period, layoutRevision]);
  const encounter = visit ? encounterForDay(visit.day) : "rest";
  const { level, progress } = companionProgress(total);
  const previousLevel = useRef(level);
  const [levelUp, setLevelUp] = useState(false);
  useEffect(() => {
    const listener = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", listener);
    const media =
      typeof matchMedia === "undefined" ? null : matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media?.matches ?? false);
    media?.addEventListener("change", motion);
    return () => {
      document.removeEventListener("visibilitychange", listener);
      media?.removeEventListener("change", motion);
    };
  }, []);
  useEffect(() => {
    setLevelUp(false);
    setPhase(hasVisit ? "walking" : "welcome");
  }, [key, hasVisit]); // New destinations replace, never queue.
  useEffect(() => {
    if (level > previousLevel.current) {
      setLevelUp(true);
      setPhase("reward");
    }
    previousLevel.current = level;
  }, [level]);
  const [mapVisible, setMapVisible] = useState(true);
  useEffect(() => {
    if (!map || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      setMapVisible(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(map);
    return () => observer.disconnect();
  }, [map]);
  const active = visible && mapVisible && documentVisible && enabled && !reduced;
  useEffect(() => {
    const animations = positionRef.current?.getAnimations?.() ?? [];
    for (const animation of animations) {
      if (active) animation.play();
      else animation.pause();
    }
  }, [active, key, position.x, position.y]);
  useCompanionStep(
    phase,
    active,
    () => {
      if (phase === "reward") setLevelUp(false);
      setPhase((current) =>
        current === "walking"
          ? "encounter"
          : current === "encounter"
            ? encounter === "rest"
              ? "idle"
              : "reward"
            : "idle"
      );
    },
    key
  );
  const displayPhase = reduced ? "idle" : phase;
  const label = visit
    ? t("workspace.profile.contributionDay", {
        date: new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(new Date(`${visit.day.date}T00:00:00Z`)),
        count: visit.day.contributionCount,
      })
    : t("workspace.profile.companion.hint");
  const attributes = {
    "data-active": active,
    "data-phase": displayPhase,
    "data-encounter": encounter,
    "data-month": period !== "year",
    style: { "--companion-sprites": `url(${sprites})` } as CSSProperties,
  };
  return (
    <>
      <div className="harbor-companion-controls" {...attributes}>
        <p role="status" className="sr-only">
          {label}{" "}
          {levelUp
            ? t("workspace.profile.companion.levelUp", { level })
            : visit && displayPhase !== "walking"
              ? t(`workspace.profile.companion.${encounter}`)
              : ""}
        </p>
        <Popover onOpenChange={onMenuOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("workspace.profile.companion.settings")}
            >
              <span className="harbor-companion-badge" aria-hidden="true" />
              {t("workspace.profile.companion.level", { level })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex flex-col gap-3" data-companion-menu="true">
            <p className="text-sm font-medium">{t("workspace.profile.companion.name")}</p>
            <p className="text-muted-foreground text-xs">{t("workspace.profile.companion.hint")}</p>
            <p className="text-xs">
              {t("workspace.profile.companion.levelRule", { count: total })}
            </p>
            <progress
              className="harbor-companion-progress"
              max={100}
              value={progress}
              aria-label={t("workspace.profile.companion.progress")}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEnabled((value) => !value)}>
                {t(
                  enabled
                    ? "workspace.profile.companion.pause"
                    : "workspace.profile.companion.resume"
                )}
              </Button>
              {visit ? (
                <Button variant="ghost" size="sm" onClick={onClear}>
                  {t("workspace.profile.companion.clearDate")}
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {map && targetDate
        ? createPortal(
            <div className="harbor-calendar-companion" {...attributes} aria-hidden="true">
              <div
                ref={positionRef}
                className="harbor-companion-position"
                style={{ left: position.x, top: position.y }}
              >
                <span
                  className="harbor-companion-facing"
                  style={{
                    transform: `scaleX(${displayPhase === "walking" ? facing : position.reverse ? -1 : 1})`,
                  }}
                >
                  <span className="harbor-companion-hero harbor-companion-sprite" />
                  {visit && (encounter === "bug" || encounter === "chest") ? (
                    <span
                      className={`harbor-companion-object harbor-companion-sprite harbor-companion-${encounter}`}
                    />
                  ) : null}
                  {visit && encounter === "rest" ? (
                    <span className="harbor-companion-rest">z</span>
                  ) : null}
                  <span className="harbor-companion-spark">✦</span>
                </span>
              </div>
            </div>,
            map
          )
        : null}
    </>
  );
}
