// =============================================================================
//  lib/balance.ts
//  Langelier Saturation Index — "is this water going to scale up my heater, or
//  corrode my equipment?". PURE, no I/O.
//
//  Every other check in this app judges one number in isolation. Scale doesn't
//  work that way: pH, alkalinity, calcium and TEMPERATURE interact, so all four
//  can sit inside their target ranges while the combination steadily deposits
//  calcium carbonate on the heating element — the most expensive thing to
//  replace on an inflatable spa. Heat is the multiplier, which is why hot tubs
//  scale far more readily than pools.
//
//  We use the rigorous form rather than the pool-industry lookup table:
//
//      LSI  = pH - pHs
//      pHs  = (9.3 + A + B) - (C + D)
//      A    = (log10(TDS) - 1) / 10
//      B    = -13.12 * log10(°C + 273.15) + 34.55
//      C    = log10(calcium hardness as CaCO3) - 0.4
//      D    = log10(total alkalinity as CaCO3)
//
//  Why not the "pH + TF + CF + AF - 12.1" shortcut? Because the temperature
//  table it depends on actually reconciles to a constant of 12.2, not 12.1 —
//  checked by solving both forms against each other at 25 °C and 38 °C. Using
//  12.1 with that table overstates LSI by about 0.1, which would nudge readings
//  towards false "scaling" warnings. The exact form has no such seam, is
//  continuous in temperature (no interpolation), and makes the TDS assumption
//  explicit instead of hiding it in a constant.
//
//  Two honest limitations:
//    1. The full treatment subtracts a cyanuric-acid correction from alkalinity.
//       When a strip has measured CYA we now do exactly that (see
//       `carbonateAlkalinity` below) and the index is no longer approximate on
//       this point. WITHOUT a CYA reading we fall back to using total alkalinity
//       directly, which OVERSTATES LSI a little — erring towards warning about
//       scale early, the safe direction for a heater. `LsiSnapshot.cyaCorrected`
//       says which of the two applies so the UI never claims more than it knows.
//    2. TDS is assumed rather than measured. It's a weak term: across the whole
//       plausible spa range (500–2000 ppm) it moves LSI by under 0.06.
//
//  As everywhere in this app: guidance, not gospel. Dose gradually and retest.
// =============================================================================

// Spa water starts near tap TDS and climbs with every dose. A mid-range default.
export const ASSUMED_TDS_PPM = 1000;
export const ASSUMED_TEMP_C = 38; // fallback when there's no probe reading

/** The B term — how strongly temperature pushes water towards scaling. */
export function temperatureTerm(celsius: number): number {
  return -13.12 * Math.log10(celsius + 273.15) + 34.55;
}

/** The pH at which the water is exactly saturated — neither scaling nor hungry. */
export function saturationPh(
  alkalinityPpm: number,
  calciumHardnessPpm: number,
  celsius: number,
  tdsPpm: number = ASSUMED_TDS_PPM,
): number {
  const a = (Math.log10(tdsPpm) - 1) / 10;
  const b = temperatureTerm(celsius);
  const c = Math.log10(calciumHardnessPpm) - 0.4;
  const d = Math.log10(alkalinityPpm);
  return 9.3 + a + b - (c + d);
}

// --- Cyanuric acid (stabiliser) ----------------------------------------------
//
// A test strip's "total alkalinity" pad measures ALL alkalinity, but only the
// carbonate part takes part in the scaling balance. Cyanurate — the ion that
// stabiliser dissolves into — is counted by the test and does nothing here, so
// leaving it in inflates the D term and OVERSTATES LSI. That's the approximation
// this app shipped with, and a CYA reading removes it.
//
// How much cyanurate is present depends on pH, because cyanuric acid only
// partly dissociates:
//
//   factor(pH) = [ 1 / (1 + 10^(pKa - pH)) ] x (50 / 129)
//
// where 50 is the CaCO3 equivalent weight and 129 g/mol is cyanuric acid's molar
// mass. Continuous in pH — no interpolated table, for the same reason the
// temperature term isn't one.
//
// pKa 6.8 is chosen because it reproduces the factors the PHTA publishes:
// 0.310 against their 0.31 at pH 7.4, and 0.335 against their 0.33 at pH 7.6.
// (pKa 6.7 and 6.88 both miss by ~0.012, so this isn't a free parameter.)
//
// Worth knowing how big this is: at TA 100 it pulls LSI down by 0.04 at CYA 30,
// 0.08 at CYA 50 and 0.17 at CYA 100. Against band edges of +/-0.3 that is a
// real correction, not a rounding detail.
export const CYA_PKA = 6.8;
const CYA_CACO3_EQUIVALENT = 50 / 129;

