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
  defaultHeatLossPerKelvin,
  equilibriumTempC,
  heatLossFromStandingLoss,
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
  uaWPerK: number = defaultHeatLossPerKelvin(volumeLitres),
): { watts: number; measured: boolean; samples: number } {
  if (rate.ratePerHour === null || rate.meanWaterC === null) {
    return { watts: NAMEPLATE_HEATER_WATTS, measured: false, samples: rate.samples };
  }

  const gross =
    rate.ratePerHour * thermalMassKwhPerK(volumeLitres) * 1000 +
    uaWPerK * (rate.meanWaterC - ambientC);

  // A wild observation shouldn't produce a wild prediction. Keep it within a
  // believable band around the nameplate figure.
  const watts = Math.max(
    NAMEPLATE_HEATER_WATTS * 0.5,
    Math.min(NAMEPLATE_HEATER_WATTS * 1.5, gross),
  );
  return { watts: Math.round(watts), measured: true, samples: rate.samples };
}

// --- Learning the tub's real insulation ----------------------------------------
//
// The mirror of the heating case, and arguably more valuable: heat LOSS is the
// number the app was worst at guessing. A generic uninsulated tub is assumed at
// 3 W/m2K, but a full cover package measures nearer 0.5 — a five-fold error in
// every standby cost and a half-hour error in every heat-up.
//
// The two regimes are cleanly separated by their size. Standing loss under a
// full cover is around 0.1 °C/h; an hour with the lid off is 1-1.5 °C/h. So
// anything cooling faster than this threshold is a soak (or a top-up with cold
// water) and must not be mistaken for the tub's insulation.
const MAX_STANDING_LOSS_C_PER_H = 0.5;
const MIN_STANDING_LOSS_C_PER_H = 0.01;
export const MIN_COOLING_SAMPLES = 5;

export interface CoolingRate {
  /** °C per hour lost while standing, cover on. */
  ratePerHour: number | null;
  samples: number;
  meanWaterC: number | null;
}

export function observedCoolingRate(rows: TempRow[]): CoolingRate {
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

    const drop = (prev.c - cur.c) / gapHours; // positive when cooling
    if (drop < MIN_STANDING_LOSS_C_PER_H || drop > MAX_STANDING_LOSS_C_PER_H) continue;

    rates.push(drop);
    temps.push((prev.c + cur.c) / 2);
  }

  if (rates.length < MIN_COOLING_SAMPLES) {
    return { ratePerHour: null, samples: rates.length, meanWaterC: null };
  }

  // The median here, not a high percentile: unlike heating — where partial
  // intervals understate a fixed capability — we want the typical standing
  // loss, and the extremes are draughty nights and mild afternoons either side.
  const sorted = [...rates].sort((a, b) => a - b);
  return {
    ratePerHour: Math.round(sorted[Math.floor(sorted.length / 2)] * 1000) / 1000,
    samples: rates.length,
    meanWaterC:
      Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10,
  };
}

export type HeatLossBasis = "measured" | "setting" | "estimated";

/**
 * The heat-loss coefficient to actually use, and where it came from. Order:
 * what the probe has watched, then what the user entered, then the generic
 * uninsulated fallback.
 */
export function resolveHeatLoss(opts: {
  cooling: CoolingRate | null;
  ambientC: number;
  savedWPerK?: number | null;
  volumeLitres: number;
}): { uaWPerK: number; basis: HeatLossBasis; standingLossCPerH: number } {
  const { cooling, ambientC, savedWPerK, volumeLitres } = opts;

  if (cooling?.ratePerHour != null && cooling.meanWaterC != null) {
    const deltaT = cooling.meanWaterC - ambientC;
    const ua = heatLossFromStandingLoss(cooling.ratePerHour, deltaT, volumeLitres);
    if (ua !== null && ua > 0) {
      return { uaWPerK: ua, basis: "measured", standingLossCPerH: cooling.ratePerHour };
    }
  }

  const ua =
    savedWPerK != null && savedWPerK > 0
      ? savedWPerK
      : defaultHeatLossPerKelvin(volumeLitres);

  return {
    uaWPerK: ua,
    basis: savedWPerK != null && savedWPerK > 0 ? "setting" : "estimated",
    standingLossCPerH:
      Math.round(((ua * 25) / 1000 / thermalMassKwhPerK(volumeLitres)) * 1000) / 1000,
  };
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
  uaWPerK?: number;
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
  const ua = input.uaWPerK ?? defaultHeatLossPerKelvin(volumeLitres);

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

  const raw = heatUpHours(currentC, targetC, ambientC, watts, volumeLitres, ua);
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
  uaWPerK: number = defaultHeatLossPerKelvin(volumeLitres),
): number {
  const equilibrium = equilibriumTempC(ambientC, watts, uaWPerK);
  const uaKw = uaWPerK / 1000;
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

/**
 * Resolve a clock time ("20:00") to the next moment it comes round. Today if
 * it's still ahead, tomorrow if it's gone — which is what someone soaking most
 * days actually means, and saves them picking a date every time.
 */
export function nextOccurrenceOf(hhmm: string, now: Date = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() > now.getTime()) return candidate;

  // Build tomorrow from the date parts rather than adding 24 hours, so this
  // stays correct across a daylight-saving change.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hour, minute, 0, 0);
  return tomorrow;
}

