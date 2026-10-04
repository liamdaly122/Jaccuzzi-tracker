"use client";

// =============================================================================
//  components/TrendChart.tsx
//  One metric over time: a 2px line over its ideal band, the latest value
//  labelled at the end, and a crosshair that snaps to the nearest reading under
//  a finger or the pointer (arrow keys too). Points sit on a TIME axis, so a
//  gap of four days looks like four days. Every value is also reachable as a
//  table, so the tooltip never gates anything.
// =============================================================================

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";

export interface TrendPoint {
  date: string; // ISO
  value: number | null;
}

export interface TrendSeries {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  /** The "aim for" band, when there is one. */
  band?: [number, number] | null;
  /** A single target line instead of a band (e.g. soak temperature). */
  target?: number | null;
  points: TrendPoint[];
  /** Where the numbers came from, shown under the chart. */
  source: string;
  /** "day" labels as 21 Sep; "time" as 14:00 (for a 24-hour view). */
  dateFormat?: "day" | "time";
}

const W = 340;
const H = 168;
const L = 8;
const R = 46;
const T = 16;
const B = 24;

export default function TrendChart({ series }: { series: TrendSeries }) {
  const svg = useRef<SVGSVGElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const data = useMemo(
    () =>
      series.points
        .filter((p): p is { date: string; value: number } => p.value !== null)
        .map((p) => ({ ...p, t: new Date(p.date).getTime() }))
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t),
    [series.points],
  );

  const label = (iso: string) =>
    format(new Date(iso), series.dateFormat === "time" ? "HH:mm" : "d MMM");
  const fmt = (v: number) => `${v.toFixed(series.decimals)}${series.unit}`;

  if (data.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-ink-3">
        Not enough readings yet to draw a trend.
      </p>
    );
  }

  const extra = [
    ...(series.band ?? []),
    ...(series.target != null ? [series.target] : []),
  ];
  let lo = Math.min(...data.map((d) => d.value), ...extra);
  let hi = Math.max(...data.map((d) => d.value), ...extra);
  const pad = (hi - lo) * 0.18 || 1;
  lo -= pad;
  hi += pad;
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.value).toFixed(1)}`).join("");
  const area = `${line}L${x(t1).toFixed(1)},${H - B}L${x(t0).toFixed(1)},${H - B}Z`;
  const last = data[data.length - 1];

  function nearest(clientX: number) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const vx = ((clientX - box.left) / box.width) * W;
    let best = 0;
    data.forEach((d, i) => {
      if (Math.abs(x(d.t) - vx) < Math.abs(x(data[best].t) - vx)) best = i;
    });
    setIdx(best);
  }

  const sel = idx === null ? null : data[idx];
  const scale = svg.current ? svg.current.getBoundingClientRect().width / W : 1;

  return (
    <div>
      <div className="relative mt-3">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y outline-offset-4"
          role="img"
          tabIndex={0}
          aria-label={`${series.label}, latest ${fmt(last.value)}. Use the arrow keys to read each point.`}
          onPointerMove={(e) => nearest(e.clientX)}
          onPointerDown={(e) => nearest(e.clientX)}
          onPointerLeave={() => setIdx(null)}
          onFocus={() => setIdx(data.length - 1)}
          onBlur={() => setIdx(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setIdx((i) => Math.max(0, (i ?? data.length - 1) - 1));
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setIdx((i) => Math.min(data.length - 1, (i ?? 0) + 1));
            }
          }}
        >
          {series.band ? (
            <>
              <rect
                className="fill-good-soft"
                x={L}
                y={y(series.band[1])}
                width={W - L - R}
                height={Math.max(0, y(series.band[0]) - y(series.band[1]))}
              />
              <line className="stroke-good/50" x1={L} x2={W - R} y1={y(series.band[1])} y2={y(series.band[1])} />
              <line className="stroke-good/50" x1={L} x2={W - R} y1={y(series.band[0])} y2={y(series.band[0])} />
              <text className="fill-good-ink text-[11px] font-bold" x={L + 4} y={y(series.band[1]) - 4}>
                Aim {series.band[0].toFixed(series.decimals)}–{series.band[1].toFixed(series.decimals)}
                {series.unit}
              </text>
            </>
          ) : null}
          {series.target != null ? (
            <>
              <line className="stroke-heat" strokeWidth={1.5} x1={L} x2={W - R} y1={y(series.target)} y2={y(series.target)} />
              <text className="fill-heat-ink text-[11px] font-bold" x={L + 4} y={y(series.target) - 5}>
                Soak target {series.target}
                {series.unit}
              </text>
            </>
          ) : null}
          <line className="stroke-line" x1={L} x2={W - R} y1={H - B} y2={H - B} />
          <path className="fill-accent/10" d={area} />
          <path className="fill-none stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" d={line} />
          <circle className="fill-accent stroke-surface" strokeWidth={2} cx={x(last.t)} cy={y(last.value)} r={4.5} />
          <text className="fill-ink text-[12px] font-extrabold" x={x(last.t) + 8} y={y(last.value) + 4}>
            {last.value.toFixed(series.decimals)}
          </text>
          <text className="fill-ink-3 text-[11px]" x={L} y={H - 6}>
            {label(data[0].date)}
          </text>
          <text className="fill-ink-3 text-[11px]" x={W - R} y={H - 6} textAnchor="end">
            {label(last.date)}
          </text>
          {sel ? (
            <>
              <line className="stroke-ink-3" x1={x(sel.t)} x2={x(sel.t)} y1={T} y2={H - B} />
              <circle className="fill-accent stroke-surface" strokeWidth={2} cx={x(sel.t)} cy={y(sel.value)} r={5} />
            </>
          ) : null}
        </svg>
        {sel ? (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-[105%] whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] leading-tight text-bg"
            style={{
              left: `${Math.min(W * scale - 44, Math.max(44, x(sel.t) * scale))}px`,
              top: `${y(sel.value) * scale - 8}px`,
            }}
          >
            <b className="text-sm">{fmt(sel.value)}</b>
            <br />
            {format(new Date(sel.date), series.dateFormat === "time" ? "EEE HH:mm" : "EEE d MMM, HH:mm")}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13.5px] text-ink-2">{series.source}</span>
        <button
          type="button"
          className="-my-2.5 py-2.5 text-sm font-bold text-accent-ink"
          onClick={() => setTable((v) => !v)}
          aria-expanded={table}
        >
          {table ? "Hide table" : "Show as table"}
        </button>
      </div>
      {table ? (
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-ink-3">
                <th scope="col" className="py-1.5 font-semibold">When</th>
                <th scope="col" className="py-1.5 text-right font-semibold">{series.label}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1.5">{format(new Date(d.date), "EEE d MMM, HH:mm")}</td>
                  <td className="num-tabular py-1.5 text-right">{fmt(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
