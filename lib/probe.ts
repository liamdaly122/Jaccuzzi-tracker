// =============================================================================
//  lib/probe.ts
//  PURE helpers for working with stored probe history. No I/O.
//
//  The probe produces far more points than a strip ever could, which is great
//  for spotting trends but needs three things before it's useful:
//    - adapting into the shape lib/predict.ts already understands,
//    - thinning out for charts (a month of readings is hundreds of points),
//    - and reading the slow ORP decline that means the water is tiring.
// =============================================================================

import { linearTrend } from "./predict";
import type { ForecastReading } from "./predict";
import type { SpaConfig } from "./chemistry";

export interface ProbeRow {
  measured_at: string;
  ph: number | string | null;
  orp_mv: number | string | null;
  temperature_c: number | string | null;
  is_valid?: boolean;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Only trust readings the probe itself considered settled.
export function validRows(rows: ProbeRow[]): ProbeRow[] {
  return rows.filter((r) => r.is_valid !== false);
}

// -----------------------------------------------------------------------------
// Adapt probe rows into the reading shape lib/predict.ts already consumes, so
// buildForecasts works on probe data without changing the forecasting code.
// Alkalinity/sanitiser-ppm are genuinely unknown here and stay null.
// -----------------------------------------------------------------------------
export function toForecastReadings(rows: ProbeRow[]): ForecastReading[] {
  return validRows(rows).map((r) => ({
    recorded_at: r.measured_at,
    ph: num(r.ph),
    free_chlorine_ppm: null,
    bromine_ppm: null,
    total_alkalinity_ppm: null,
  }));
}

export interface DailyPoint {
  date: string; // ISO timestamp at the midpoint of that day's readings
  ph: number | null;
  orpMv: number | null;
  temperatureC: number | null;
  count: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// -----------------------------------------------------------------------------
// One median point per calendar day. Medians (not means) so a single wild
// reading while the probe is out of the water can't drag the day's value.
// Returned oldest -> newest, which is what TrendChart expects.
// -----------------------------------------------------------------------------
export function downsampleDaily(rows: ProbeRow[]): DailyPoint[] {
  const byDay = new Map<string, ProbeRow[]>();
  for (const r of validRows(rows)) {
    const t = new Date(r.measured_at).getTime();
    if (!Number.isFinite(t)) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(r);
    byDay.set(day, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const pick = (f: (r: ProbeRow) => number | null) => {
        const vals = list.map(f).filter((v): v is number => v !== null);
        return vals.length ? Math.round(median(vals) * 100) / 100 : null;
      };
      return {
        date: `${day}T12:00:00.000Z`,
        ph: pick((r) => num(r.ph)),
        orpMv: pick((r) => num(r.orp_mv)),
        temperatureC: pick((r) => num(r.temperature_c)),
        count: list.length,
      };
    });
}

// -----------------------------------------------------------------------------
// ORP drift. A steady decline in sanitiser effectiveness WHILE pH is behaving
// is the stabiliser-buildup signature: dichlor keeps adding cyanuric acid, which
// suppresses ORP, so eventually no amount of chemical restores it and the water
// needs changing. If pH is drifting too, pH is the likelier culprit and we say
// so rather than blaming the water.
// -----------------------------------------------------------------------------
export const DRIFT_MIN_DAYS = 5;
export const DRIFT_MIN_POINTS = 5;
export const DRIFT_MV_PER_DAY = -3; // sustained decline worth acting on

export interface OrpDrift {
  slopePerDay: number | null;
  declining: boolean;
  /** True only when ORP is sagging AND pH is steady and in range. */
  likelyStabiliserBuildup: boolean;
  message: string | null;
}

export function orpDrift(rows: ProbeRow[], config: SpaConfig): OrpDrift {
  const daily = downsampleDaily(rows);
  const orpPoints = daily
    .filter((d) => d.orpMv !== null)
    .map((d) => ({ date: d.date, value: d.orpMv as number }));

  if (orpPoints.length < DRIFT_MIN_POINTS) {
    return {
      slopePerDay: null,
      declining: false,
      likelyStabiliserBuildup: false,
      message: null,
    };
  }

  const spanDays =
    (new Date(orpPoints[orpPoints.length - 1].date).getTime() -
      new Date(orpPoints[0].date).getTime()) /
    (24 * 60 * 60 * 1000);
  if (spanDays < DRIFT_MIN_DAYS) {
    return {
      slopePerDay: null,
      declining: false,
      likelyStabiliserBuildup: false,
      message: null,
    };
  }

  const trend = linearTrend(orpPoints);
  if (!trend) {
    return {
      slopePerDay: null,
      declining: false,
      likelyStabiliserBuildup: false,
      message: null,
    };
  }

  const slope = trend.slopePerDay;
  const declining = slope <= DRIFT_MV_PER_DAY;

  // Is pH steady and in range over the same window?
  const phPoints = daily
    .filter((d) => d.ph !== null)
    .map((d) => ({ date: d.date, value: d.ph as number }));
  const latestPh = phPoints.length ? phPoints[phPoints.length - 1].value : null;
  const phInRange =
    latestPh !== null &&
    latestPh >= config.targetRanges.phIdealMin &&
    latestPh <= config.targetRanges.phIdealMax;

  const likelyStabiliserBuildup = declining && phInRange;

  let message: string | null = null;
  if (likelyStabiliserBuildup) {
    message =
      `Your sanitiser has been getting weaker by about ${Math.abs(Math.round(slope))} mV a day ` +
      "even though pH is fine. That's usually stabiliser building up in the water — " +
      "fresh water fixes it, more chemical won't.";
  } else if (declining) {
    message =
      `Sanitiser strength is drifting down (about ${Math.abs(Math.round(slope))} mV a day). ` +
      "Check your pH first — high pH weakens sanitiser and often explains this on its own.";
  }

  return {
    slopePerDay: Math.round(slope * 10) / 10,
    declining,
    likelyStabiliserBuildup,
    message,
  };
}
