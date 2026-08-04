// =============================================================================
//  lib/water.ts
//  Pure "when should I drain & refill?" logic. NO I/O, unit-testable.
//
//  Based on the Pool & Hot Tub Alliance (PHTA) rule of thumb:
//      days between water changes = gallons / 3 / average daily bathers
//  Our volumes are stored in litres, so we convert litres -> US gallons first.
//  A tub used by more people needs changing sooner; the formula makes that
//  concrete instead of a vague "every 3 months".
// =============================================================================

export const LITRES_PER_US_GALLON = 3.78541;

// The PHTA "divide by 3" constant, and the manufacturer's hard cap. Lay-Z-Spa
// say every 3 months, so 90 days is the ceiling no matter how lightly the tub
// is used — a big tub with one bather works out at ~104 days on the formula
// alone, and the cap is what should win there.
export const PHTA_DIVISOR = 3;
export const MAX_RECOMMENDED_INTERVAL_DAYS = 90;
export const MIN_RECOMMENDED_INTERVAL_DAYS = 1;

export interface WaterChangeOptions {
  litresPerGallon?: number;
  divisor?: number;
  maxDays?: number;
}

export interface WaterChangeResult {
  intervalDays: number;
  cappedByMax: boolean; // true when usage is so low the raw formula exceeded the cap
}

// Recommended number of days between drain & refill for the given tub size and
// typical daily usage.
export function computeWaterChangeIntervalDays(
  volumeLitres: number,
  bathersPerDay: number,
  opts: WaterChangeOptions = {},
): WaterChangeResult {
  if (!Number.isFinite(volumeLitres) || volumeLitres <= 0) {
    throw new Error(
      `computeWaterChangeIntervalDays: volumeLitres must be positive, got ${volumeLitres}`,
    );
  }

  const litresPerGallon = opts.litresPerGallon ?? LITRES_PER_US_GALLON;
  const divisor = opts.divisor ?? PHTA_DIVISOR;
  const maxDays = opts.maxDays ?? MAX_RECOMMENDED_INTERVAL_DAYS;

  const gallons = volumeLitres / litresPerGallon;

  // No/negative usage → the formula tends to infinity; fall back to the cap.
  if (!Number.isFinite(bathersPerDay) || bathersPerDay <= 0) {
    return { intervalDays: maxDays, cappedByMax: true };
  }

  const raw = gallons / divisor / bathersPerDay;
  const rounded = Math.round(raw);

  if (rounded > maxDays) {
    return { intervalDays: maxDays, cappedByMax: true };
  }
  return {
    intervalDays: Math.max(rounded, MIN_RECOMMENDED_INTERVAL_DAYS),
    cappedByMax: false,
  };
}

// Total "person-soaks" the water can take before a change is due. Same PHTA
// basis as the interval formula: gallons / 3 is the cumulative bather capacity.
export function batherCapacity(
  volumeLitres: number,
  opts: WaterChangeOptions = {},
): number {
  if (!Number.isFinite(volumeLitres) || volumeLitres <= 0) {
    throw new Error(
      `batherCapacity: volumeLitres must be positive, got ${volumeLitres}`,
    );
  }
  const litresPerGallon = opts.litresPerGallon ?? LITRES_PER_US_GALLON;
  const divisor = opts.divisor ?? PHTA_DIVISOR;
  const gallons = volumeLitres / litresPerGallon;
  return Math.max(1, Math.round(gallons / divisor));
}

export interface UsageWaterStatus {
  capacity: number; // total person-soaks before a change
  used: number; // person-soaks logged since the last drain
  remaining: number; // person-soaks left (never negative)
  fractionUsed: number; // 0..1 (clamped)
  changeDue: boolean; // used >= capacity
}

// Where the water sits between fresh and "time to change", from real usage.
export function usageWaterStatus(
  volumeLitres: number,
  cumulativeBathers: number,
  opts: WaterChangeOptions = {},
): UsageWaterStatus {
  const capacity = batherCapacity(volumeLitres, opts);
  const used = Math.max(0, cumulativeBathers);
  const remaining = Math.max(0, capacity - used);
  const fractionUsed = capacity > 0 ? Math.min(1, used / capacity) : 1;
  return { capacity, used, remaining, fractionUsed, changeDue: used >= capacity };
}

