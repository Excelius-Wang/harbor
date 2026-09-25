import type { Encounter } from "./github-calendar-companion";
import { useLayoutEffect, useRef } from "react";

type Landing = { x: number; y: number; date: string; period: string };

export function columnTravel(from: Landing, to: Landing) {
  const days = Math.abs(Date.parse(to.date) - Date.parse(from.date)) / 86_400_000;
  return from.period === to.period &&
    (days === 1 || days === 7) &&
    Math.hypot(to.x - from.x, to.y - from.y) <= 80
    ? "hop"
    : "fade";
}

// The foot anchor follows the rendered top polygon, including refreshed heights and reflow.
export function CalendarColumnResident({
  map,
  date,
  period,
  revision,
  active,
  reduced,
  encounter,
  phase = "idle",
}: {
  map: HTMLDivElement;
  date: string;
  period: string;
  revision?: string;
  active: boolean;
  reduced: boolean;
  encounter?: Encounter;
  phase?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const object = useRef<HTMLDivElement>(null);
  const hasObject = encounter === "bug" || encounter === "chest";
  const previous = useRef<Landing | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const marker = element.current;
    if (!marker) return;
    const measure = () => {
      const top = map.querySelector(`[data-contribution-day="${date}"] .harbor-contribution-top`);
      if (!top) {
        marker.style.visibility = "hidden";
        return;
      }
      const bounds = map.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const scaleX = map.offsetWidth / bounds.width;
      const scaleY = map.offsetHeight / bounds.height;
      const face = top.getBoundingClientRect();
      const landing = {
        x:
          (face.left + face.width * (period !== "year" && hasObject ? 0.32 : 0.5) - bounds.left) *
          scaleX,
        y: (face.top + face.height / 2 - bounds.top) * scaleY,
        date,
        period,
      };
      if (object.current) {
        object.current.style.left = `${(face.left + face.width * 0.77 - bounds.left) * scaleX}px`;
        object.current.style.top = `${landing.y}px`;
        object.current.style.visibility = "visible";
      }
      const last = previous.current;
      if (
        last &&
        last.x === landing.x &&
        last.y === landing.y &&
        last.date === date &&
        last.period === period
      )
        return;
      // Capture the in-flight visual position before replacing a destination.
      const current = marker.getBoundingClientRect();
      const fromX = (current.left + current.width / 2 - bounds.left) * scaleX;
      const fromY = (current.top + current.height * 0.98 - bounds.top) * scaleY;
      animation.current?.cancel();
      marker.style.left = `${landing.x}px`;
      marker.style.top = `${landing.y}px`;
      marker.style.visibility = "visible";
      marker.dataset.travel = "none";
      if (
        last &&
        last.date !== date &&
        last.period === period &&
        active &&
        !reduced &&
        marker.animate
      ) {
        const dx = fromX - landing.x;
        const dy = fromY - landing.y;
        const travel = columnTravel({ ...last, x: fromX, y: fromY }, landing);
        marker.dataset.travel = travel;
        animation.current = marker.animate(
          travel === "hop"
            ? [
                { transform: `translate(${dx}px, ${dy}px)` },
                { transform: `translate(${dx / 2}px, ${Math.min(dy, 0) - 14}px)`, offset: 0.5 },
                { transform: "translate(0, 0)" },
              ]
            : [
                { transform: `translate(${dx}px, ${dy}px)`, opacity: 1 },
                { transform: `translate(${dx}px, ${dy}px)`, opacity: 0, offset: 0.35 },
                { transform: "translate(0, -6px)", opacity: 0, offset: 0.36 },
                { transform: "translate(0, 0)", opacity: 1 },
              ],
          { duration: 180, easing: "ease-in-out" }
        );
      }
      previous.current = landing;
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(map);
    return () => observer?.disconnect();
  }, [map, date, period, revision, active, reduced, hasObject]);

  useLayoutEffect(() => {
    if (!animation.current || ["finished", "idle"].includes(animation.current.playState)) return;
    if (reduced) animation.current?.cancel();
    else if (active && animation.current.playState === "paused") animation.current.play();
    else if (!active && animation.current.playState === "running") animation.current.pause();
  }, [active, reduced]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);

  return (
    <>
      {hasObject ? (
        <div
          ref={object}
          className="harbor-column-object-anchor"
          data-kind={encounter}
          data-complete={phase === "idle" || phase === "reward"}
          style={{ visibility: "hidden" }}
        >
          <span
            className={`harbor-companion-object harbor-companion-sprite harbor-companion-${encounter}`}
          />
          <span className="harbor-column-event-mark">{encounter === "chest" ? "◇" : "•"}</span>
        </div>
      ) : null}
      <div ref={element} className="harbor-companion-position" style={{ visibility: "hidden" }}>
        <span className="harbor-companion-contact" />
        <span className="harbor-companion-hero harbor-companion-sprite" />
        {phase === "reward" ? <span className="harbor-companion-spark">✦</span> : null}
      </div>
    </>
  );
}
