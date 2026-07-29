// =============================================================================
//  lib/troubleshoot.ts
//  A symptom-based problem solver. Given a symptom the user is seeing (cloudy
//  water, foam, green water, a smell, itchy skin…), list the likely causes with
//  a plain-English "why" and a "fix", and — when we have a recent test reading —
//  push the causes that reading actually points at to the top. PURE, no I/O.
// =============================================================================

import type { SpaConfig } from "./chemistry";

// A tolerant reading shape: every value may be missing. Mapped from a
// TestReadingRow by the page (or null when no reading exists yet).
export interface TroubleshootReading {
  ph: number | null;
  freeChlorinePpm: number | null;
  brominePpm: number | null;
  totalAlkalinityPpm: number | null;
  calciumHardnessPpm: number | null;
}

interface DiagnoseContext {
  reading: TroubleshootReading | null;
  config: SpaConfig;
  active: number | null; // the active sanitizer's ppm (chlorine or bromine)
}

// Internal cause definition (may carry a flag predicate).
interface CauseDef {
  cause: string;
  why: string;
  fix: string;
  guideKey?: string;
  // When true for the current reading, this cause is "flagged" (moved to top).
  flagWhen?: (ctx: DiagnoseContext) => boolean;
}

// Public cause shape returned by diagnose (serializable — no functions).
export interface Cause {
  cause: string;
  why: string;
  fix: string;
  guideKey?: string;
  flagged: boolean;
}

interface SymptomDef {
  key: string;
  title: string;
  emoji: string;
  blurb: string;
  causes: CauseDef[];
}

export interface Symptom {
  key: string;
  title: string;
  emoji: string;
  blurb: string;
}

export interface Diagnosis {
  symptom: Symptom;
  causes: Cause[];
  hasReading: boolean;
}

// --- small reading helpers (null-safe) --------------------------------------
const phHigh = (c: DiagnoseContext) =>
  c.reading?.ph != null && c.reading.ph > c.config.targetRanges.phAcceptableMax;
const phOutOfIdeal = (c: DiagnoseContext) =>
  c.reading?.ph != null &&
  (c.reading.ph < c.config.targetRanges.phIdealMin ||
    c.reading.ph > c.config.targetRanges.phIdealMax);
const taHigh = (c: DiagnoseContext) =>
  c.reading?.totalAlkalinityPpm != null &&
  c.reading.totalAlkalinityPpm > c.config.targetRanges.taMax;
const taLow = (c: DiagnoseContext) =>
  c.reading?.totalAlkalinityPpm != null &&
  c.reading.totalAlkalinityPpm < c.config.targetRanges.taMin;
const sanMin = (c: DiagnoseContext) =>
  c.config.sanitizerType === "chlorine"
    ? c.config.targetRanges.fcMin
    : c.config.targetRanges.brMin;
const sanMax = (c: DiagnoseContext) =>
  c.config.sanitizerType === "chlorine"
    ? c.config.targetRanges.fcMax
    : c.config.targetRanges.brMax;
const sanLow = (c: DiagnoseContext) => c.active != null && c.active < sanMin(c);
const sanHigh = (c: DiagnoseContext) => c.active != null && c.active > sanMax(c);
const chHigh = (c: DiagnoseContext) =>
  c.reading?.calciumHardnessPpm != null &&
  c.reading.calciumHardnessPpm > c.config.targetRanges.chMax;
const chLow = (c: DiagnoseContext) =>
  c.reading?.calciumHardnessPpm != null &&
  c.reading.calciumHardnessPpm < c.config.targetRanges.chMin;

