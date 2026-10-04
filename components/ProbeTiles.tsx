"use client";

// =============================================================================
//  components/ProbeTiles.tsx
//  The probe's three live numbers as tiles, each with the last day's shape
//  behind it. Refresh pulls a genuinely live reading (bypassing the short
//  server cache) without reloading the page.
// =============================================================================

import { useState } from "react";
import Icon from "./Icon";
import Sparkline from "./Sparkline";
import { Callout, Chip, SectionHeader, type Tone } from "./ui";
import type { IopoolPool } from "@/lib/iopool-parse";
import type { TargetRanges } from "@/lib/chemistry";

function freshness(ageMinutes: number | null): string {
  if (ageMinutes === null || ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const h = Math.round(ageMinutes / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function rangeChip(v: number | null, lo: number, hi: number, dangerLo?: number): [string, Tone] {
  if (v === null) return ["No reading", "neutral"];
  if (dangerLo !== undefined && v < dangerLo) return ["Too low", "bad"];
  if (v < lo) return ["Low", "warn"];
  if (v > hi) return ["High", "warn"];
  return ["In range", "good"];
}

export default function ProbeTiles({
  pool: initial,
  ranges,
  soakTargetC,
  history,
}: {
  pool: IopoolPool;
  ranges: TargetRanges;
  soakTargetC: number;
  /** Oldest first, last ~24 hours. */
  history: { temp: number[]; ph: number[]; orp: number[] };
}) {
  const [pool, setPool] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/iopool?fresh=1", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.pool) setPool(data.pool as IopoolPool);
      else setError(data.error || "Couldn't reach your probe just now.");
    } catch {
      setError("Couldn't reach your probe just now.");
    } finally {
      setBusy(false);
    }
  }

  const m = pool.measure;
  const orpMin = ranges.orpMin ?? 650;
  const orpMax = ranges.orpMax ?? 750;
  const [phWord, phTone] = rangeChip(m.ph, ranges.phIdealMin, ranges.phIdealMax);
  const [orpWord, orpTone] = rangeChip(m.orpMv, orpMin, orpMax, orpMin - 100);
  const stale = m.ageMinutes !== null && m.ageMinutes > 6 * 60;

  const tile = "grid min-w-0 content-start gap-1.5 rounded-card border border-line bg-surface px-2.5 pb-2.5 pt-3";
  const value = "num-tabular whitespace-nowrap text-[clamp(20px,6.2vw,25px)] font-extrabold leading-tight";

  return (
    <section className="grid min-w-0 gap-2.5">
      <SectionHeader
        aside={
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="-my-3 inline-flex items-center gap-1.5 py-3 text-sm font-bold text-accent-ink disabled:opacity-60"
            aria-label={`Refresh the probe reading, last read ${freshness(m.ageMinutes)}`}
          >
            <Icon name="refresh" size={16} className={busy ? "anim-spin" : undefined} />
            {freshness(m.ageMinutes)}
          </button>
        }
      >
        From your probe
      </SectionHeader>
      <div className="grid grid-cols-3 gap-2">
        <div className={tile}>
          <span className="text-[12.5px] font-bold text-ink-3">Water</span>
          <span className={value}>
            {m.temperatureC ?? "–"}
            <small className="ml-0.5 text-[13px] font-semibold text-ink-3">°</small>
          </span>
          <Sparkline values={history.temp} />
          <Chip tone="heat" className="justify-center whitespace-normal">
            Aim {soakTargetC}°
          </Chip>
        </div>
        <div className={tile}>
          <span className="text-[12.5px] font-bold text-ink-3">pH</span>
          <span className={value}>{m.ph ?? "–"}</span>
          <Sparkline values={history.ph} band={[ranges.phIdealMin, ranges.phIdealMax]} />
          <Chip tone={phTone} className="justify-center whitespace-normal">
            {phWord}
          </Chip>
        </div>
        <div className={tile}>
          <span className="text-[12.5px] font-bold text-ink-3">ORP</span>
          <span className={value}>
            {m.orpMv ?? "–"}
            <small className="ml-0.5 text-[13px] font-semibold text-ink-3">mV</small>
          </span>
          <Sparkline values={history.orp} band={[orpMin, orpMax]} />
          <Chip tone={orpTone} className="justify-center whitespace-normal">
            {orpWord}
          </Chip>
        </div>
      </div>
      {!m.isValid ? (
        <Callout tone="neutral">This reading is still settling. Give it a little longer.</Callout>
      ) : null}
      {stale ? (
        <Callout tone="warn" icon="alert-triangle">
          This reading is over six hours old. Check the probe is floating and has signal.
        </Callout>
      ) : null}
      {error ? <Callout tone="warn">{error}</Callout> : null}
      {pool.filtrationHours !== null ? (
        <p className="px-0.5 text-[13.5px] text-ink-2">
          iopool suggests about {pool.filtrationHours} h of filtering a day at this temperature.
        </p>
      ) : null}
    </section>
  );
}
