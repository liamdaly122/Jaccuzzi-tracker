// =============================================================================
//  lib/heating.ts
//  When to switch the heater on so the water is ready when you want to get in,
//  and whether it's cheaper to just leave it hot. PURE, no I/O.
//
//  WHY THIS EXISTS
//  The intuition is badly wrong. On an 1180 L tub, going from 20 °C takes about
//  fourteen hours, and from 10 °C in winter closer to twenty-five and £14 of
//  electricity. "I'll put it on when I get home" does not work, and nothing else
//  in the app says so.
//
//  THE INTELLIGENT BIT
//  Rather than trusting a nameplate figure, this watches the probe's own
//  temperature history and works out what the tub actually manages. But an
//  observed RATE can't be reused directly — a rate measured on a mild evening
//  doesn't hold on a frosty morning, because more heat leaks away. So the
//  observation is converted into an effective heater POWER, which does transfer,
//  and lib/thermal.ts re-applies the heat loss for whatever conditions we're
//  predicting. Same idea as lib/calibrate.ts learning dose response.
// =============================================================================

import {
  NAMEPLATE_HEATER_WATTS,
  equilibriumTempC,
  heatLossPerKelvin,
  heatUpHours,
  heatUpKwh,
  standbyKwhPerDay,
  thermalMassKwhPerK,
} from "./thermal";

const HOUR_MS = 60 * 60 * 1000;

// --- Learning the tub's real heating power ------------------------------------
//
// Probe capture is opportunistic, so gaps vary. Pairs closer than this are
// mostly sensor noise; wider than this and the heater has probably cycled off
// partway, which would understate the rate.
const MIN_GAP_MINUTES = 20;
const MAX_GAP_HOURS = 4;
// Anything outside this isn't a heat-up — it's sun on the cover, or a glitch.
const MIN_PLAUSIBLE_RATE = 0.3;
const MAX_PLAUSIBLE_RATE = 3;
// Below this many samples, the nameplate figure is the more honest answer.
export const MIN_HEATING_SAMPLES = 5;
// Deliberately not the median: many intervals have the heater on for only part
// of the gap, which drags a central average below what the tub can really do.
const RATE_PERCENTILE = 0.75;

export interface TempRow {
  measured_at: string;
  temperature_c: number | string | null;
}

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export interface HeatingRate {
  /** °C per hour actually observed, at whatever conditions prevailed. */
  ratePerHour: number | null;
  samples: number;
  /** Mean water temperature across the observed climbs. */
  meanWaterC: number | null;
}

/** What the tub has actually been seen to manage, from probe history. */
export function observedHeatingRate(rows: TempRow[]): HeatingRate {
  const points = rows
    .map((r) => ({ t: new Date(r.measured_at).getTime(), c: toNum(r.temperature_c) }))
    .filter((x): x is { t: number; c: number } => Number.isFinite(x.t) && x.c !== null)
    .sort((a, b) => a.t - b.t);

  const rates: number[] = [];
  const temps: number[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const gapHours = (cur.t - prev.t) / HOUR_MS;
    if (gapHours < MIN_GAP_MINUTES / 60 || gapHours > MAX_GAP_HOURS) continue;

    const rate = (cur.c - prev.c) / gapHours;
    if (rate < MIN_PLAUSIBLE_RATE || rate > MAX_PLAUSIBLE_RATE) continue;

    rates.push(rate);
    temps.push((prev.c + cur.c) / 2);
  }

  if (rates.length < MIN_HEATING_SAMPLES) {
    return { ratePerHour: null, samples: rates.length, meanWaterC: null };
  }

  const sorted = [...rates].sort((a, b) => a - b);
  return {
    ratePerHour: Math.round(percentile(sorted, RATE_PERCENTILE) * 100) / 100,
    samples: rates.length,
    meanWaterC:
      Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10,
  };
}

/**
 * Convert an observed climb rate into the heater power that would produce it,
 * adding back the heat that was leaking away at the time. Power transfers
 * across conditions; a raw rate does not.
 */
