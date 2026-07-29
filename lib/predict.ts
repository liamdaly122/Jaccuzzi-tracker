// =============================================================================
//  lib/predict.ts
//  Pure forecasting from reading history. NO I/O, unit-testable.
//
//  The idea: fit a straight line to recent readings for each metric, work out
//  which way it's heading and how fast, and warn if it will cross out of the
//  safe range soon. This turns the app from "tells you it's wrong" into "tells
//  you before it goes wrong".
// =============================================================================

import type { SpaConfig } from "./chemistry";

export type ForecastSeverity = "info" | "warning";
export type ForecastDirection = "rising" | "falling";

export interface TrendPointInput {
  date: string | Date;
  value: number | null;
}

export interface Trend {
  slopePerDay: number; // change in value per day (can be negative)
  latestValue: number;
  latestDate: Date;
  count: number; // how many points fed the fit
}

export interface Forecast {
  metric: string; // human label, e.g. "Chlorine"
  key: string; // stable key, e.g. "sanitizer"
  direction: ForecastDirection;
  slopePerDay: number;
  daysUntil: number; // whole days until it crosses out of range
  threshold: number; // the range edge it will cross
  message: string;
  severity: ForecastSeverity;
}

// Warn only when a crossing is predicted within this many days...
export const FORECAST_HORIZON_DAYS = 5;
// ...and only with at least this many readings (a line needs a few points).
export const MIN_POINTS_FOR_TREND = 3;
// Ignore trends flatter than this (per day) as noise.
const MIN_SLOPE_PER_DAY = 1e-6;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

// Least-squares line fit over (dayOffset, value). Returns null if there aren't
// enough real points or all points share the same time (no time spread).
export function linearTrend(points: TrendPointInput[]): Trend | null {
  const clean = points
    .filter((p): p is { date: string | Date; value: number } => p.value !== null)
    .map((p) => ({ t: toDate(p.date).getTime(), value: p.value }))
    .sort((a, b) => a.t - b.t);

  if (clean.length < MIN_POINTS_FOR_TREND) return null;

  const t0 = clean[0].t;
  // x in days since the first point, y = value.
  const xs = clean.map((p) => (p.t - t0) / MS_PER_DAY);
  const ys = clean.map((p) => p.value);
  const n = clean.length;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null; // all readings at the same instant

  const slopePerDay = num / den;
  return {
    slopePerDay,
    latestValue: ys[n - 1],
    latestDate: new Date(clean[n - 1].t),
    count: n,
  };
}

// Whole days until `latestValue` crosses below `min` or above `max`, following
// the slope's direction. Returns null if stable, or already/heading the other
// way (i.e. moving back INTO range doesn't warrant a warning).
export function daysUntilCrossing(
  latestValue: number,
  slopePerDay: number,
  min: number,
  max: number,
): { days: number; threshold: number; direction: ForecastDirection } | null {
  if (Math.abs(slopePerDay) < MIN_SLOPE_PER_DAY) return null;

  if (slopePerDay < 0) {
    // Falling → will it drop below min?
    if (latestValue <= min) return null; // already at/below; not a *future* crossing
    const days = (latestValue - min) / -slopePerDay;
    return { days, threshold: min, direction: "falling" };
  }
  // Rising → will it climb above max?
  if (latestValue >= max) return null;
  const days = (max - latestValue) / slopePerDay;
  return { days, threshold: max, direction: "rising" };
}

interface MetricSpec {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  points: TrendPointInput[];
  decimals: number;
}

function forecastMetric(spec: MetricSpec): Forecast | null {
  const trend = linearTrend(spec.points);
  if (!trend) return null;

  // Only forecast when the latest reading is currently IN range — "fine now but
  // trending out". If it's already out of range, the live calculator on the
  // latest reading covers it, so a forecast would be redundant/confusing.
  if (trend.latestValue < spec.min || trend.latestValue > spec.max) return null;

  const crossing = daysUntilCrossing(
    trend.latestValue,
    trend.slopePerDay,
    spec.min,
    spec.max,
  );
  if (!crossing) return null;

  const days = Math.max(0, Math.round(crossing.days));
  if (days > FORECAST_HORIZON_DAYS) return null;

  const ratePerDay = Math.abs(trend.slopePerDay);
  const fmt = (v: number) => v.toFixed(spec.decimals);
  const whenWord =
    days === 0 ? "today" : days === 1 ? "in about a day" : `in about ${days} days`;
  const dirWord = crossing.direction === "falling" ? "dropping" : "rising";
  const edgeWord = crossing.direction === "falling" ? "below" : "above";

  const message =
    `${spec.label} is ${dirWord} (~${fmt(ratePerDay)}${spec.unit ? " " + spec.unit : ""}/day) ` +
    `and likely to go ${edgeWord} ${fmt(crossing.threshold)}${spec.unit ? " " + spec.unit : ""} ${whenWord}. ` +
    `Test soon and be ready to ${crossing.direction === "falling" ? "top it up" : "bring it down"}.`;

  return {
    metric: spec.label,
    key: spec.key,
    direction: crossing.direction,
    slopePerDay: trend.slopePerDay,
    daysUntil: days,
    threshold: crossing.threshold,
    message,
    severity: days <= 1 ? "warning" : "info",
  };
}

export interface ForecastReading {
  recorded_at: string;
  ph: number | string;
  free_chlorine_ppm: number | string | null;
  bromine_ppm: number | string | null;
  total_alkalinity_ppm: number | string;
}

// Build the set of forecasts worth showing, across pH, the active sanitizer,
// and total alkalinity. Readings may be in any order.
export function buildForecasts(
  readings: ForecastReading[],
  config: SpaConfig,
): Forecast[] {
  const num = (v: number | string | null): number | null =>
    v === null || v === undefined ? null : Number(v);

  const isChlorine = config.sanitizerType === "chlorine";
  const r = config.targetRanges;

  const specs: MetricSpec[] = [
    {
      key: "ph",
      label: "pH",
      unit: "",
      min: r.phIdealMin,
      max: r.phIdealMax,
      decimals: 1,
      points: readings.map((x) => ({ date: x.recorded_at, value: num(x.ph) })),
    },
    {
      key: "sanitizer",
      label: isChlorine ? "Chlorine" : "Bromine",
      unit: "ppm",
      min: isChlorine ? r.fcMin : r.brMin,
      max: isChlorine ? r.fcMax : r.brMax,
      decimals: 1,
      points: readings.map((x) => ({
        date: x.recorded_at,
        value: num(isChlorine ? x.free_chlorine_ppm : x.bromine_ppm),
      })),
    },
    {
      key: "alkalinity",
      label: "Alkalinity",
      unit: "ppm",
      min: r.taMin,
      max: r.taMax,
      decimals: 0,
      points: readings.map((x) => ({
        date: x.recorded_at,
        value: num(x.total_alkalinity_ppm),
      })),
    },
  ];

  return specs
    .map(forecastMetric)
    .filter((f): f is Forecast => f !== null)
    // Most urgent first.
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
