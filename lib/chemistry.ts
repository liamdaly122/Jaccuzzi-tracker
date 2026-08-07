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

// How the user measures sanitiser.
//   ppm — a test strip / liquid kit reads the CONCENTRATION of sanitiser.
//   orp — a probe (e.g. iopool) reads OXIDATION-REDUCTION POTENTIAL in mV:
//         how hard the water is actually oxidising, i.e. whether the sanitiser
//         is genuinely working.
// These two are NOT interconvertible. ORP depends on pH, cyanuric acid,
// temperature and probe calibration, so the same ppm can read wildly different
// mV. We therefore never derive one from the other — we store whichever the
// user measured and judge it on its own terms.
export type SanitizerUnit = "ppm" | "orp";

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
  // Cyanuric acid (stabiliser). A spa needs far less than a pool — there's no
  // sunlight to protect against indoors and the volume is tiny, so it climbs
  // fast on dichlor. Above cyaDrainAbove the only fix is fresh water.
  cyaMin: number;
  cyaMax: number;
  cyaDrainAbove: number;
  // The temperature you actually soak at. 40 C is the ceiling: it's both the
  // standard hot-tub safety limit and the highest the Lay-Z-Spa will go.
  tempTarget: number;
  // ORP (mV) — WHO puts the effective-sanitiser floor at 650; 650-750 is the
  // usual domestic target, and very high readings are harsh on skin and eyes.
  orpMin: number;
  orpMax: number;
  orpDangerHigh: number;
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
  /** Defaults to "ppm" when absent, so existing settings keep working. */
  sanitizerUnit?: SanitizerUnit;
  targetRanges: TargetRanges;
  dosingConstants: DosingConstants;
}

export interface TestReadingInput {
  ph: number;
  freeChlorinePpm?: number | null;
  brominePpm?: number | null;
  totalAlkalinityPpm: number;
  calciumHardnessPpm?: number | null;
  /** Cyanuric acid / stabiliser in ppm, from a strip that tests it. */
  cyanuricAcidPpm?: number | null;
  /** Millivolts from an ORP probe, when the user has one. */
  orpMv?: number | null;
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
export const TEMP_MIN_C = 20;
export const TEMP_MAX_C = 40;

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
  cyaMin: 20,
  cyaMax: 50,
  cyaDrainAbove: 100,
  tempTarget: 38,
  orpMin: 650,
  orpMax: 750,
  orpDangerHigh: 850,
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
  // An ORP probe measures effectiveness, not concentration, so it gets its own
  // branch. If the user also typed a ppm value we prefer the ppm path, because
  // only a concentration can produce an exact weighed dose.
  if (config.sanitizerUnit === "orp") {
    const ppm =
      config.sanitizerType === "chlorine"
        ? reading.freeChlorinePpm
        : reading.brominePpm;
    if (ppm === null || ppm === undefined) {
      return orpStep(reading, config);
    }
  }
  if (config.sanitizerType === "chlorine") {
    return chlorineStep(reading, config);
  }
  return bromineStep(reading, config);
}