export function effectiveHeaterWatts(
  rate: HeatingRate,
  ambientC: number,
  volumeLitres: number,
): { watts: number; measured: boolean; samples: number } {
  if (rate.ratePerHour === null || rate.meanWaterC === null) {
    return { watts: NAMEPLATE_HEATER_WATTS, measured: false, samples: rate.samples };
  }

  const gross =
    rate.ratePerHour * thermalMassKwhPerK(volumeLitres) * 1000 +
    heatLossPerKelvin(volumeLitres) * (rate.meanWaterC - ambientC);

  // A wild observation shouldn't produce a wild prediction. Keep it within a
  // believable band around the nameplate figure.
  const watts = Math.max(
    NAMEPLATE_HEATER_WATTS * 0.5,
    Math.min(NAMEPLATE_HEATER_WATTS * 1.5, gross),
  );
  return { watts: Math.round(watts), measured: true, samples: rate.samples };
}

// --- The plan ------------------------------------------------------------------
//
// Overshooting costs almost nothing — the heater just holds temperature — while
// undershooting fails the entire point of the feature. So the switch-on time
// carries a buffer, which also absorbs the error from using a daily average
// ambient rather than hour-by-hour weather.
export const BUFFER_MINUTES = 30;

export interface HeatingPlanInput {
  currentC: number | null;
  targetC: number;
  readyAt: Date;
  ambientC: number;
  watts: number;
  volumeLitres: number;
  pricePerKwh?: number;
  now?: Date;
}

export interface HeatingPlan {
  switchOnAt: Date | null;
  hours: number;
  kwh: number;
  cost: number;
  /** Already at or above target — nothing to do. */
  alreadyWarmEnough: boolean;
  /** The switch-on moment is in the past; it won't be ready in time. */
  tooLate: boolean;
  /** How late it will actually be, in hours, when tooLate. */
  shortfallHours: number;
  /** The target can't be reached at all in these conditions. */
  unreachable: boolean;
}

export function heatingPlan(input: HeatingPlanInput): HeatingPlan | null {
  const { currentC, targetC, readyAt, ambientC, watts, volumeLitres } = input;
  const now = input.now ?? new Date();
  const pricePerKwh = input.pricePerKwh ?? 0.27;

  if (currentC === null || !Number.isFinite(currentC)) return null;
  if (!Number.isFinite(readyAt.getTime())) return null;

  const empty = {
    switchOnAt: null,
    hours: 0,
    kwh: 0,
    cost: 0,
    alreadyWarmEnough: false,
    tooLate: false,
    shortfallHours: 0,
    unreachable: false,
  };

  if (currentC >= targetC) return { ...empty, alreadyWarmEnough: true };

  const raw = heatUpHours(currentC, targetC, ambientC, watts, volumeLitres);
  if (raw === null) {
    return {
      ...empty,
      unreachable: true,
      // Say how far it could get, so the answer isn't just "no".
      hours: 0,
    };
  }

  const hours = raw + BUFFER_MINUTES / 60;
  const switchOnAt = new Date(readyAt.getTime() - hours * HOUR_MS);
  const kwh = heatUpKwh(raw, watts);
  const lateBy = (now.getTime() - switchOnAt.getTime()) / HOUR_MS;

  return {
    switchOnAt,
    hours: Math.round(hours * 10) / 10,
    kwh: Math.round(kwh * 10) / 10,
    cost: Math.round(kwh * pricePerKwh * 100) / 100,
    alreadyWarmEnough: false,
    tooLate: lateBy > 0,
    shortfallHours: lateBy > 0 ? Math.round(lateBy * 10) / 10 : 0,
    unreachable: false,
  };
}

/** The warmest it could get by a given moment, when the target is out of reach. */
export function reachableByC(
  fromC: number,
  hoursAvailable: number,
  ambientC: number,
  watts: number,
  volumeLitres: number,
): number {
  const equilibrium = equilibriumTempC(ambientC, watts, volumeLitres);
  const uaKw = heatLossPerKelvin(volumeLitres) / 1000;
  const tau = thermalMassKwhPerK(volumeLitres) / uaKw;
  const reached =
    equilibrium - (equilibrium - fromC) * Math.exp(-hoursAvailable / tau);
  return Math.round(reached * 10) / 10;
}

// --- When do they actually get in? ---------------------------------------------
//
// Learned from logged soaks rather than asked for every time. Below the
// threshold it says nothing rather than inventing a pattern from two data points.
export const MIN_SOAKS_FOR_PATTERN = 4;

export interface UsageRow {
  used_at: string;
}

export interface SoakPattern {
  /** 0 = Sunday, matching Date.getDay(). */
  weekdays: number[];
  /** Local hour they typically get in. */
  hour: number;
  soaks: number;
  confident: boolean;
}

