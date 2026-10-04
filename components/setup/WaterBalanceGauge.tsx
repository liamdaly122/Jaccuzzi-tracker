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

// Colours come from the theme tokens, so the gauge follows light and dark.

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
  fill: string;
  label: string;
  icon: IconName;
  textClass: string;
} {
  if (m.value === null) {
    return {
      fill: "fill-ink-3",
      label: "Not tested",
      icon: "search",
      textClass: "text-ink-3",
    };
  }
  if (m.value < m.min)
    return {
      fill: m.value < m.floor + (m.min - m.floor) / 3 ? "fill-bad" : "fill-warn",
      label: "Too low",
      icon: "alert-triangle",
      textClass: "text-warn-ink",
    };
  if (m.value > m.max)
    return {
      fill: m.value > m.max + (m.ceiling - m.max) / 2 ? "fill-bad" : "fill-warn",
      label: "Too high",
      icon: "alert-triangle",
      textClass: "text-warn-ink",
    };
  return {
    fill: "fill-good",
    label: "In range",
    icon: "check-circle",
    textClass: "text-good-ink",
  };
}

function GaugeRow({ metric }: { metric: GaugeMetric }) {
  const { label, value, min, max, floor, ceiling, unit = "", decimals = 1 } = metric;
  const status = statusOf(metric);

  const W = 300;
  const H = 34;
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
        <span className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
          {label}
        </span>
        <span className="num-tabular text-[15px] font-extrabold">
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
          className="fill-track"
        />
        {/* Ideal zone */}
        <rect
          x={bandX}
          y={trackY - 6}
          width={bandW}
          height={12}
          rx={3}
          className="fill-good/15"
        />
        <line
          x1={bandX}
          x2={bandX}
          y1={trackY - 7}
          y2={trackY + 7}
          className="stroke-good/40"
        />
        <line
          x1={bandX + bandW}
          x2={bandX + bandW}
          y1={trackY - 7}
          y2={trackY + 7}
          className="stroke-good/40"
        />

        {/* Marker — 2px surface ring so it reads over the band */}
        {value !== null ? (
          <circle
            cx={x(value)}
            cy={trackY}
            r={6}
            strokeWidth={2}
            className={`anim-marker stroke-surface ${status.fill}`}
          />
        ) : null}

        {/* Range ticks */}
        <text x={padX} y={H - 1} fontSize={11} className="fill-ink-3">
          {fmt(floor)}
        </text>
        <text x={padX + plotW} y={H - 1} fontSize={11} className="fill-ink-3" textAnchor="end">
          {fmt(ceiling)}
        </text>
        <text
          x={bandX + bandW / 2}
          y={H - 1}
          fontSize={11}
          className="fill-ink-2"
          textAnchor="middle"
        >
          ideal {fmt(min)}–{fmt(max)}
        </text>
      </svg>

      {/* Status never rides on colour alone: icon + word, in ink-safe text. */}
      <p
        className={`mt-0.5 flex items-center gap-1 text-[13px] font-bold ${status.textClass}`}
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
    <div className="rounded-card border border-line bg-surface p-4">
      <h3 className="mb-3 text-[15px] font-extrabold">{title}</h3>
      <div className="space-y-3.5">
        {metrics.map((m) => (
          <GaugeRow key={m.label} metric={m} />
        ))}
      </div>
    </div>
  );
}
