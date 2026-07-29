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

// The PHTA "divide by 3" constant, and a sensible cap: even a barely-used tub
// should be refreshed roughly quarterly, so we never recommend waiting forever.
export const PHTA_DIVISOR = 3;
export const MAX_RECOMMENDED_INTERVAL_DAYS = 120;
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

// Whole days elapsed since a timestamp (never negative).
export function daysSince(iso: string | Date | null, now: Date = new Date()): number | null {
  if (iso === null) return null;
  const then = iso instanceof Date ? iso : new Date(iso);
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}