// -----------------------------------------------------------------------------
// The symptom catalogue. Causes are written tub-generic; flagWhen ties them to
// the latest reading where one exists.
// -----------------------------------------------------------------------------
const SYMPTOMS: SymptomDef[] = [
  {
    key: "cloudy",
    title: "Cloudy or milky water",
    emoji: "🌫️",
    blurb: "The water has gone hazy, dull, or milky instead of clear.",
    causes: [
      {
        cause: "pH or alkalinity too high",
        why: "When pH or alkalinity climb, tiny particles clump and the water turns hazy — and your sanitizer works far less well.",
        fix: "Bring pH and alkalinity back into range first (the calculator will tell you how much decreaser to add), then let it circulate.",
        flagWhen: (c) => phHigh(c) || taHigh(c),
      },
      {
        cause: "Not enough sanitizer",
        why: "Low chlorine or bromine lets organic gunk build up faster than it's cleared, which shows up as cloudiness.",
        fix: "Test and top up your sanitizer to the target range, and shock the water to clear the backlog.",
        flagWhen: sanLow,
      },
      {
        cause: "High calcium hardness",
        why: "Very hard water can throw a fine cloud, especially when it's warm.",
        fix: "If your calcium reading is high, dilute with some fresh (softer) water. This matters less on an inflatable spa.",
        flagWhen: chHigh,
      },
      {
        cause: "Dirty or clogged filter",
        why: "A tired filter stops trapping the fine particles that make water cloudy.",
        fix: "Rinse the filter now; deep-clean it overnight in filter cleaner, and replace it if it's near the end of its life.",
        guideKey: "drain-and-refill-day",
      },
      {
        cause: "Heavy use / body oils",
        why: "Lotions, sun cream, sweat and drinks all feed the water and can overwhelm it after a busy session.",
        fix: "Shock the water, run the pump, and rinse the filter. Ask everyone to shower before getting in next time.",
      },
    ],
  },
  {
    key: "foamy",
    title: "Foamy water",
    emoji: "🫧",
    blurb: "Foam or bubbles that linger on the surface, especially with the jets on.",
    causes: [
      {
        cause: "Body lotions, oils & detergents",
        why: "Sun cream, moisturiser, deodorant and washing-detergent residue on swimwear all foam up when the jets churn the water.",
        fix: "Add a dose of anti-foam for instant relief, but the real fix is to shock the water and rinse the filter. Rinse swimwear in plain water, not detergent.",
      },
      {
        cause: "Low calcium hardness (soft water)",
        why: "Very soft water foams much more easily.",
        fix: "If your calcium reading is low, a calcium hardness increaser reduces foaming. Less critical on an inflatable spa.",
        flagWhen: chLow,
      },
      {
        cause: "Old, tired water",
        why: "As water ages it fills with dissolved solids that make it foam and stop responding to chemicals.",
        fix: "If it's near the end of its life, the cleanest fix is a full drain and refill.",
        guideKey: "drain-and-refill-day",
      },
    ],
  },
  {
    key: "green",
    title: "Green or algae water",
    emoji: "🟢",
    blurb: "A green tint, or slippery green patches on the walls or floor.",
    causes: [
      {
        cause: "Sanitizer too low or zero",
        why: "Green almost always means algae, and algae only takes hold when there isn't enough chlorine or bromine to kill it.",
        fix: "Shock the water hard, get sanitizer back into range, brush any green patches, then run the pump. Rinse the filter afterwards.",
        flagWhen: (c) => sanLow(c) || c.active === 0,
      },
      {
        cause: "High pH weakening the sanitizer",
        why: "At high pH chlorine and bromine lose a lot of their killing power, so algae can grow even with sanitizer present.",
        fix: "Lower pH into range so your shock actually works.",
        flagWhen: phHigh,
      },
      {
        cause: "Metals in the fill water",
        why: "Copper or iron from some tap/well water can tint the water green even without algae.",
        fix: "If it's stained rather than slimy, a metal remover / sequestrant helps; use a hose pre-filter next refill.",
      },
    ],
  },
  {
    key: "smelly",
    title: "Smelly water",
    emoji: "👃",
    blurb: "A strong chlorine smell, or a musty / eggy / stale odour.",
    causes: [
      {
        cause: "Chloramines (spent chlorine)",
        why: "A strong 'chloriney' smell usually means used-up chlorine (chloramines), not too much chlorine — it needs shocking, not less.",
        fix: "Shock the water with non-chlorine shock (MPS) and run the pump. The smell should clear as sanitizer recovers.",
        flagWhen: (c) => c.config.sanitizerType === "chlorine",
      },
      {
        cause: "Low sanitizer / bacteria",
        why: "A musty or rotten smell can mean sanitizer has dropped and bacteria are growing.",
        fix: "Test and restore sanitizer, then shock. If the smell persists, plan a drain and refill.",
        flagWhen: sanLow,
      },
      {
        cause: "Biofilm in the pipes",
        why: "A slimy layer can build up inside the plumbing and hold onto smells even when the water tests fine.",
        fix: "Use a spa-pipe / system flush cleaner before your next drain, then refill fresh.",
        guideKey: "drain-and-refill-day",
      },
    ],
  },
  {
    key: "itchy",
    title: "Itchy skin after soaking",
    emoji: "🧖",
    blurb: "Skin feels itchy, dry, or irritated after getting out.",
    causes: [
      {
        cause: "Sanitizer too high",
        why: "Too much chlorine or bromine is harsh on skin.",
        fix: "Let sanitizer fall back into range before using the spa — leave the cover off, or dilute with fresh water, then retest.",
        flagWhen: sanHigh,
      },
      {
        cause: "pH out of range",
        why: "Water that's too acidic or too alkaline strips or irritates skin.",
        fix: "Rebalance pH into 7.4–7.6 using the calculator's suggestion.",
        flagWhen: phOutOfIdeal,
      },
      {
        cause: "Undissolved chemicals",
        why: "Chemicals added without enough circulation can sit in the water and irritate skin.",
        fix: "Always run the pump after dosing, and wait the recommended time before getting in.",
      },
    ],
  },
  {
    key: "eyes",
    title: "Stinging eyes or irritation",
    emoji: "😖",
    blurb: "Eyes sting or the water feels harsh during a soak.",
    causes: [
      {
        cause: "pH out of range",
        why: "Eyes are happiest at pH 7.4–7.6. Away from that — especially too low — the water stings.",
        fix: "Rebalance pH into range; this is the most common cause of stinging eyes.",
        flagWhen: phOutOfIdeal,
      },
      {
        cause: "Chloramines (combined chlorine)",
        why: "Spent chlorine (chloramines) irritates eyes and gives off that 'pool' smell.",
        fix: "Shock the water to clear chloramines, then retest.",
        flagWhen: (c) => c.config.sanitizerType === "chlorine",
      },
      {
        cause: "Low alkalinity causing pH swings",
        why: "When alkalinity is low, pH bounces around, so the water can turn harsh between tests.",
        fix: "Raise alkalinity into range to steady your pH.",
        flagWhen: taLow,
      },
    ],
  },
  {
    key: "wont_hold_sanitizer",
    title: "Won't hold sanitizer",
    emoji: "🕳️",
    blurb: "Chlorine or bromine keeps disappearing soon after you add it.",
    causes: [
      {
        cause: "High demand / contamination",
        why: "A lot of organic load (oils, sweat, leaves, a busy weekend) eats sanitizer as fast as you add it.",
        fix: "Shock hard to break the demand, rinse the filter, and keep dosing until a level finally holds.",
        flagWhen: sanLow,
      },
      {
        cause: "Sunlight burning off chlorine",
        why: "Uncovered chlorine outdoors is destroyed quickly by UV, so it vanishes on sunny days.",
        fix: "Keep the cover on between soaks. A small amount of stabiliser (cyanuric acid) helps chlorine last — bromine is more UV-stable if this is a constant battle.",
        flagWhen: (c) => c.config.sanitizerType === "chlorine",
      },
      {
        cause: "pH too high",
        why: "High pH makes sanitizer less effective, so it gets used up doing less work.",
        fix: "Lower pH into range so your sanitizer lasts.",
        flagWhen: phHigh,
      },
      {
        cause: "Water at the end of its life",
        why: "Old water saturated with dissolved solids simply can't hold a sanitizer level any more.",
        fix: "If it's been many soaks since the last change, drain and refill for a clean slate.",
        guideKey: "drain-and-refill-day",
      },
    ],
  },
  {
    key: "scale",
    title: "Scale or white flakes",
    emoji: "🧊",
    blurb: "White crust on the waterline, or white flakes floating in the water.",
    causes: [
      {
        cause: "High calcium hardness",
        why: "Lots of dissolved calcium drops out as scale, especially at hot-tub temperatures.",
        fix: "If calcium is high, dilute with softer water and consider a scale inhibitor. Less critical on an inflatable spa.",
        flagWhen: chHigh,
      },
      {
        cause: "High pH or alkalinity",
        why: "High pH/alkalinity pushes calcium out of solution, so scale forms faster.",
        fix: "Bring pH and alkalinity back into range to stop new scale forming.",
        flagWhen: (c) => phHigh(c) || taHigh(c),
      },
      {
        cause: "Heat and evaporation",
        why: "Warm water and evaporation concentrate minerals, which encourages scale at the waterline.",
        fix: "Wipe the waterline, keep the cover on to cut evaporation, and top up with fresh water.",
      },
    ],
  },
];