/** How much of a ppm of stabiliser shows up as alkalinity at this pH. */
export function cyanurateCorrectionFactor(ph: number): number {
  return (1 / (1 + Math.pow(10, CYA_PKA - ph))) * CYA_CACO3_EQUIVALENT;
}

/**
 * The alkalinity that actually takes part in the scaling balance.
 * Without a CYA reading this returns total alkalinity unchanged — the old
 * behaviour, which errs towards warning about scale early.
 */
export function carbonateAlkalinity(
  totalAlkalinityPpm: number,
  cyanuricAcidPpm: number | null,
  ph: number,
): number {
  if (cyanuricAcidPpm === null || !Number.isFinite(cyanuricAcidPpm)) {
    return totalAlkalinityPpm;
  }
  const cyanurate = Math.max(0, cyanuricAcidPpm) * cyanurateCorrectionFactor(ph);
  return totalAlkalinityPpm - cyanurate;
}

export interface LsiInput {
  ph: number | null;
  alkalinityPpm: number | null;
  calciumHardnessPpm: number | null;
  temperatureC: number | null;
  /** Optional. Absent means "not measured", which is not the same as zero. */
  cyanuricAcidPpm?: number | null;
  tdsPpm?: number;
}

// Returns null when anything is missing — an index built on a guessed input
// would be worse than no index at all.
export function computeLsi(input: LsiInput): number | null {
  const { ph, alkalinityPpm, calciumHardnessPpm, temperatureC } = input;
  const tds = input.tdsPpm ?? ASSUMED_TDS_PPM;

  if (
    ph === null ||
    alkalinityPpm === null ||
    calciumHardnessPpm === null ||
    temperatureC === null
  ) {
    return null;
  }
  if (
    !Number.isFinite(ph) ||
    !Number.isFinite(temperatureC) ||
    alkalinityPpm <= 0 ||
    calciumHardnessPpm <= 0 ||
    tds <= 0 ||
    temperatureC <= -273
  ) {
    return null;
  }

  // Heavily stabilised water with low alkalinity can leave nothing carbonate
  // behind. That's a finding in its own right, not a number to fudge — say
  // nothing rather than take a logarithm of zero.
  const carbonate = carbonateAlkalinity(
    alkalinityPpm,
    input.cyanuricAcidPpm ?? null,
    ph,
  );
  if (carbonate <= 0) return null;

  const lsi = ph - saturationPh(carbonate, calciumHardnessPpm, temperatureC, tds);
  return Math.round(lsi * 100) / 100;
}

// --- Interpretation ----------------------------------------------------------
export type LsiBand =
  | "corrosive"
  | "slightly-corrosive"
  | "balanced"
  | "slightly-scaling"
  | "scaling";

export interface LsiVerdict {
  lsi: number;
  band: LsiBand;
  severity: "info" | "low" | "medium" | "high";
  headline: string;
  detail: string;
  /** Levers in priority order — the most effective, practical fix first. */
  actions: string[];
}

