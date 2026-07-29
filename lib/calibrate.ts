// =============================================================================
//  lib/calibrate.ts
//  Learn how THIS tub responds to chemicals by pairing each logged dose with the
//  reading before and after it, then suggest tuned dosing constants. PURE, no I/O.
//
//  Only the two cleanly-linear chemicals are calibrated:
//    - dichlor  → free chlorine   (tunes `dichlorAvailableChlorineFraction`)
//    - ta_increaser → alkalinity  (tunes `taIncreaserGPer1000LPer10Ppm`)
//  pH is non-linear and bromine's dose model is a fixed floater top-up, so both
//  are intentionally excluded.
// =============================================================================

import type { DosingConstants } from "./chemistry";

export type CalibratableChemical = "dichlor" | "ta_increaser";

interface MetricSpec {
  field: "free_chlorine_ppm" | "total_alkalinity_ppm";
  minDelta: number; // ignore changes smaller than this (noise / div-blowup)
  label: string;
}

const CALIBRATABLE: Record<CalibratableChemical, MetricSpec> = {
  dichlor: { field: "free_chlorine_ppm", minDelta: 0.5, label: "Chlorine (dichlor) strength" },
  ta_increaser: { field: "total_alkalinity_ppm", minDelta: 5, label: "Alkalinity increaser strength" },
};

export const AFTER_WINDOW_DAYS = 4;
export const MIN_OBSERVATIONS = 3;
export const MIN_CHANGE_PERCENT = 10;
const MAX_G_PER_PPM_PER_1000L = 500; // reject wild outliers
const DAY = 24 * 60 * 60 * 1000;

export interface CalibrateReading {
  recorded_at: string;
  free_chlorine_ppm: number | string | null;
  total_alkalinity_ppm: number | string | null;
}
export interface CalibrateDose {
  logged_at: string;
  chemical: string;
  amount_grams: number | string;
}
export interface CalibrateConfig {
  volumeLitres: number;
  dosingConstants: DosingConstants;
}

export interface Observation {
  chemical: CalibratableChemical;
  gramsPerPpmPer1000L: number;
  deltaPpm: number;
  grams: number;
}

function num(v: number | string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// -----------------------------------------------------------------------------
// deriveObservations — one clean before/after pair per qualifying dose.
// -----------------------------------------------------------------------------
export function deriveObservations(
  readings: CalibrateReading[],
  dosing: CalibrateDose[],
  config: CalibrateConfig,
): Observation[] {
  const volume = config.volumeLitres;
  if (!Number.isFinite(volume) || volume <= 0) return [];

  const sortedReadings = [...readings]
    .map((r) => ({ ...r, t: new Date(r.recorded_at).getTime() }))
    .sort((a, b) => a.t - b.t);
  const doses = dosing
    .map((d) => ({ ...d, t: new Date(d.logged_at).getTime() }))
    .sort((a, b) => a.t - b.t);

  const observations: Observation[] = [];

  for (const dose of doses) {
    const chem = dose.chemical as CalibratableChemical;
    const spec = CALIBRATABLE[chem];
    if (!spec) continue; // not a calibratable chemical (pH, bromine, etc.)

    const grams = num(dose.amount_grams);
    if (grams === null || grams <= 0) continue;

    // Reading just before the dose (metric present).
    let before: (typeof sortedReadings)[number] | null = null;
    for (const r of sortedReadings) {
      if (r.t <= dose.t && num(r[spec.field]) !== null) before = r;
      if (r.t > dose.t) break;
    }
    // First reading after the dose, within the window (metric present).
    const after = sortedReadings.find(
      (r) => r.t > dose.t && r.t - dose.t <= AFTER_WINDOW_DAYS * DAY && num(r[spec.field]) !== null,
    );
    if (!before || !after) continue;

    // Reject if another dose of the SAME chemical falls between the two readings.
    const contaminated = doses.some(
      (d) => d !== dose && d.chemical === chem && d.t > before!.t && d.t < after.t,
    );
    if (contaminated) continue;

    const deltaPpm = (num(after[spec.field]) as number) - (num(before[spec.field]) as number);
    if (deltaPpm < spec.minDelta) continue;

    const gramsPerPpmPer1000L = (grams / deltaPpm) * (1000 / volume);
    if (gramsPerPpmPer1000L <= 0 || gramsPerPpmPer1000L > MAX_G_PER_PPM_PER_1000L) continue;

    observations.push({ chemical: chem, gramsPerPpmPer1000L, deltaPpm, grams });
  }

  return observations;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface CalibrationSuggestion {
  chemical: CalibratableChemical;
  label: string;
  constantKey: keyof DosingConstants;
  currentValue: number;
  suggestedValue: number;
  observationCount: number;
  changePercent: number; // signed, rounded
  message: string;
}

// -----------------------------------------------------------------------------
// computeCalibration — a suggestion per chemical with enough clean observations
// and a meaningful difference from the current constant.
// -----------------------------------------------------------------------------
export function computeCalibration(
  observations: Observation[],
  config: CalibrateConfig,
): CalibrationSuggestion[] {
  const byChemical = new Map<CalibratableChemical, number[]>();
  for (const o of observations) {
    const arr = byChemical.get(o.chemical) ?? [];
    arr.push(o.gramsPerPpmPer1000L);
    byChemical.set(o.chemical, arr);
  }

  const suggestions: CalibrationSuggestion[] = [];

  for (const [chem, rates] of byChemical) {
    if (rates.length < MIN_OBSERVATIONS) continue;
    const rate = median(rates); // grams per 1 ppm per 1000 L

    let constantKey: keyof DosingConstants;
    let suggested: number;
    let current: number;

    if (chem === "dichlor") {
      constantKey = "dichlorAvailableChlorineFraction";
      // app: grams = ppm * L / (1000 * fraction)  ⇒  fraction = 1 / rate
      suggested = Math.round((1 / rate) * 100) / 100;
      suggested = Math.min(1, Math.max(0.1, suggested));
      current = config.dosingConstants.dichlorAvailableChlorineFraction;
    } else {
      constantKey = "taIncreaserGPer1000LPer10Ppm";
      suggested = Math.round(rate * 10); // grams per 1000 L per 10 ppm
      current = config.dosingConstants.taIncreaserGPer1000LPer10Ppm;
    }

    if (!Number.isFinite(current) || current <= 0) continue;
    const changePercent = Math.round(((suggested - current) / current) * 100);
    if (Math.abs(changePercent) < MIN_CHANGE_PERCENT) continue;
    if (suggested === current) continue;

    const spec = CALIBRATABLE[chem];
    suggestions.push({
      chemical: chem,
      label: spec.label,
      constantKey,
      currentValue: current,
      suggestedValue: suggested,
      observationCount: rates.length,
      changePercent,
      message:
        `From your last ${rates.length} doses, your tub responds ` +
        `${changePercent > 0 ? "less" : "more"} strongly than the default. ` +
        `Tune ${spec.label.toLowerCase()} from ${current} to ${suggested}?`,
    });
  }

  return suggestions;
}
