import { daysBetween } from "@stride/core";
import { formatDayLabel } from "@/lib/date";
import { weightNumber, weightUnit, type Units } from "@/lib/units";

export type WeightPoint = { localDate: string; kg: number; trendKg: number };

const W = 640;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 44 };

// Weigh-ins as dots and the trend as a line, placed by date so gaps in logging show.
export function WeightChart({ points, from, to, units }: { points: WeightPoint[]; from: string; to: string; units: Units }) {
  const span = Math.max(1, daysBetween(from, to));
  const values = points.flatMap((p) => [p.kg, p.trendKg]);
  const lo = Math.floor(Math.min(...values) * 2) / 2 - 0.2;
  const hi = Math.ceil(Math.max(...values) * 2) / 2 + 0.2;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (date: string) => PAD.left + (daysBetween(from, date) / span) * plotW;
  const y = (kg: number) => PAD.top + ((hi - kg) / (hi - lo)) * plotH;
  const line = `M${points.map((p) => `${x(p.localDate).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join(" L")}`;
  const unit = weightUnit(units);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight trend chart" className="h-auto w-full">
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top} y2={PAD.top} className="stroke-line" />
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="stroke-line" />
      <text x={PAD.left - 8} y={PAD.top + 4} textAnchor="end" className="fill-ink3 text-[11px]">
        {weightNumber(hi, units)}
      </text>
      <text x={PAD.left - 8} y={PAD.top + plotH} textAnchor="end" className="fill-ink3 text-[11px]">
        {weightNumber(lo, units)}
      </text>
      {points.length > 1 ? (
        <path d={line} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-polo" />
      ) : null}
      {points.map((p) => (
        <circle key={p.localDate} cx={x(p.localDate)} cy={y(p.kg)} r={3} className="fill-ink3">
          <title>{`${formatDayLabel(p.localDate)}: ${weightNumber(p.kg, units)} ${unit}`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={H - 6} className="fill-ink3 text-[11px]">
        {formatDayLabel(from)}
      </text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-ink3 text-[11px]">
        {formatDayLabel(to)}
      </text>
    </svg>
  );
}
