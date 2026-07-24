// =============================================================================
//  lib/chemistry.ts
//  Pure hot-tub chemistry calculator. NO database, NO network, NO side effects.
//  Everything it needs is passed in, so it can be unit-tested in isolation.
//
//  IMPORTANT SAFETY FRAMING: the numbers here are widely-used starting
//  estimates, not exact science. Every recommendation carries a disclaimer and
//  the caller renders a "do not use the spa" banner for `safety`-severity
//  results. Users are always told to dose gradually, circulate, and retest.
// =============================================================================

export type SanitizerType = "chlorine" | "bromine";

// Severity drives colour/urgency in the UI. `safety` is the strongest — it
// means "there is a health reason not to get in the water right now".
export type Severity = "info" | "low" | "medium" | "high" | "safety";

export interface TargetRanges {
  phIdealMin: number;
  phIdealMax: number;
  phAcceptableMin: number;
  phAcceptableMax: number;
  taMin: number;
  taMax: number;
  fcMin: number;
  fcMax: number;
  brMin: number;
  brMax: number;
  chMin: number;
  chMax: number;
}

export interface DosingConstants {
  taIncreaserGPer1000LPer10Ppm: number;
  phIncreaserDoseSmallG: number;
  phIncreaserDoseMediumG: number;
  phIncreaserDoseLargeG: number;
  phDecreaserDoseSmallG: number;
  phDecreaserDoseMediumG: number;
  phDecreaserDoseLargeG: number;
  dichlorAvailableChlorineFraction: number;
  bromineTopUpGPer1000L: number;
  bromineInitialChargeGPer1000L: number;
  sodiumBromideGPer1000L: number;
  mpsShockGPer1000L: number;
}

export interface SpaConfig {
  volumeLitres: number;
  sanitizerType: SanitizerType;
  targetRanges: TargetRanges;
  dosingConstants: DosingConstants;
}

export interface TestReadingInput {
  ph: number;
  freeChlorinePpm?: number | null;
  brominePpm?: number | null;
  totalAlkalinityPpm: number;
  calciumHardnessPpm?: number | null;
  isFreshFill?: boolean;
}

// A single recommended action. `amountGrams === null` means "do this, but it's
// an instruction not a weighed dose" (e.g. "top up your bromine floater").
export interface Recommendation {
  // `chemical` matches the dosing_log.chemical enum so the UI can pre-fill a
  // "log what I added" form. `null` for purely informational items.
  chemical: string | null;
  label: string;
  amountGrams: number | null;
  instructions: string;
  severity: Severity;
  order: number; // 1=alkalinity, 2=pH, 3=sanitizer, 4=shock, 5=other/info
}

export interface SafetyFlag {
  code: string;
  message: string;
  severity: "warning" | "danger";
}

export interface CalculationResult {
  recommendations: Recommendation[];
  safetyFlags: SafetyFlag[];
  summary: string;
}

// Standard disclaimer appended to every dosing instruction.
const DISCLAIMER =
  "General guidance only — always confirm against your product's label. " +
  "Add chemicals gradually, run the pump to circulate, wait, then retest before adding more.";

// Sensible default ranges (CDC / industry typical). Editable in Settings.
export const DEFAULT_TARGET_RANGES: TargetRanges = {
  phIdealMin: 7.4,
  phIdealMax: 7.6,
  phAcceptableMin: 7.2,
  phAcceptableMax: 7.8,
  taMin: 80,
  taMax: 120,
  fcMin: 3,
  fcMax: 5,
  brMin: 3,
  brMax: 5,
  chMin: 100,
  chMax: 250,
};