const SYMPTOM_MAP = new Map(SYMPTOMS.map((s) => [s.key, s]));

// The list for the symptom-picker page.
export function listSymptoms(): Symptom[] {
  return SYMPTOMS.map(({ key, title, emoji, blurb }) => ({
    key,
    title,
    emoji,
    blurb,
  }));
}

// -----------------------------------------------------------------------------
// diagnose — the causes for one symptom, flagged and reordered by the reading.
// Works with reading = null (returns generic, unflagged guidance).
// -----------------------------------------------------------------------------
export function diagnose(
  symptomKey: string,
  reading: TroubleshootReading | null,
  config: SpaConfig,
): Diagnosis | null {
  const def = SYMPTOM_MAP.get(symptomKey);
  if (!def) return null;

  const active =
    config.sanitizerType === "chlorine"
      ? (reading?.freeChlorinePpm ?? null)
      : (reading?.brominePpm ?? null);
  const ctx: DiagnoseContext = { reading, config, active };

  const causes: Cause[] = def.causes.map((cd) => ({
    cause: cd.cause,
    why: cd.why,
    fix: cd.fix,
    guideKey: cd.guideKey,
    flagged: reading != null && cd.flagWhen ? cd.flagWhen(ctx) : false,
  }));

  // Stable sort: flagged causes rise to the top, original order kept otherwise.
  const ordered = causes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      if (a.c.flagged !== b.c.flagged) return a.c.flagged ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.c);

  return {
    symptom: { key: def.key, title: def.title, emoji: def.emoji, blurb: def.blurb },
    causes: ordered,
    hasReading: reading != null,
  };
}
