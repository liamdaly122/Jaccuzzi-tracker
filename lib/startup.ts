// =============================================================================
//  lib/startup.ts
//  The fresh-water setup sequence: an ordered list of stages that takes a brand
//  new (or freshly refilled) tub from "unsafe" to "safe to use", in the correct
//  order, branching by sanitizer. PURE, no I/O.
//
//  Dose figures come from the user's supplied reference docs:
//    - Chlorine: ClearWater Hot Tub Starter Kit (Wilton Bradley) leaflet.
//    - Bromine: UK BCDMH label consensus (ClearSpa/SpaChem/Catalina/etc.).
//  These are widely-used starting figures. THE PRODUCT PACK IN HAND ALWAYS
//  OVERRIDES THESE — every dose the wizard shows is paired with that reminder.
//
//  For the TA / pH / sanitizer *correction* amounts we deliberately reuse the
//  app's existing calculator (calculateRecommendations) at runtime, so the
//  wizard's numbers always match the Test screen. This module only adds the
//  fresh-fill-specific pieces the normal calculator doesn't produce (the
//  chlorine commissioning dose and the bromine "bromide bank" build), plus the
//  ordered stage copy and the safe-to-bathe gate.
// =============================================================================

import {
  calculateRecommendations,
  type SanitizerType,
  type SpaConfig,
  type TestReadingInput,
} from "./chemistry";

// --- Fresh-fill dose constants (per litre unless noted) ----------------------
export const CHLORINE_COMMISSION_G_PER_L = 0.02; // booster to ~10 ppm
export const BROMINE_BANK_GRANULES_G_PER_L = 0.06; // shock to ~20 ppm, builds bank
export const SODIUM_BROMIDE_ML_PER_L = 0.25; // liquid bromide-bank starter
export const BROMIDE_ACTIVATION_MPS_G_PER_L = 0.03; // MPS to activate the starter
export const WEEKLY_MPS_G_PER_L = 0.017; // routine weekly shock (ongoing)
export const BROMINE_TABLETS_PER_1000L_MIN = 1;
export const BROMINE_TABLETS_PER_1000L_MAX = 3;
export const SAFE_SANITIZER_MAX_PPM = 5; // don't bathe until at/below this

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function commissioningChlorineGrams(volumeLitres: number): number {
  return round1(CHLORINE_COMMISSION_G_PER_L * volumeLitres);
}
export function bromideBankGranulesGrams(volumeLitres: number): number {
  return round1(BROMINE_BANK_GRANULES_G_PER_L * volumeLitres);
}
export function sodiumBromideStarterMl(volumeLitres: number): number {
  return round1(SODIUM_BROMIDE_ML_PER_L * volumeLitres);
}
export function bromideActivationMpsGrams(volumeLitres: number): number {
  return round1(BROMIDE_ACTIVATION_MPS_G_PER_L * volumeLitres);
}
export function weeklyMpsGrams(volumeLitres: number): number {
  return round1(WEEKLY_MPS_G_PER_L * volumeLitres);
}
export function bromineTablets(volumeLitres: number): { min: number; max: number } {
  const per1000 = volumeLitres / 1000;
  return {
    min: Math.max(1, Math.round(BROMINE_TABLETS_PER_1000L_MIN * per1000)),
    max: Math.max(1, Math.round(BROMINE_TABLETS_PER_1000L_MAX * per1000)),
  };
}

// --- Stage model -------------------------------------------------------------
export type StartupStageKey =
  | "welcome"
  | "sanitizer"
  | "volume"
  | "fill"
  | "heat"
  | "test"
  | "alkalinity"
  | "ph"
  | "sanitiser"
  | "wait"
  | "final";

// What the UI does on a stage: plain info, a choice, a numeric input, a water
// test, a dose-and-confirm, a safety gate, or the celebratory finish.
export type StartupStageKind =
  | "info"
  | "choice"
  | "input"
  | "test"
  | "dose"
  | "gate"
  | "done";

export interface StartupDose {
  label: string;
  amount: string;
}