// --- A schedule you actually set -----------------------------------------------
//
// Everything above LEARNS when you soak from the log. That's fine as a default
// and useless as a promise: stop tapping "log a soak" and the morning reminder
// quietly stops with it. A saved schedule is a fact, so it wins over the guess.
//
// Temperature isn't stored here — it already lives in targetRanges.tempTarget.
// Two copies of the same preference is how they end up disagreeing.
export interface HeatingSchedule {
  enabled: boolean;
  /** 0 = Sunday, matching Date.getDay(). */
  weekdays: number[];
  /** "HH:MM" in the user's own timezone. */
  time: string;
}

/**
 * Read a schedule out of the settings jsonb. Deliberately suspicious of what it
 * finds: a hand-edited or half-written blob should mean "no schedule", not a
 * reminder firing at 25 o'clock.
 */
export function parseHeatingSchedule(raw: unknown): HeatingSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  if (typeof o.time !== "string" || !/^(\d{1,2}):(\d{2})$/.test(o.time.trim())) {
    return null;
  }
  const [h, m] = o.time.trim().split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  if (!Array.isArray(o.weekdays)) return null;
  const weekdays = Array.from(
    new Set(
      o.weekdays.filter(
        (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
      ),
    ),
  ).sort((a, b) => a - b);
  if (weekdays.length !== o.weekdays.length) return null;
  if (weekdays.length === 0) return null;

  return {
    enabled: o.enabled !== false, // absent means on
    weekdays,
    time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  };
}

/**
 * The next moment matching a saved schedule. Minute-precise, unlike
 * nextSoakTime — a learned pattern only knows the hour, but a time you typed in
 * deserves to be honoured exactly.
 */
export function nextScheduledSoak(
  schedule: HeatingSchedule | null,
  now: Date = new Date(),
): Date | null {
  if (!schedule || !schedule.enabled || schedule.weekdays.length === 0) return null;
  const [hour, minute] = schedule.time.split(":").map(Number);

  // Eight days rather than seven, so a schedule with a single weekday still
  // resolves when today IS that day but the time has already gone.
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (schedule.weekdays.includes(d.getDay())) return d;
  }
  return null;
}

export type ReadyAtSource = "schedule" | "pattern" | "default";

/**
 * One resolver for both the card and the morning push, so the two can never
 * disagree about when you want to get in. Saved schedule beats learned pattern
 * beats a sensible evening.
 */
export function resolveReadyAt(opts: {
  schedule: HeatingSchedule | null;
  pattern: SoakPattern | null;
  now?: Date;
}): { readyAt: Date; source: ReadyAtSource } {
  const now = opts.now ?? new Date();

  const scheduled = nextScheduledSoak(opts.schedule, now);
  if (scheduled) return { readyAt: scheduled, source: "schedule" };

  return {
    readyAt: nextSoakTime(opts.pattern, now),
    source: opts.pattern ? "pattern" : "default",
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
  uaWPerK?: number;
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
  const ua = opts.uaWPerK ?? defaultHeatLossPerKelvin(volumeLitres);
  if (soaksPerWeek <= 0) return null;

  const keepWarmWeekly =
    standbyKwhPerDay(targetC, ambientC, volumeLitres, ua) * 7 * price;

  const hours = heatUpHours(coolsToC, targetC, ambientC, watts, volumeLitres, ua);
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