export function interpretLsi(lsi: number): LsiVerdict {
  // Scale-forming. Lower pH first: it's the biggest lever and the easiest to
  // move. Never suggest reducing calcium — you can't, short of draining.
  if (lsi > 0.5) {
    return {
      lsi,
      band: "scaling",
      severity: "high",
      headline: "Your water is scaling",
      detail:
        "At this balance, calcium is coming out of the water and depositing on surfaces — including the heating element, which is the expensive part to replace. Worth correcting now rather than at the next water change.",
      actions: [
        "Lower your pH towards 7.2 — this is the strongest and easiest lever.",
        "If pH is already low, bring total alkalinity down towards 80 ppm.",
        "Running a slightly cooler temperature between soaks also helps.",
      ],
    };
  }
  if (lsi > 0.3) {
    return {
      lsi,
      band: "slightly-scaling",
      severity: "medium",
      headline: "Drifting towards scale",
      detail:
        "Not urgent, but the water is starting to favour depositing calcium rather than holding it. Nudging it back now avoids scale on the heater later.",
      actions: [
        "Bring pH down towards the lower end of 7.2–7.6.",
        "If alkalinity is above 120 ppm, ease it down too.",
      ],
    };
  }
  // Aggressive water. Calcium is the right lever here — raising it is easy and
  // is what the water is actually short of.
  if (lsi < -0.5) {
    return {
      lsi,
      band: "corrosive",
      severity: "high",
      headline: "Your water is corrosive",
      detail:
        "The water is 'hungry' and will pull calcium from wherever it can — seals, fittings and metal parts including the heater. Soft tap water fresh from the mains often starts here.",
      actions: [
        "Add calcium hardness increaser to bring calcium towards 100–250 ppm.",
        "Check total alkalinity is at least 80 ppm.",
        "Then re-check pH is 7.2–7.6.",
      ],
    };
  }
  if (lsi < -0.3) {
    return {
      lsi,
      band: "slightly-corrosive",
      severity: "medium",
      headline: "Slightly aggressive water",
      detail:
        "Mildly corrosive. Not damaging overnight, but left alone it's hard on seals and metal parts.",
      actions: [
        "Raise calcium hardness a little towards 100–250 ppm.",
        "Nudge alkalinity up if it's below 80 ppm.",
      ],
    };
  }
  return {
    lsi,
    band: "balanced",
    severity: "info",
    headline: "Water is balanced",
    detail:
      "Your pH, alkalinity, calcium and temperature are working together — the water is neither depositing scale nor pulling minerals out of your equipment.",
    actions: [],
  };
}

// --- Occasional strip readings ------------------------------------------------
//
// Calcium and stabiliser both come from a strip used now and then, not from the
// probe, and both stay meaningful for days or weeks — unlike sanitiser, which
// moves hourly. So the most recent value carries forward.
//
// The hard rule, and the reason this is one shared function: a value from BEFORE
// the last drain describes water that no longer exists, and must never be
// carried across a water change.
export interface CalciumSource {
  valuePpm: number;
  measuredAt: string;
  ageDays: number;
}

export interface CalciumReadingLike {
  recorded_at: string;
  calcium_hardness_ppm: number | string | null;
}

export interface CyaReadingLike {
  recorded_at: string;
  cyanuric_acid_ppm?: number | string | null;
}

// The generic engine. `pick` pulls whichever column this lookup is about.
export function latestForFill<T extends { recorded_at: string }>(
  readings: T[],
  pick: (row: T) => number | string | null | undefined,
  fillStartIso: string | null,
  now: Date = new Date(),
): CalciumSource | null {
  const fillStart = fillStartIso ? new Date(fillStartIso).getTime() : null;

  const candidates = readings
    .map((r) => {
      const t = new Date(r.recorded_at).getTime();
      const raw = pick(r);
      const v = raw === null || raw === undefined || raw === "" ? null : Number(raw);
      return { t, v };
    })
    .filter(
      (x): x is { t: number; v: number } =>
        Number.isFinite(x.t) && x.v !== null && Number.isFinite(x.v) && x.v > 0,
    )
    // Only readings taken during the current fill.
    .filter((x) => (fillStart === null ? true : x.t >= fillStart))
    .sort((a, b) => b.t - a.t);

  if (candidates.length === 0) return null;
  const latest = candidates[0];
  return {
    valuePpm: latest.v,
    measuredAt: new Date(latest.t).toISOString(),
    ageDays: Math.max(
      0,
      Math.floor((now.getTime() - latest.t) / (24 * 60 * 60 * 1000)),
    ),
  };
}