export function soakPattern(rows: UsageRow[]): SoakPattern | null {
  const dates = rows
    .map((r) => new Date(r.used_at))
    .filter((d) => Number.isFinite(d.getTime()));

  if (dates.length < MIN_SOAKS_FOR_PATTERN) return null;

  const byWeekday = new Map<number, number>();
  for (const d of dates) {
    byWeekday.set(d.getDay(), (byWeekday.get(d.getDay()) ?? 0) + 1);
  }
  const peak = Math.max(...byWeekday.values());
  // Everything within one of the busiest day counts — people rarely soak on
  // exactly one day, and "Friday and Saturday" is a more useful answer.
  const weekdays = [...byWeekday.entries()]
    .filter(([, n]) => n >= peak - 1 && n > 1)
    .map(([day]) => day)
    .sort((a, b) => a - b);

  const hours = dates.map((d) => d.getHours()).sort((a, b) => a - b);
  const hour = hours[Math.floor(hours.length / 2)];

  return {
    weekdays: weekdays.length > 0 ? weekdays : [...byWeekday.keys()],
    hour,
    soaks: dates.length,
    confident: weekdays.length > 0 && dates.length >= MIN_SOAKS_FOR_PATTERN * 2,
  };
}

/** The next time matching the learned pattern, for pre-filling the picker. */
export function nextSoakTime(
  pattern: SoakPattern | null,
  now: Date = new Date(),
): Date {
  const fallbackHour = 19;
  const hour = pattern?.hour ?? fallbackHour;

  // Today if that hour hasn't passed, otherwise scan forward for the next
  // matching weekday.
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (!pattern || pattern.weekdays.length === 0) return d;
    if (pattern.weekdays.includes(d.getDay())) return d;
  }

  const fallback = new Date(now.getTime() + 24 * HOUR_MS);
  fallback.setHours(hour, 0, 0, 0);
  return fallback;
}

// --- Hold it hot, or let it go cold? -------------------------------------------
//
// At £8-14 a heat-up this genuinely flips: soak most days and standby wins, soak
// occasionally and reheating does. Both sides are the same heat-loss physics.
export interface KeepWarmComparison {
  soaksPerWeek: number;
  /** Cost of holding at target for a week. */
  keepWarmWeekly: number;
  /** Cost of reheating from a cold start for each soak that week. */
  reheatWeekly: number;
  cheaper: "keep_warm" | "let_it_cool";
  /** What choosing the cheaper option saves per week. */
  savingWeekly: number;
}

export function keepWarmVsReheat(opts: {
  soaksPerWeek: number;
  targetC: number;
  ambientC: number;
  coolsToC: number;
  watts: number;
  volumeLitres: number;
  pricePerKwh?: number;
}): KeepWarmComparison | null {
  const {
    soaksPerWeek,
    targetC,
    ambientC,
    coolsToC,
    watts,
    volumeLitres,
  } = opts;
  const price = opts.pricePerKwh ?? 0.27;
  if (soaksPerWeek <= 0) return null;

  const keepWarmWeekly =
    standbyKwhPerDay(targetC, ambientC, volumeLitres) * 7 * price;

  const hours = heatUpHours(coolsToC, targetC, ambientC, watts, volumeLitres);
  if (hours === null) return null;
  const reheatWeekly = heatUpKwh(hours, watts) * soaksPerWeek * price;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    soaksPerWeek: Math.round(soaksPerWeek * 10) / 10,
    keepWarmWeekly: round2(keepWarmWeekly),
    reheatWeekly: round2(reheatWeekly),
    cheaper: keepWarmWeekly <= reheatWeekly ? "keep_warm" : "let_it_cool",
    savingWeekly: round2(Math.abs(keepWarmWeekly - reheatWeekly)),
  };
}

/** Soaks per week from the usage log, over the window it actually covers. */
export function soaksPerWeek(rows: UsageRow[], now: Date = new Date()): number {
  const times = rows
    .map((r) => new Date(r.used_at).getTime())
    .filter((t) => Number.isFinite(t) && t <= now.getTime())
    .sort((a, b) => a - b);
  if (times.length < 2) return times.length;

  const spanDays = (now.getTime() - times[0]) / (24 * HOUR_MS);
  if (spanDays < 7) return times.length; // too short to annualise honestly
  return Math.round((times.length / spanDays) * 7 * 10) / 10;
}
