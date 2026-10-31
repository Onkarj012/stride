import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { addDays, daysBetween } from "@stride/core";
import { formatDayLabel } from "@/lib/date";
import { weightNumber, weightUnit, type Units } from "@/lib/units";

export type WeightPoint = { localDate: string; kg: number; trendKg: number };

// "Wed, 14 Oct, 78.4 kg, trend 78.1 kg" for one weigh-in, in the user's unit.
export function weightPointText(point: WeightPoint, units: Units): string {
  const unit = weightUnit(units);
  return `${formatDayLabel(point.localDate)}, ${weightNumber(point.kg, units)} ${unit}, trend ${weightNumber(point.trendKg, units)} ${unit}`;
}

// Overview read when the chart is focused as a whole: count, then the latest weigh-in.
export function weightChartLabel(points: readonly WeightPoint[], units: Units): string {
  const latest = points.at(-1);
  if (!latest) return "Weight trend. No weigh-ins yet.";
  const count = points.length === 1 ? "1 weigh-in" : `${points.length} weigh-ins`;
  return `Weight trend, ${count}. Latest ${weightPointText(latest, units)}. Arrow keys read each day.`;
}

function clampIndex(index: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index));
}

const W = 760;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 32, left: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BASE = PAD.top + PLOT_H;

// Weigh-ins as dots and the trend as a line, placed by date so gaps in logging show. Pointer or arrow keys read off a day.
export function WeightChart({ points, from, to, units }: { points: WeightPoint[]; from: string; to: string; units: Units }) {
  const [pointerIndex, setPointerIndex] = useState<number | null>(null);
  const [keyIndex, setKeyIndex] = useState<number | null>(null);
  // A click focuses the chart too. That focus must not pin a reading after the pointer leaves.
  const fromPointer = useRef(false);
  const reduce = useReducedMotion();
  const span = Math.max(1, daysBetween(from, to));
  const values = points.flatMap((p) => [p.kg, p.trendKg]);
  const lo = Math.floor(Math.min(...values) * 2) / 2 - 0.2;
  const hi = Math.ceil(Math.max(...values) * 2) / 2 + 0.2;
  const x = (date: string) => PAD.left + (daysBetween(from, date) / span) * PLOT_W;
  const y = (kg: number) => PAD.top + ((hi - kg) / (hi - lo)) * PLOT_H;
  const xs = points.map((p) => x(p.localDate));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(xs[i] ?? 0).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join(" ");
  const area = `${line} L${(xs.at(-1) ?? 0).toFixed(1)},${BASE} L${(xs[0] ?? 0).toFixed(1)},${BASE} Z`;
  const ticks = [...new Set([hi - 0.2, (hi + lo) / 2, lo + 0.2].map((v) => Math.round(v * 2) / 2))];
  const mid = span > 6 ? addDays(from, Math.round(span / 2)) : null;
  const unit = weightUnit(units);
  const activeIndex = pointerIndex ?? (keyIndex !== null && keyIndex < points.length ? keyIndex : null);
  const active = activeIndex === null ? undefined : points[activeIndex];
  const activeX = activeIndex === null ? 0 : (xs[activeIndex] ?? 0);
  const spoken = keyIndex !== null && keyIndex < points.length ? weightPointText(points[keyIndex], units) : "";

  // Picks the weigh-in nearest the pointer, in chart units.
  function track(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    let best = -1;
    let gap = Infinity;
    xs.forEach((value, i) => {
      const d = Math.abs(value - px);
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    setPointerIndex(best === -1 ? null : best);
  }

  // Moves the keyboard reading. With nothing selected yet, the first arrow lands on the latest day.
  function move(delta: number) {
    const current = keyIndex !== null && keyIndex < points.length ? keyIndex : null;
    const origin = current ?? pointerIndex;
    const next = origin === null ? points.length - 1 : clampIndex(origin + delta, points.length);
    setPointerIndex(null);
    setKeyIndex(next);
  }

  function jump(index: number) {
    setPointerIndex(null);
    setKeyIndex(clampIndex(index, points.length));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      jump(0);
    } else if (event.key === "End") {
      event.preventDefault();
      jump(points.length - 1);
    }
  }

  // Keyboard focus starts on the latest weigh-in. A pointer press does not, so mouse-leave still clears the tip.
  function onFocus() {
    if (fromPointer.current || points.length === 0) return;
    setKeyIndex((current) => (current !== null && current < points.length ? current : points.length - 1));
  }

  function onBlur() {
    fromPointer.current = false;
    setKeyIndex(null);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={points.length === 0 ? undefined : 0}
        role="group"
        aria-roledescription="chart"
        aria-label={weightChartLabel(points, units)}
        className="block h-auto w-full touch-none select-none"
        onPointerDown={() => {
          fromPointer.current = true;
        }}
        onPointerMove={track}
        onPointerLeave={() => setPointerIndex(null)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-line" strokeDasharray="3 5" />
            <text x={PAD.left - 10} y={y(tick) + 4} textAnchor="end" className="fill-ink3 text-[11px] font-medium tabular-nums">
              {weightNumber(tick, units)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={BASE} y2={BASE} className="stroke-line2" />
        {points.length > 1 ? (
          <>
            <path d={area} className="fill-polo opacity-[0.06]" />
            <motion.path
              key={`${from}-${points.length}`}
              d={line}
              fill="none"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-polo"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: [0.2, 0.9, 0.25, 1] }}
            />
          </>
        ) : null}
        {points.map((p, i) => (
          <circle
            key={p.localDate}
            cx={xs[i]}
            cy={y(p.kg)}
            r={activeIndex === i ? 4.5 : 3.2}
            className={activeIndex === i ? "fill-ink" : "fill-ink3 opacity-60"}
          />
        ))}
        {active ? (
          <g pointerEvents="none">
            <line x1={activeX} x2={activeX} y1={PAD.top} y2={BASE} className="stroke-ink opacity-30" />
            <circle cx={activeX} cy={y(active.trendKg)} r={5.5} strokeWidth={2.5} className="fill-card stroke-polo" />
          </g>
        ) : null}
        <text x={PAD.left} y={H - 8} className="fill-ink3 text-[11px] font-medium">
          {formatDayLabel(from)}
        </text>
        {mid ? (
          <text x={x(mid)} y={H - 8} textAnchor="middle" className="fill-ink3 text-[11px] font-medium">
            {formatDayLabel(mid)}
          </text>
        ) : null}
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-ink3 text-[11px] font-medium">
          {formatDayLabel(to)}
        </text>
      </svg>
      {spoken ? (
        <p className="sr-only" role="status" aria-atomic="true">
          {spoken}
        </p>
      ) : null}
      {active ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-3 py-2 text-bg shadow-toast"
          style={{
            left: `${Math.min(88, Math.max(12, (activeX / W) * 100))}%`,
            top: `calc(${(Math.min(y(active.kg), y(active.trendKg)) / H) * 100}% - 12px)`,
          }}
        >
          <p className="type-label whitespace-nowrap opacity-70">{formatDayLabel(active.localDate)}</p>
          <p className="type-value whitespace-nowrap tabular-nums">
            {weightNumber(active.kg, units)} {unit}
            <span className="ml-2 type-caption opacity-70">
              trend {weightNumber(active.trendKg, units)}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