export interface StartupStage {
  key: StartupStageKey;
  kind: StartupStageKind;
  title: string;
  emoji: string;
  body: string;
  tip?: string;
  safety?: string;
  // Pre-computed fixed doses (fresh-fill specific; TA/pH come from the live
  // reading via calculateRecommendations, not from here).
  doses?: StartupDose[];
}

const DISCLAIMER = "Always confirm the amount against your product's label.";

// -----------------------------------------------------------------------------
// buildStartupPlan — the full ordered sequence, with copy + fixed doses resolved
// for this tub volume and sanitizer.
// -----------------------------------------------------------------------------
export function buildStartupPlan(
  sanitizer: SanitizerType,
  volumeLitres: number,
): StartupStage[] {
  const isChlorine = sanitizer === "chlorine";
  const sanitizerWord = isChlorine ? "chlorine" : "bromine";
  const stripWord = isChlorine ? "chlorine test strips" : "bromine test strips";

  // The sanitiser stage differs the most between the two chemistries.
  const sanitiserStage: StartupStage = isChlorine
    ? {
        key: "sanitiser",
        kind: "dose",
        title: "Add your chlorine",
        emoji: "💧",
        body:
          "Fresh water has no sanitiser yet, so we give it a strong first dose (a 'commissioning' dose) to clean and protect it. This also acts as the first shock.",
        doses: [
          {
            label: "Stabilised chlorine granules — commissioning dose",
            amount: `${commissioningChlorineGrams(volumeLitres)} g`,
          },
        ],
        tip: "Pre-dissolve the granules in a jug of warm water, then pour in near the inlet with the pump running.",
        safety:
          "Cover off, nobody in the water. Add chemical to water, never water to chemical. " +
          DISCLAIMER,
      }
    : {
        key: "sanitiser",
        kind: "dose",
        title: "Build your bromine",
        emoji: "🟠",
        body:
          "Brand-new water has no 'bromide bank', so tablets alone would read near zero for days. We build the bank first, then let tablets keep it topped up. Pick ONE way to build it, then load the dispenser.",
        doses: [
          {
            label: "Option A — bromine granules (builds the bank in one go)",
            amount: `${bromideBankGranulesGrams(volumeLitres)} g`,
          },
          {
            label: "Option B — sodium bromide starter (liquid)",
            amount: `${sodiumBromideStarterMl(volumeLitres)} ml`,
          },
          {
            label: "…then activate Option B with non-chlorine shock (MPS)",
            amount: `${bromideActivationMpsGrams(volumeLitres)} g`,
          },
          {
            label: "Load the floating dispenser with bromine tablets",
            amount: `${bromineTablets(volumeLitres).min}–${bromineTablets(volumeLitres).max} tablets`,
          },
        ],
        tip: "In an inflatable tub, tablets ONLY go in a floating dispenser or ChemConnect — never loose on the liner, they can bleach it.",
        safety:
          "Cover off, nobody in the water. Never mix bromine with chlorine. Add chemical to water, never the reverse. " +
          DISCLAIMER,
      };

  const waitStage: StartupStage = {
    key: "wait",
    kind: "gate",
    title: "Wait until it's safe",
    emoji: "⏳",
    body: isChlorine
      ? "That first dose pushes chlorine high on purpose. Do NOT get in until it falls back to 5 ppm or below — usually around 24 hours. Keep the pump circulating."
      : "Give the bank time to settle. Do NOT get in until bromine falls to 5 ppm or below — bromine is slower than chlorine, so allow a bit longer. Keep the pump circulating.",
    safety:
      "This is a real safety step, not a formality — high sanitiser irritates skin and eyes. We've saved your progress, so you can close the app and come back.",
  };

  return [
    {
      key: "welcome",
      kind: "info",
      title: "Fresh water setup",
      emoji: "🚿",
      body:
        "Let's get your new water balanced and safe, one calm step at a time. Most of the time is just waiting for the water to settle — the hands-on part is quick.",
      tip: `Before you start, have these ready: ${stripWord}, ${
        isChlorine
          ? "chlorine granules, pH up/down"
          : "bromine tablets + granules (or sodium bromide) and non-chlorine shock, pH up/down"
      }, and gloves.`,
    },
    {
      key: "sanitizer",
      kind: "choice",
      title: "Chlorine or bromine?",
      emoji: "⚗️",
      body:
        "Which sanitiser are you using? This changes the whole routine, so it's the first thing to decide. We'll remember your choice across the app.",
      tip: "Chlorine: cheaper, add granules regularly. Bromine: gentler at hot temperatures, uses tablets plus a weekly shock.",
    },
    {
      key: "volume",
      kind: "input",
      title: "How much water?",
      emoji: "📏",
      body:
        "Confirm your tub's volume so every dose is worked out for YOUR tub. A Lay-Z-Spa San Francisco holds about 1050 L filled to the line.",
    },
    {
      key: "fill",
      kind: "info",
      title: "Fill the tub",
      emoji: "🪣",
      body:
        "Fill to the marked line with fresh cold water, ideally through the filter housing to avoid airlocks. Never run the pump dry.",
      tip: "A garden hose is fine. Hard tap water is normal — you'll balance it next.",
    },
    {
      key: "heat",
      kind: "info",
      title: "Switch on & heat",
      emoji: "🌡️",
      body:
        "Turn the tub on and set your target temperature (many people use 37–38°C). Balancing works best with the water circulating.",
    },
    {
      key: "test",
      kind: "test",
      title: "Test the water",
      emoji: "🧪",
      body: `Dip a strip (or snap a photo) and enter the numbers. Fresh tap water is often low in everything — that's expected. Use ${stripWord}.`,
      tip: "This gives the exact amounts for the next steps.",
    },
    {
      key: "alkalinity",
      kind: "dose",
      title: "Balance alkalinity first",
      emoji: "🧊",
      body:
        "Alkalinity is the buffer that keeps pH steady, so it always comes first. Aim for 80–120 ppm. Add the amount shown, run the pump to mix, wait, then retest.",
      safety: DISCLAIMER,
    },
    {
      key: "ph",
      kind: "dose",
      title: "Then adjust pH",
      emoji: "⚖️",
      body:
        "With alkalinity in range, nudge pH into 7.2–7.6. pH doesn't move in a straight line, so add small amounts, circulate, and retest.",
      safety: DISCLAIMER,
    },
    sanitiserStage,
    waitStage,
    {
      key: "final",
      kind: "done",
      title: "Final check",
      emoji: "✅",
      body: `Do one last test. When ${sanitizerWord} is 3–5 ppm and pH is 7.2–7.6 with no red warning, you're good to go. Finishing resets your water-freshness and drain schedule for the new water.`,
      tip: isChlorine
        ? "From now on: keep chlorine at 3–5 ppm and shock weekly."
        : `From now on: keep tablets topped up, and shock weekly with about ${weeklyMpsGrams(volumeLitres)} g of non-chlorine shock to reactivate the bromide bank.`,
    },
  ];
}

// -----------------------------------------------------------------------------
// isSafeToBathe — the hard gate. Safe only when there's no danger flag AND the
// active sanitizer is present and within its target band (not too high, not
// absent). Reuses the app calculator so the rule matches the rest of the app.
// -----------------------------------------------------------------------------
export function isSafeToBathe(
  sanitizer: SanitizerType,
  reading: TestReadingInput,
  config: SpaConfig,
): boolean {
  const calc = calculateRecommendations(reading, config);
  if (calc.safetyFlags.some((f) => f.severity === "danger")) return false;

  const level =
    sanitizer === "chlorine" ? reading.freeChlorinePpm : reading.brominePpm;
  if (level === null || level === undefined) return false;

  const { fcMin, fcMax, brMin, brMax } = config.targetRanges;
  const min = sanitizer === "chlorine" ? fcMin : brMin;
  const max = sanitizer === "chlorine" ? fcMax : brMax;
  return level >= min && level <= max;
}