// Default dosing coefficients. Editable in Settings if a product differs.
export const DEFAULT_DOSING_CONSTANTS: DosingConstants = {
  taIncreaserGPer1000LPer10Ppm: 24,
  phIncreaserDoseSmallG: 11,
  phIncreaserDoseMediumG: 22,
  phIncreaserDoseLargeG: 33,
  phDecreaserDoseSmallG: 11,
  phDecreaserDoseMediumG: 22,
  phDecreaserDoseLargeG: 33,
  dichlorAvailableChlorineFraction: 0.56,
  bromineTopUpGPer1000L: 5,
  bromineInitialChargeGPer1000L: 25,
  sodiumBromideGPer1000L: 6,
  mpsShockGPer1000L: 17,
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Scale a "per 1000 litres" figure to the actual spa volume.
function perVolume(gPer1000L: number, volumeLitres: number): number {
  return (gPer1000L * volumeLitres) / 1000;
}

// -----------------------------------------------------------------------------
// Step 1: Total Alkalinity. Adjusted first because it buffers pH.
// -----------------------------------------------------------------------------
function alkalinityStep(
  reading: TestReadingInput,
  config: SpaConfig,
): Recommendation | null {
  const { taMin, taMax } = config.targetRanges;
  const ta = reading.totalAlkalinityPpm;
  const mid = (taMin + taMax) / 2;

  if (ta < taMin) {
    const deficit = mid - ta;
    const grams = round1(
      (deficit / 10) *
        perVolume(config.dosingConstants.taIncreaserGPer1000LPer10Ppm, config.volumeLitres),
    );
    return {
      chemical: "ta_increaser",
      label: "Raise Total Alkalinity",
      amountGrams: grams,
      instructions:
        `Alkalinity is low (${ta} ppm, aim for ${taMin}–${taMax}). ` +
        `Add about ${grams} g of alkalinity increaser (sodium bicarbonate). ${DISCLAIMER}`,
      severity: "medium",
      order: 1,
    };
  }

  if (ta > taMax) {
    return {
      chemical: "ta_decreaser",
      label: "Lower Total Alkalinity",
      amountGrams: null,
      instructions:
        `Alkalinity is high (${ta} ppm, aim for ${taMin}–${taMax}). ` +
        `Add pH/alkalinity decreaser (dry acid) in small amounts, or dilute with fresh water. ` +
        `Because lowering alkalinity is imprecise, add a little, circulate, and retest rather than dosing in one go. ${DISCLAIMER}`,
      severity: "low",
      order: 1,
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// Step 2: pH. Non-linear, so we use stepped small/medium/large doses by how far
// out of the acceptable band the reading is — never a naive linear formula.
// -----------------------------------------------------------------------------
function phStep(
  reading: TestReadingInput,
  config: SpaConfig,
): { rec: Recommendation | null; flag: SafetyFlag | null } {
  const { phIdealMin, phIdealMax, phAcceptableMin, phAcceptableMax } =
    config.targetRanges;
  const ph = reading.ph;
  const c = config.dosingConstants;

  // Inside the ideal band → nothing to do.
  if (ph >= phIdealMin && ph <= phIdealMax) {
    return { rec: null, flag: null };
  }

  const tooLow = ph < phIdealMin;
  const direction = tooLow ? "increaser" : "decreaser";
  const chemical = tooLow ? "ph_increaser" : "ph_decreaser";
  const productName = tooLow ? "pH increaser (soda ash)" : "pH decreaser (dry acid)";

  // How far outside the *acceptable* band are we? (0 if inside acceptable.)
  const distanceOutsideAcceptable = tooLow
    ? Math.max(0, phAcceptableMin - ph)
    : Math.max(0, ph - phAcceptableMax);

  let bucket: "small" | "medium" | "large";
  let severity: Severity;
  let flag: SafetyFlag | null = null;

  if (distanceOutsideAcceptable === 0) {
    // Inside acceptable but outside ideal — gentle nudge.
    bucket = "small";
    severity = "low";
  } else if (distanceOutsideAcceptable <= 0.3) {
    bucket = "medium";
    severity = "medium";
  } else {
    bucket = "large";
    severity = "high";
    flag = {
      code: "ph_out_of_range",
      message: `pH is well outside the safe range (${ph}). Correct it before using the spa — badly balanced water can irritate skin and eyes and stops your sanitizer working.`,
      severity: "danger",
    };
  }

  const doseTable = tooLow
    ? {
        small: c.phIncreaserDoseSmallG,
        medium: c.phIncreaserDoseMediumG,
        large: c.phIncreaserDoseLargeG,
      }
    : {
        small: c.phDecreaserDoseSmallG,
        medium: c.phDecreaserDoseMediumG,
        large: c.phDecreaserDoseLargeG,
      };

  const grams = round1(perVolume(doseTable[bucket], config.volumeLitres));

  const rec: Recommendation = {
    chemical,
    label: tooLow ? "Raise pH" : "Lower pH",
    amountGrams: grams,
    instructions:
      `pH is ${ph} (aim for ${phIdealMin}–${phIdealMax}). ` +
      `Add about ${grams} g of ${productName} as a ${bucket} dose. ` +
      `pH does not move in a straight line, so this is deliberately a stepped dose — ` +
      `add it, circulate, wait, and retest before adding any more. ${DISCLAIMER}`,
    severity,
    order: 2,
  };

  return { rec, flag };
}

// -----------------------------------------------------------------------------
// Step 3: Sanitizer. Branches on chlorine vs bromine (they behave differently).
// -----------------------------------------------------------------------------
function sanitizerStep(
  reading: TestReadingInput,
  config: SpaConfig,
): { rec: Recommendation | null; flag: SafetyFlag | null } {
  if (config.sanitizerType === "chlorine") {
    return chlorineStep(reading, config);
  }
  return bromineStep(reading, config);
}

function chlorineStep(
  reading: TestReadingInput,
  config: SpaConfig,
): { rec: Recommendation | null; flag: SafetyFlag | null } {
  const { fcMin, fcMax } = config.targetRanges;
  const fc = reading.freeChlorinePpm;

  if (fc === null || fc === undefined) {
    return {
      rec: {
        chemical: null,
        label: "No chlorine reading",
        amountGrams: null,
        instructions:
          "You did not enter a free chlorine reading. Test your chlorine before getting in — sanitizer keeps the water safe.",
        severity: "info",
        order: 3,
      },
      flag: null,
    };
  }

  if (fc > fcMax) {
    return {
      rec: {
        chemical: null,
        label: "Chlorine too high — do not use",
        amountGrams: null,
        instructions:
          `Chlorine is high (${fc} ppm, aim for ${fcMin}–${fcMax}). ` +
          "Do not get in. Leave the cover off and let it fall naturally, or dilute with fresh water, then retest.",
        severity: "safety",
        order: 3,
      },
      flag: {
        code: "sanitizer_too_high",
        message: `Chlorine is too high (${fc} ppm). Wait for it to drop below ${fcMax} ppm before using the spa.`,
        severity: "danger",
      },
    };
  }

  if (fc < fcMin) {
    // dichlor dose: grams = desiredPpmIncrease * litres / (1000 * availableFraction)
    const mid = (fcMin + fcMax) / 2;
    const desiredIncrease = mid - fc;
    const grams = round1(
      (desiredIncrease * config.volumeLitres) /
        (1000 * config.dosingConstants.dichlorAvailableChlorineFraction),
    );
    return {
      rec: {
        chemical: "dichlor",
        label: "Raise chlorine",
        amountGrams: grams,
        instructions:
          `Chlorine is low (${fc} ppm, aim for ${fcMin}–${fcMax}). ` +
          `Add about ${grams} g of chlorine granules (dichlor) with the pump running. ${DISCLAIMER}`,
        severity: fc === 0 ? "high" : "medium",
        order: 3,
      },
      flag: null,
    };
  }

  return { rec: null, flag: null };
}

function bromineStep(
  reading: TestReadingInput,
  config: SpaConfig,
): { rec: Recommendation | null; flag: SafetyFlag | null } {
  const { brMin, brMax } = config.targetRanges;
  const br = reading.brominePpm;
  const c = config.dosingConstants;

  // Fresh fill in bromine mode → build a "bromide bank" with sodium bromide.
  if (reading.isFreshFill) {
    const grams = round1(perVolume(c.sodiumBromideGPer1000L, config.volumeLitres));
    return {
      rec: {
        chemical: "sodium_bromide",
        label: "Start bromine (fresh fill)",
        amountGrams: grams,
        instructions:
          `Fresh fill on bromine: build your bromide reserve by adding about ${grams} g of sodium bromide, ` +
          "then add non-chlorine shock (MPS) to activate it. Repeat until bromine reads 3–5 ppm, then keep it topped up with tablets in your floater. " +
          DISCLAIMER,
        severity: "medium",
        order: 3,
      },
      flag: null,
    };
  }

  if (br === null || br === undefined) {
    return {
      rec: {
        chemical: null,
        label: "No bromine reading",
        amountGrams: null,
        instructions:
          "You did not enter a bromine reading. Test your bromine before getting in — sanitizer keeps the water safe.",
        severity: "info",
        order: 3,
      },
      flag: null,
    };
  }

  if (br > brMax) {
    return {
      rec: {
        chemical: null,
        label: "Bromine too high — do not use",
        amountGrams: null,
        instructions:
          `Bromine is high (${br} ppm, aim for ${brMin}–${brMax}). ` +
          "Do not get in. Close the floater dial, leave the cover off, or dilute with fresh water, then retest.",
        severity: "safety",
        order: 3,
      },
      flag: {
        code: "sanitizer_too_high",
        message: `Bromine is too high (${br} ppm). Wait for it to drop below ${brMax} ppm before using the spa.`,
        severity: "danger",
      },
    };
  }

  if (br < brMin) {
    const criticallyLow = br < brMin / 2;
    if (criticallyLow) {
      // Critically low → a one-off granule boost, plus fix the floater.
      const grams = round1(perVolume(c.bromineTopUpGPer1000L, config.volumeLitres));
      return {
        rec: {
          chemical: "bromine_granules",
          label: "Boost bromine now",
          amountGrams: grams,
          instructions:
            `Bromine is very low (${br} ppm, aim for ${brMin}–${brMax}). ` +
            `Add about ${grams} g of bromine granules now for a quick boost, and check your floater still has tablets with the dial open. ${DISCLAIMER}`,
          severity: "high",
          order: 3,
        },
        flag: null,
      };
    }
    // Mildly low → this is normally handled by tablets, not a weighed dose.
    return {
      rec: {
        chemical: null,
        label: "Top up bromine floater",
        amountGrams: null,
        instructions:
          `Bromine is a little low (${br} ppm, aim for ${brMin}–${brMax}). ` +
          "Check your floating dispenser still has tablets in it and open the dial a notch to release more. Retest tomorrow.",
        severity: "low",
        order: 3,
      },
      flag: null,
    };
  }

  return { rec: null, flag: null };
}

// -----------------------------------------------------------------------------
// Step 4: Shock. Triggered only when the active sanitizer reads exactly 0 —
// a clear "no protection in the water" signal. Routine weekly shock is handled
// by the maintenance calendar, not here.
// -----------------------------------------------------------------------------
function shockStep(
  reading: TestReadingInput,
  config: SpaConfig,
): Recommendation | null {
  const active =
    config.sanitizerType === "chlorine"
      ? reading.freeChlorinePpm
      : reading.brominePpm;

  if (active === 0) {
    const grams = round1(
      perVolume(config.dosingConstants.mpsShockGPer1000L, config.volumeLitres),
    );
    return {
      chemical: "mps_shock",
      label: "Shock the water",
      amountGrams: grams,
      instructions:
        "Your sanitizer reads zero, so the water is unprotected. " +
        `Add about ${grams} g of non-chlorine shock (MPS) with the pump running, and do not use the spa until sanitizer is back in range. ${DISCLAIMER}`,
      severity: "high",
      order: 4,
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// Step 5: Calcium hardness — informational only, and ONLY if a value was given.
// Absence of the reading must never produce a false flag.
// -----------------------------------------------------------------------------
function calciumFlag(
  reading: TestReadingInput,
  config: SpaConfig,
): Recommendation | null {
  const ch = reading.calciumHardnessPpm;
  if (ch === null || ch === undefined) return null;

  const { chMin, chMax } = config.targetRanges;
  if (ch >= chMin && ch <= chMax) return null;

  const low = ch < chMin;
  return {
    chemical: null,
    label: low ? "Calcium hardness low" : "Calcium hardness high",
    amountGrams: null,
    instructions: low
      ? `Calcium hardness is low (${ch} ppm, aim for ${chMin}–${chMax}). Low calcium can make water corrosive; a calcium hardness increaser helps. This is less critical for an inflatable spa.`
      : `Calcium hardness is high (${ch} ppm, aim for ${chMin}–${chMax}). High calcium can cause cloudiness and scale; diluting with softer water helps. This is less critical for an inflatable spa.`,
    severity: "info",
    order: 5,
  };
}

// -----------------------------------------------------------------------------
// Public entry point. Runs the steps in real-world dosing order and returns an
// ordered list of recommendations plus any safety flags.
// -----------------------------------------------------------------------------
export function calculateRecommendations(
  reading: TestReadingInput,
  config: SpaConfig,
): CalculationResult {
  const recommendations: Recommendation[] = [];
  const safetyFlags: SafetyFlag[] = [];

  const ta = alkalinityStep(reading, config);
  if (ta) recommendations.push(ta);

  const ph = phStep(reading, config);
  if (ph.rec) recommendations.push(ph.rec);
  if (ph.flag) safetyFlags.push(ph.flag);

  const san = sanitizerStep(reading, config);
  if (san.rec) recommendations.push(san.rec);
  if (san.flag) safetyFlags.push(san.flag);

  const shock = shockStep(reading, config);
  if (shock) recommendations.push(shock);

  const ch = calciumFlag(reading, config);
  if (ch) recommendations.push(ch);

  // Keep the canonical dosing order stable regardless of input shape.
  recommendations.sort((a, b) => a.order - b.order);

  const actionable = recommendations.filter(
    (r) => r.severity !== "info",
  ).length;

  let summary: string;
  if (safetyFlags.some((f) => f.severity === "danger")) {
    summary = "Do not use the spa yet — see the safety warning below.";
  } else if (actionable === 0) {
    summary = "Water looks balanced. Nothing to add right now. Enjoy your soak!";
  } else if (actionable === 1) {
    summary = "One thing to adjust — details below.";
  } else {
    summary = `${actionable} things to adjust — add them in the order shown below.`;
  }

  return { recommendations, safetyFlags, summary };
}