export function latestCalciumForFill(
  readings: CalciumReadingLike[],
  fillStartIso: string | null,
  now: Date = new Date(),
): CalciumSource | null {
  return latestForFill(readings, (r) => r.calcium_hardness_ppm, fillStartIso, now);
}

export function latestCyaForFill(
  readings: CyaReadingLike[],
  fillStartIso: string | null,
  now: Date = new Date(),
): CalciumSource | null {
  return latestForFill(readings, (r) => r.cyanuric_acid_ppm, fillStartIso, now);
}

// Calcium barely moves between water changes, but it does move — every top-up
// with fresh tap water shifts it. After a month, treat the number as a guide
// rather than a measurement and say so.
export const CALCIUM_STALE_DAYS = 30;

// Stabiliser goes stale faster: with dichlor, every single dose adds more of it,
// so a fortnight-old number is already behind the water.
export const CYA_STALE_DAYS = 14;

// A probe temperature older than this is no longer "what the water is now".
const TEMP_FRESH_DAYS = 7;

// --- LSI over time -----------------------------------------------------------
export interface LsiSeriesReading {
  recorded_at: string;
  ph: number | string | null;
  total_alkalinity_ppm: number | string | null;
  calcium_hardness_ppm: number | string | null;
  cyanuric_acid_ppm?: number | string | null;
}
export interface TempRow {
  measured_at: string;
  temperature_c: number | string | null;
}

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Pairs each test reading with the closest probe temperature so the trend chart
// reflects the water's actual heat, falling back to the assumed temperature when
// there's no probe history.
export function lsiSeries(
  readings: LsiSeriesReading[],
  probeRows: TempRow[],
  fillStartIso: string | null = null,
): { date: string; value: number | null }[] {
  const temps = probeRows
    .map((p) => ({
      t: new Date(p.measured_at).getTime(),
      c: toNum(p.temperature_c),
    }))
    .filter((x): x is { t: number; c: number } => Number.isFinite(x.t) && x.c !== null)
    .sort((a, b) => a.t - b.t);

  const nearestTemp = (t: number): number => {
    if (temps.length === 0) return ASSUMED_TEMP_C;
    let best = temps[0];
    let bestGap = Math.abs(temps[0].t - t);
    for (const p of temps) {
      const gap = Math.abs(p.t - t);
      if (gap < bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    return best.c;
  };

  const ordered = [...readings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  return ordered.map((r) => {
    const t = new Date(r.recorded_at).getTime();
    // Calcium as known at that point in the fill, so history isn't rewritten by
    // a measurement taken later.
    const soFar = ordered.filter((x) => new Date(x.recorded_at).getTime() <= t);
    const calcium = latestCalciumForFill(soFar, fillStartIso, new Date(t));
    const cya = latestCyaForFill(soFar, fillStartIso, new Date(t));
    return {
      date: r.recorded_at,
      value: computeLsi({
        ph: toNum(r.ph),
        alkalinityPpm: toNum(r.total_alkalinity_ppm),
        calciumHardnessPpm: calcium?.valuePpm ?? null,
        cyanuricAcidPpm: cya?.valuePpm ?? null,
        temperatureC: Number.isFinite(t) ? nearestTemp(t) : ASSUMED_TEMP_C,
      }),
    };
  });
}

// --- Where the app actually stands right now ---------------------------------
//
// One function assembles the whole picture from the sources that hold the
// pieces — the last strip test (pH, alkalinity), whichever strip last measured
// calcium or stabiliser during this fill, and the probe's latest temperature.
// Both the dashboard card and the post-test result read from this, so they can
// never disagree with each other.
export interface LsiSnapshot {
  lsi: number | null;
  verdict: LsiVerdict | null;
  ph: number | null;
  alkalinityPpm: number | null;
  calcium: CalciumSource | null;
  calciumIsStale: boolean;
  /** Stabiliser, when a strip has measured it during this fill. */
  cya: CalciumSource | null;
  cyaIsStale: boolean;
  /** Alkalinity with cyanurate taken out — what the index actually uses. */
  carbonateAlkalinityPpm: number | null;
  temperatureC: number;
  /** False when we fell back to ASSUMED_TEMP_C instead of a probe reading. */
  temperatureIsMeasured: boolean;
  /** True once CYA is known, i.e. the "errs early" caveat no longer applies. */
  cyaCorrected: boolean;
  /** Set when stabiliser has swallowed the whole alkalinity reading. */
  overStabilised: boolean;
  /** Plain-English list of what's still needed, when `lsi` is null. */
  missing: string[];
}

export function lsiSnapshot(
  readings: LsiSeriesReading[],
  probeRows: TempRow[],
  fillStartIso: string | null = null,
  now: Date = new Date(),
): LsiSnapshot {
  const nowMs = now.getTime();

  const latestReading = [...readings]
    .map((r) => ({ r, t: new Date(r.recorded_at).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => b.t - a.t)[0]?.r;

  const ph = toNum(latestReading?.ph ?? null);
  const alkalinityPpm = toNum(latestReading?.total_alkalinity_ppm ?? null);
  const calcium = latestCalciumForFill(readings, fillStartIso, now);
  const cya = latestCyaForFill(readings, fillStartIso, now);

  const latestTemp = probeRows
    .map((p) => ({ t: new Date(p.measured_at).getTime(), c: toNum(p.temperature_c) }))
    .filter((x): x is { t: number; c: number } => Number.isFinite(x.t) && x.c !== null)
    .sort((a, b) => b.t - a.t)[0];
  const tempIsFresh =
    latestTemp !== undefined &&
    nowMs - latestTemp.t <= TEMP_FRESH_DAYS * 24 * 60 * 60 * 1000;
  const temperatureC = tempIsFresh ? latestTemp.c : ASSUMED_TEMP_C;

  const missing: string[] = [];
  if (ph === null || alkalinityPpm === null) {
    missing.push("a water test with pH and total alkalinity");
  }
  if (calcium === null) {
    missing.push("a calcium hardness reading");
  }
  // Not a missing input — a real result. Stabiliser has eaten the entire
  // alkalinity reading, so there is no carbonate left to balance against.
  if (
    ph !== null &&
    alkalinityPpm !== null &&
    carbonateAlkalinity(alkalinityPpm, cya?.valuePpm ?? null, ph) <= 0
  ) {
    missing.push("fresh water — stabiliser has swallowed your whole alkalinity reading");
  }

  const lsi = computeLsi({
    ph,
    alkalinityPpm,
    calciumHardnessPpm: calcium?.valuePpm ?? null,
    cyanuricAcidPpm: cya?.valuePpm ?? null,
    temperatureC,
  });

  const carbonate =
    ph === null || alkalinityPpm === null
      ? null
      : carbonateAlkalinity(alkalinityPpm, cya?.valuePpm ?? null, ph);

  return {
    lsi,
    verdict: lsi === null ? null : interpretLsi(lsi),
    ph,
    alkalinityPpm,
    calcium,
    calciumIsStale: calcium !== null && calcium.ageDays > CALCIUM_STALE_DAYS,
    cya,
    cyaIsStale: cya !== null && cya.ageDays > CYA_STALE_DAYS,
    carbonateAlkalinityPpm: carbonate === null ? null : Math.round(carbonate * 10) / 10,
    cyaCorrected: cya !== null,
    overStabilised: carbonate !== null && carbonate <= 0,
    temperatureC,
    temperatureIsMeasured: tempIsFresh,
    missing,
  };
}