// -----------------------------------------------------------------------------
// ORP branch. Deliberately does NOT convert mV to ppm — that relationship
// depends on pH, stabiliser level, temperature and probe calibration, so any
// conversion would be a guess dressed up as a number. Instead we judge whether
// the sanitiser is WORKING, and recommend a measured top-up plus a retest,
// exactly as we already do for pH (which is likewise non-linear).
// -----------------------------------------------------------------------------
function orpStep(
  reading: TestReadingInput,
  config: SpaConfig,
): { rec: Recommendation | null; flag: SafetyFlag | null } {
  const { orpMin, orpMax, orpDangerHigh, phIdealMin, phIdealMax } =
    config.targetRanges;
  const mv = reading.orpMv;
  const sanitizerName =
    config.sanitizerType === "chlorine" ? "chlorine" : "bromine";
  const chemical =
    config.sanitizerType === "chlorine" ? "dichlor" : "bromine_granules";

  if (mv === null || mv === undefined) {
    return {
      rec: {
        chemical: null,
        label: "No sanitiser reading",
        amountGrams: null,
        instructions:
          "You didn't enter an ORP reading. Test before getting in — sanitiser is what keeps the water safe.",
        severity: "info",
        order: 3,
      },
      flag: null,
    };
  }

  if (mv > orpDangerHigh) {
    return {
      rec: {
        chemical: null,
        label: "Sanitiser too strong — do not use",
        amountGrams: null,
        instructions:
          `ORP is very high (${mv} mV, aim for ${orpMin}–${orpMax}). ` +
          "Do not get in. Leave the cover off and let it fall, or dilute with fresh water, then retest.",
        severity: "safety",
        order: 3,
      },
      flag: {
        code: "sanitizer_too_high",
        message: `ORP is ${mv} mV — too strong to bathe in. Wait for it to fall below ${orpMax} mV.`,
        severity: "danger",
      },
    };
  }

  if (mv > orpMax) {
    return {
      rec: {
        chemical: null,
        label: "Sanitiser a little strong",
        amountGrams: null,
        instructions:
          `ORP is ${mv} mV (aim for ${orpMin}–${orpMax}). Hold off adding any more ${sanitizerName} and let it drift down, then retest.`,
        severity: "low",
        order: 3,
      },
      flag: null,
    };
  }

  if (mv < orpMin) {
    // The classic trap: high pH cripples ORP even when there's plenty of
    // sanitiser in the water. Say so rather than sending them for more chemical.
    const phHigh = reading.ph > phIdealMax;
    const grams = round1(
      perVolume(config.dosingConstants.bromineTopUpGPer1000L, config.volumeLitres),
    );
    const critical = mv < orpMin - 100;

    return {
      rec: {
        chemical,
        label: critical ? "Sanitiser not working" : "Raise sanitiser",
        amountGrams: config.sanitizerType === "bromine" ? grams : null,
        instructions: phHigh
          ? `ORP is low (${mv} mV, aim for ${orpMin}–${orpMax}) and your pH is above ${phIdealMax}. ` +
            "High pH cripples sanitiser, so fix the pH FIRST and retest — the ORP often recovers on its own without adding anything."
          : `ORP is low (${mv} mV, aim for ${orpMin}–${orpMax}), so the water isn't sanitising properly. ` +
            `Add a small amount of ${sanitizerName}, circulate for 20–30 minutes, then retest and repeat if needed. ` +
            "A probe reads effectiveness rather than dose, so build up gradually rather than adding one big amount. " +
            DISCLAIMER,
        severity: critical ? "high" : "medium",
        order: 3,
      },
      flag: critical
        ? {
            code: "sanitizer_ineffective",
            message: `ORP is only ${mv} mV (needs ${orpMin}+). The water is not being sanitised — don't get in until it recovers.`,
            severity: "danger",
          }
        : null,
    };
  }

  // In band — but if pH is out, note that the reading will move when pH is fixed.
  const phOut = reading.ph < phIdealMin || reading.ph > phIdealMax;
  return {
    rec: phOut
      ? {
          chemical: null,
          label: "Sanitiser working",
          amountGrams: null,
          instructions:
            `ORP is ${mv} mV, which is in range. Note that fixing your pH will shift this reading, so retest afterwards.`,
          severity: "info",
          order: 3,
        }
      : null,
    flag: null,
  };
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

  // On a probe there is no "zero ppm" to key off, so a badly depressed ORP is
  // the equivalent signal that the water has no working protection left.
  const orpCollapsed =
    config.sanitizerUnit === "orp" &&
    (active === null || active === undefined) &&
    reading.orpMv !== null &&
    reading.orpMv !== undefined &&
    reading.orpMv < config.targetRanges.orpMin - 100;

  if (active === 0 || orpCollapsed) {
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
      ? `Calcium hardness is low (${ch} ppm, aim for ${chMin}–${chMax}). Soft water is "hungry" — it pulls calcium out of whatever it can reach, including the heater and its seals. A calcium hardness increaser fixes it.`
      : `Calcium hardness is high (${ch} ppm, aim for ${chMin}–${chMax}). There's no additive that removes calcium, so the practical fix is diluting with softer water at the next top-up or refill. Meanwhile keep pH at the lower end of range, which is what stops it depositing as scale.`,
    // Not decorative. Calcium is one of the four inputs to the saturation index
    // (lib/balance.ts) — the check that decides whether the water scales up the
    // heating element or corrodes it. See the heater-protection card.
    severity: "low",
    order: 5,
  };
}

// Cyanuric acid — the one reading with no chemical answer.
//
// Dichlor carries stabiliser in with every dose, and nothing except fresh water
// takes it back out. Left to climb it does two things at once: it suppresses ORP
// so the sanitiser stops working ("chlorine lock"), and it inflates the
// alkalinity reading so the water looks better balanced than it is (see
// lib/balance.ts). So this flag never offers a dose — it tells you where you are
// on the road to a water change.
function cyaFlag(
  reading: TestReadingInput,
  config: SpaConfig,
): Recommendation | null {
  const cya = reading.cyanuricAcidPpm;
  if (cya === null || cya === undefined) return null;

  const { cyaMin, cyaMax, cyaDrainAbove } = config.targetRanges;

  if (cya > cyaDrainAbove) {
    return {
      chemical: null,
      label: "Stabiliser too high — change the water",
      amountGrams: null,
      instructions: `Stabiliser is ${cya} ppm (aim for ${cyaMin}–${cyaMax}). At this level chlorine struggles to work however much you add, and no product removes stabiliser — draining and refilling is the only fix. Your sanitiser readings can't be trusted until you do.`,
      severity: "high",
      order: 6,
    };
  }
  if (cya > cyaMax) {
    return {
      chemical: null,
      label: "Stabiliser getting high",
      amountGrams: null,
      instructions: `Stabiliser is ${cya} ppm (aim for ${cyaMin}–${cyaMax}). It only goes up while you're using dichlor, and the only way down is fresh water — so treat this as your water change getting closer rather than something to dose for.`,
      severity: "low",
      order: 6,
    };
  }
  if (cya < cyaMin) {
    return {
      chemical: null,
      label: "Stabiliser low",
      amountGrams: null,
      instructions: `Stabiliser is ${cya} ppm (aim for ${cyaMin}–${cyaMax}). Not a problem for a covered indoor spa — it mainly protects chlorine from sunlight — and dichlor will raise it on its own with normal use.`,
      severity: "info",
      order: 6,
    };
  }
  return null;
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

  const cya = cyaFlag(reading, config);
  if (cya) recommendations.push(cya);

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
