// =============================================================================
//  lib/scan.ts
//  Turn the raw JSON a vision model returns for a test strip into safe, plausible
//  numbers for the reading form. PURE, no I/O. This is the safety net between an
//  AI guess and the form: anything missing, non-numeric, or outside what a real
//  hot-tub strip can show becomes null, so the user only ever sees believable
//  pre-filled values (and always confirms them before saving).
// =============================================================================

import type { SanitizerType } from "./chemistry";

// What the model is asked to return (each key optional / nullable).
export interface RawScan {
  ph?: number | string | null;
  totalAlkalinityPpm?: number | string | null;
  freeChlorinePpm?: number | string | null;
  brominePpm?: number | string | null;
  calciumHardnessPpm?: number | string | null;
}

export interface NormalizedScan {
  ph: number | null;
  totalAlkalinityPpm: number | null;
  freeChlorinePpm: number | null;
  brominePpm: number | null;
  calciumHardnessPpm: number | null;
}

// Plausible ranges a real hot-tub test strip can display. Values outside these
// are almost certainly a misread and are dropped to null.
const BOUNDS = {
  ph: { min: 6, max: 9, decimals: 1 },
  totalAlkalinityPpm: { min: 0, max: 300, decimals: 0 },
  freeChlorinePpm: { min: 0, max: 20, decimals: 1 },
  brominePpm: { min: 0, max: 40, decimals: 1 },
  calciumHardnessPpm: { min: 0, max: 1000, decimals: 0 },
} as const;

function clampField(
  value: number | string | null | undefined,
  bound: { min: number; max: number; decimals: number },
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < bound.min || n > bound.max) return null;
  const f = 10 ** bound.decimals;
  return Math.round(n * f) / f;
}

// -----------------------------------------------------------------------------
// normalizeScan — clamp/validate the model's JSON and keep only the sanitizer
// that this tub actually uses (so a stray chlorine read can't land in a bromine
// tub's form, and vice-versa).
// -----------------------------------------------------------------------------
export function normalizeScan(
  raw: RawScan | null | undefined,
  config: { sanitizerType: SanitizerType },
): NormalizedScan {
  const r = raw ?? {};
  const chlorine = clampField(r.freeChlorinePpm, BOUNDS.freeChlorinePpm);
  const bromine = clampField(r.brominePpm, BOUNDS.brominePpm);

  return {
    ph: clampField(r.ph, BOUNDS.ph),
    totalAlkalinityPpm: clampField(r.totalAlkalinityPpm, BOUNDS.totalAlkalinityPpm),
    freeChlorinePpm: config.sanitizerType === "chlorine" ? chlorine : null,
    brominePpm: config.sanitizerType === "bromine" ? bromine : null,
    calciumHardnessPpm: clampField(r.calciumHardnessPpm, BOUNDS.calciumHardnessPpm),
  };
}
