// Presentational, dependency-free line chart for a single metric over time.
// Pure SVG (no chart library) so it stays self-contained and CSP-safe. Renders
// server-side. Change-over-time is the data's job -> a line; single series, so
// no legend (the title names it). An "ideal" band gives context, and points
// outside it are amber (reinforced by position, so never colour-alone).
import { format } from "date-fns";

export interface TrendPoint {
  date: string; // ISO
  value: number | null;
}

interface Props {
  title: string;
  points: TrendPoint[]; // ordered oldest -> newest
  idealMin: number;
  idealMax: number;
  unit?: string;
  decimals?: number;
}

// Ink / surface tokens (light mode) — text never wears the series colour.
const INK = "#334155"; // slate-700
const MUTED = "#94a3b8"; // slate-400
const GRID = "#e2e8f0"; // slate-200
const LINE = "#2385f0"; // brand-600 (the single series)
const IN_RANGE = "#2385f0"; // brand-600
const OUT_RANGE = "#f59e0b"; // amber-500 (status; position also signals it)
const BAND = "rgba(16,185,129,0.12)"; // emerald tint = "good zone"
const BAND_EDGE = "rgba(16,185,129,0.35)";

export default function TrendChart({
  title,
  points,
  idealMin,
  idealMax,
  unit = "",
  decimals = 1,
}: Props) {
  const data = points.filter(
    (p): p is { date: string; value: number } => p.value !== null,
  );

  if (data.length < 2) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 font-semibold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-400">
          Log at least two readings to see a trend here.
        </p>
      </div>
    );
  }

  const W = 340;
  const H = 150;
  const padL = 8;
  const padR = 44;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = data.map((d) => d.value);
  let yMin = Math.min(...values, idealMin);
  let yMax = Math.max(...values, idealMax);
  const span = yMax - yMin || 1;
  yMin -= span * 0.12;
  yMax += span * 0.12;

  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const bandTop = y(idealMax);
  const bandBottom = y(idealMin);

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(" ");

  const last = data[n - 1];
  const fmt = (v: number) => v.toFixed(decimals);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <span className="text-xs text-slate-400">
          ideal {fmt(idealMin)}–{fmt(idealMax)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${title} over time, latest ${fmt(last.value)}${unit}`}
      >
        {/* Ideal band */}
        <rect
          x={padL}
          y={bandTop}
          width={plotW}
          height={Math.max(0, bandBottom - bandTop)}
          fill={BAND}
        />
        <line x1={padL} x2={padL + plotW} y1={bandTop} y2={bandTop} stroke={BAND_EDGE} strokeWidth={1} />
        <line x1={padL} x2={padL + plotW} y1={bandBottom} y2={bandBottom} stroke={BAND_EDGE} strokeWidth={1} />

        {/* Baseline */}
        <line
          x1={padL}
          x2={padL + plotW}
          y1={padT + plotH}
          y2={padT + plotH}
          stroke={GRID}
          strokeWidth={1}
        />

        {/* Series line */}
        <path d={linePath} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Points (white ring; amber if out of ideal range) */}
        {data.map((d, i) => {
          const outOfRange = d.value < idealMin || d.value > idealMax;
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(d.value)}
              r={4}
              fill={outOfRange ? OUT_RANGE : IN_RANGE}
              stroke="#ffffff"
              strokeWidth={1.5}
            >
              <title>
                {format(new Date(d.date), "d MMM")}: {fmt(d.value)}
                {unit ? ` ${unit}` : ""}
              </title>
            </circle>
          );
        })}

        {/* Direct label on the latest value */}
        <text x={x(n - 1) + 6} y={y(last.value) + 3} fontSize={11} fill={INK} fontWeight={600}>
          {fmt(last.value)}
        </text>

        {/* First / last date ticks */}
        <text x={padL} y={H - 6} fontSize={10} fill={MUTED}>
          {format(new Date(data[0].date), "d MMM")}
        </text>
        <text x={padL + plotW} y={H - 6} fontSize={10} fill={MUTED} textAnchor="end">
          {format(new Date(last.date), "d MMM")}
        </text>
      </svg>
    </div>
  );
}