// =============================================================================
//  Chemical-demand trend — the signal that actually matters
//
//  The calendar and the bather formula are both estimates. The water itself
//  tells you the truth: when you start topping sanitiser up more often than you
//  did a fortnight ago, the water is near the end regardless of the date. This
//  compares recent sanitiser use against the previous window to detect that.
// =============================================================================

export const DEMAND_WINDOW_DAYS = 14;
export const DEMAND_RISE_THRESHOLD = 0.25; // +25% counts as "fighting it"
export const DEMAND_MIN_DOSES_PER_WINDOW = 2;

// Chemicals that represent "keeping the sanitiser up" — the effort signal.
const SANITISER_CHEMICALS = new Set([
  "dichlor",
  "bromine_granules",
  "sodium_bromide",
  "mps_shock",
]);

export interface DemandDose {
  logged_at: string;
  chemical: string;
  amount_grams: number | string;
}

export interface DemandTrend {
  recentGramsPerDay: number;
  priorGramsPerDay: number;
  changeRatio: number | null; // null when there isn't enough history to judge
  rising: boolean;
  message: string | null;
}

export function sanitiserDemandTrend(
  dosing: DemandDose[],
  now: Date = new Date(),
): DemandTrend {
  const dayMs = 24 * 60 * 60 * 1000;
  const recentStart = now.getTime() - DEMAND_WINDOW_DAYS * dayMs;
  const priorStart = now.getTime() - DEMAND_WINDOW_DAYS * 2 * dayMs;

  let recentG = 0;
  let priorG = 0;
  let recentN = 0;
  let priorN = 0;

  for (const d of dosing) {
    if (!SANITISER_CHEMICALS.has(d.chemical)) continue;
    const t = new Date(d.logged_at).getTime();
    const g = Number(d.amount_grams);
    if (!Number.isFinite(t) || !Number.isFinite(g) || g <= 0) continue;
    if (t >= recentStart && t <= now.getTime()) {
      recentG += g;
      recentN++;
    } else if (t >= priorStart && t < recentStart) {
      priorG += g;
      priorN++;
    }
  }

  const recentGramsPerDay = recentG / DEMAND_WINDOW_DAYS;
  const priorGramsPerDay = priorG / DEMAND_WINDOW_DAYS;

  // Not enough of a history in either window to say anything honest.
  if (
    recentN < DEMAND_MIN_DOSES_PER_WINDOW ||
    priorN < DEMAND_MIN_DOSES_PER_WINDOW ||
    priorGramsPerDay <= 0
  ) {
    return {
      recentGramsPerDay,
      priorGramsPerDay,
      changeRatio: null,
      rising: false,
      message: null,
    };
  }

  const changeRatio = recentGramsPerDay / priorGramsPerDay - 1;
  const rising = changeRatio >= DEMAND_RISE_THRESHOLD;

  return {
    recentGramsPerDay,
    priorGramsPerDay,
    changeRatio,
    rising,
    message: rising
      ? `You're using about ${Math.round(changeRatio * 100)}% more sanitiser than a fortnight ago — the water is starting to need more work to hold its levels.`
      : null,
  };
}

// =============================================================================
//  Cost of a refill — the reason NOT to change water out of habit
// =============================================================================

// Rough UK figures; the kWh number is the durable part, the price is indicative.
export const FILL_TEMP_RISE_C = 28; // ~10°C mains -> ~38°C
export const SPECIFIC_HEAT_KJ_PER_KG_K = 4.186;
export const DEFAULT_ELECTRICITY_PRICE_PER_KWH = 0.245;
export const DEFAULT_WATER_PRICE_PER_M3 = 4.0; // supply + sewerage combined

export interface RefillCost {
  kwh: number;
  energyCost: number;
  waterCost: number;
  totalCost: number;
}

