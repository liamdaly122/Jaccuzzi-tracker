// =============================================================================
//  lib/iopool-parse.ts
//  PURE parsing/validation for the iopool public API. No I/O, so it's fully
//  unit-testable; the network call lives in lib/iopool.ts.
//
//  The probe reports pH, ORP (mV) and water temperature (°C). It does NOT
//  measure total alkalinity or calcium, so anything derived from it is
//  deliberately partial — we never invent the missing values.
// =============================================================================

export interface IopoolMeasure {
  ph: number | null;
  orpMv: number | null;
  temperatureC: number | null;
  measuredAt: string | null;
  /** iopool's own flag: false while a fresh measurement is still settling. */
  isValid: boolean;
  /** How stale the reading is, in minutes (null when there's no timestamp). */
  ageMinutes: number | null;
}

export interface IopoolPool {
  id: string;
  title: string;
  mode: string | null;
  hasActionRequired: boolean;
  /** Recommended filtration hours per day, when iopool supplies it. */
  filtrationHours: number | null;
  measure: IopoolMeasure;
}

// Plausible physical bounds — anything outside is treated as a bad read rather
// than passed on to the dosing logic.
const BOUNDS = {
  ph: { min: 0, max: 14 },
  orp: { min: 0, max: 1200 },
  temp: { min: -10, max: 60 },
};

function clamp(
  raw: unknown,
  bound: { min: number; max: number },
  decimals: number,
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < bound.min || n > bound.max) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function normalizeMeasure(
  raw: unknown,
  now: Date = new Date(),
): IopoolMeasure {
  const m = (raw ?? {}) as Record<string, unknown>;

  const measuredAtRaw = m.measuredAt;
  let measuredAt: string | null = null;
  let ageMinutes: number | null = null;
  if (typeof measuredAtRaw === "string") {
    const t = new Date(measuredAtRaw).getTime();
    if (Number.isFinite(t)) {
      measuredAt = new Date(t).toISOString();
      ageMinutes = Math.max(0, Math.round((now.getTime() - t) / 60000));
    }
  }

  return {
    ph: clamp(m.ph, BOUNDS.ph, 2),
    orpMv: clamp(m.orp, BOUNDS.orp, 0),
    temperatureC: clamp(m.temperature, BOUNDS.temp, 1),
    measuredAt,
    ageMinutes,
    // Absent flag is treated as valid — older firmware doesn't always send it.
    isValid: m.isValid === undefined ? true : Boolean(m.isValid),
  };
}

export function normalizePool(raw: unknown, now: Date = new Date()): IopoolPool | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const id = typeof p.id === "string" ? p.id : null;
  if (!id) return null;

  const advice = (p.advice ?? {}) as Record<string, unknown>;
  const filtration = Number(advice.filtrationDuration);

  return {
    id,
    title: typeof p.title === "string" && p.title ? p.title : "My spa",
    mode: typeof p.mode === "string" ? p.mode : null,
    hasActionRequired: Boolean(p.hasAnActionRequired),
    filtrationHours: Number.isFinite(filtration) ? filtration : null,
    measure: normalizeMeasure(p.latestMeasure, now),
  };
}

// The API returns an array of pools; pick the requested one, else the first.
export function pickPool(
  raw: unknown,
  preferredId?: string | null,
  now: Date = new Date(),
): IopoolPool | null {
  const list = Array.isArray(raw) ? raw : [raw];
  const pools = list
    .map((p) => normalizePool(p, now))
    .filter((p): p is IopoolPool => p !== null);
  if (pools.length === 0) return null;
  if (preferredId) {
    return pools.find((p) => p.id === preferredId) ?? pools[0];
  }
  return pools[0];
}
