"use client";

// One chart at a time, picked from a row of chips, instead of a page of six.
import { useState } from "react";
import TrendChart, { type TrendSeries } from "./TrendChart";

export default function TrendExplorer({ series }: { series: TrendSeries[] }) {
  const [key, setKey] = useState(series[0]?.key);
  const current = series.find((s) => s.key === key) ?? series[0];
  if (!current) {
    return (
      <p className="text-sm text-ink-2">
        Trends appear once you&apos;ve logged a couple of tests or the probe has a
        few days of history.
      </p>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose a reading">
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={s.key === current.key}
            onClick={() => setKey(s.key)}
            className="min-h-10 rounded-full border border-line bg-surface px-3.5 text-sm font-bold text-ink-2 aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
          >
            {s.label}
          </button>
        ))}
      </div>
      <TrendChart key={current.key} series={current} />
    </div>
  );
}