export function estimateRefillCost(
  volumeLitres: number,
  opts: {
    tempRiseC?: number;
    pricePerKwh?: number;
    pricePerM3?: number;
  } = {},
): RefillCost {
  const rise = opts.tempRiseC ?? FILL_TEMP_RISE_C;
  const pKwh = opts.pricePerKwh ?? DEFAULT_ELECTRICITY_PRICE_PER_KWH;
  const pM3 = opts.pricePerM3 ?? DEFAULT_WATER_PRICE_PER_M3;

  const kj = volumeLitres * SPECIFIC_HEAT_KJ_PER_KG_K * rise;
  const kwh = kj / 3600;
  const energyCost = kwh * pKwh;
  const waterCost = (volumeLitres / 1000) * pM3;

  return {
    kwh: Math.round(kwh * 10) / 10,
    energyCost: Math.round(energyCost * 100) / 100,
    waterCost: Math.round(waterCost * 100) / 100,
    totalCost: Math.round((energyCost + waterCost) * 100) / 100,
  };
}

// =============================================================================
//  The combined verdict — weighs every signal and says which one decided it
// =============================================================================

export type WaterVerdictStatus = "fresh" | "ok" | "watch" | "change_soon" | "change_now";

export interface WaterVerdict {
  status: WaterVerdictStatus;
  headline: string;
  detail: string;
  /** Which signal drove the verdict, so the UI can explain itself. */
  decidedBy: "age" | "usage" | "demand" | "sanitiser-ineffective" | "none";
}

export interface VerdictInput {
  ageDays: number | null;
  intervalDays: number;
  usage?: UsageWaterStatus | null;
  demand?: DemandTrend | null;
  /** True when ORP stays low even though pH is fine — classic stabiliser buildup. */
  sanitiserIneffective?: boolean;
}

export function waterChangeVerdict(input: VerdictInput): WaterVerdict {
  const { ageDays, intervalDays, usage, demand, sanitiserIneffective } = input;

  // 1. Hard signals first — these mean "change it", whatever the calendar says.
  if (sanitiserIneffective) {
    return {
      status: "change_now",
      headline: "Time to change the water",
      detail:
        "Your sanitiser isn't holding its strength even with pH in range, which usually means stabiliser has built up. Fresh water is the fix — topping up more chemical won't help.",
      decidedBy: "sanitiser-ineffective",
    };
  }
  if (ageDays !== null && ageDays >= intervalDays) {
    return {
      status: "change_now",
      headline: "Time to change the water",
      detail: `It's been ${ageDays} days, past the ${intervalDays}-day mark for your tub size and usage.`,
      decidedBy: "age",
    };
  }
  if (usage?.changeDue) {
    return {
      status: "change_now",
      headline: "Time to change the water",
      detail: `You've had about ${usage.used} person-soaks out of roughly ${usage.capacity} this water can take.`,
      decidedBy: "usage",
    };
  }

  // 2. The water complaining before the calendar does.
  if (demand?.rising) {
    return {
      status: "change_soon",
      headline: "Change it soon",
      detail:
        demand.message ??
        "You're topping the sanitiser up more often than you were, which is the water telling you it's tiring.",
      decidedBy: "demand",
    };
  }

  // 3. Otherwise report how far through we are.
  const fraction =
    ageDays !== null && intervalDays > 0 ? ageDays / intervalDays : 0;
  const usageFraction = usage?.fractionUsed ?? 0;
  const worst = Math.max(fraction, usageFraction);

  if (worst >= 0.8) {
    return {
      status: "watch",
      headline: "Getting there",
      detail:
        "Still fine, but keep an eye on it — test as usual and change when the numbers start slipping.",
      decidedBy: fraction >= usageFraction ? "age" : "usage",
    };
  }
  if (worst <= 0.25) {
    return {
      status: "fresh",
      headline: "Water is fresh",
      detail:
        "Nothing to do. Keep testing as normal — the strips decide, not the calendar.",
      decidedBy: "none",
    };
  }
  return {
    status: "ok",
    headline: "Water is in good shape",
    detail:
      "Your levels are holding without a fight, so there's no reason to change it yet.",
    decidedBy: "none",
  };
}

// Whole days elapsed since a timestamp (never negative).
export function daysSince(iso: string | Date | null, now: Date = new Date()): number | null {
  if (iso === null) return null;
  const then = iso instanceof Date ? iso : new Date(iso);
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}
