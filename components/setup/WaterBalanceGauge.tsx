// =============================================================================
//  components/setup/WaterBalanceGauge.tsx
//  A band gauge: one horizontal track per metric with the ideal zone tinted and
//  a marker at the current value. Turns three abstract numbers into a picture
//  you can read in a glance ("am I inside the green?").
//
//  Dependency-free inline SVG, matching components/TrendChart.tsx's approach.
//  Status is encoded THREE ways — marker position, colour, AND an icon+label —
//  because a status colour must never carry meaning on its own (the warning
//  step is deliberately sub-3:1 on a light surface; the label is the fix).
// =============================================================================

import Icon from "@/components/Icon";
import type { IconName } from "@/lib/icons";

// Ink / surface tokens — text never wears the status colour.
const INK = "#334155"; // slate-700
const MUTED = "#94a3b8"; // slate-400
const TRACK = "#e2e8f0"; // slate-200
// Fixed status palette (never themed).
const GOOD = "#0ca30c";
const WARNING = "#fab219";
const CRITICAL = "#d03b3b";
const BAND = "rgba(12,163,12,0.14)";
const BAND_EDGE = "rgba(12,163,12,0.40)";

export interface GaugeMetric {
  label: string;
  value: number | null;
  min: number; // ideal band lower bound
  max: number; // ideal band upper bound
  // Axis extent — the plausible range the track spans.
  floor: number;
  ceiling: number;
  unit?: string;
  decimals?: number;
}

function statusOf(m: GaugeMetric): {
  tone: string;
  label: string;
  icon: IconName;
  textClass: string;
} {
  if (m.value === null) {
    return {
      tone: MUTED,
      label: "Not tested",
      icon: "search",
      textClass: "text-slate-400",
    };
  }
  if (m.value < m.min)
    return {
      tone: m.value < m.floor + (m.min - m.floor) / 3 ? CRITICAL : WARNING,
      label: "Too low",
      icon: "alert-triangle",
      textClass: "text-amber-700",
    };
  if (m.value > m.max)
    return {
      tone: m.value > m.max + (m.ceiling - m.max) / 2 ? CRITICAL : WARNING,
      label: "Too high",
      icon: "alert-triangle",
      textClass: "text-amber-700",
    };
  return {
    tone: GOOD,
    label: "In range",
    icon: "check-circle",
    textClass: "text-emerald-700",
  };
}

function GaugeRow({ metric }: { metric: GaugeMetric }) {
  const { label, value, min, max, floor, ceiling, unit = "", decimals = 1 } = metric;
  const status = statusOf(metric);

  const W = 300;
  const H = 30;
  const padX = 6;
  const trackY = 15;
  const plotW = W - padX * 2;

  const span = ceiling - floor || 1;
  const x = (v: number) =>
    padX + Math.min(1, Math.max(0, (v - floor) / span)) * plotW;

  const bandX = x(min);
  const bandW = Math.max(2, x(max) - x(min));
  const fmt = (v: number) => v.toFixed(decimals).replace(/\.0$/, "");

  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <span className="num-tabular text-sm font-semibold text-slate-800">
          {value === null ? "—" : `${fmt(value)}${unit ? ` ${unit}` : ""}`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${label}: ${
          value === null ? "not tested" : `${fmt(value)}${unit}`
        }, ideal ${fmt(min)} to ${fmt(max)}${unit}. ${status.label}.`}
      >
        {/* Recessive track */}
        <rect
          x={padX}
          y={trackY - 3}
          width={plotW}
          height={6}
          rx={3}
          fill={TRACK}
        />
        {/* Ideal zone */}
        <rect
          x={bandX}
          y={trackY - 6}
          width={bandW}
          height={12}
          rx={3}
          fill={BAND}
        />
        <line
          x1={bandX}
          x2={bandX}
          y1={trackY - 7}
          y2={trackY + 7}
          stroke={BAND_EDGE}
        />
        <line
          x1={bandX + bandW}
          x2={bandX + bandW}
          y1={trackY - 7}
          y2={trackY + 7}
          stroke={BAND_EDGE}
        />

        {/* Marker — 2px surface ring so it reads over the band */}
        {value !== null ? (
          <circle
            cx={x(value)}
            cy={trackY}
            r={6}
            fill={status.tone}
            stroke="#ffffff"
            strokeWidth={2}
            className="anim-marker"
          />
        ) : null}

        {/* Range ticks */}
        <text x={padX} y={H - 1} fontSize={9} fill={MUTED}>
          {fmt(floor)}
        </text>
        <text x={padX + plotW} y={H - 1} fontSize={9} fill={MUTED} textAnchor="end">
          {fmt(ceiling)}
        </text>
        <text
          x={bandX + bandW / 2}
          y={H - 1}
          fontSize={9}
          fill={INK}
          textAnchor="middle"
        >
          ideal {fmt(min)}–{fmt(max)}
        </text>
      </svg>

      {/* Status never rides on colour alone: icon + word, in ink-safe text. */}
      <p
        className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${status.textClass}`}
      >
        <Icon name={status.icon} size={13} />
        {status.label}
      </p>
    </div>
  );
}

export default function WaterBalanceGauge({
  metrics,
  title = "Your water right now",
}: {
  metrics: GaugeMetric[];
  title?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="space-y-3.5">
        {metrics.map((m) => (
          <GaugeRow key={m.label} metric={m} />
        ))}
      </div>
    </div>
  );
}
