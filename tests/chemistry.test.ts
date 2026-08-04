import { describe, it, expect } from "vitest";
import {
  calculateRecommendations,
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
  type TestReadingInput,
} from "../lib/chemistry";

// Base config uses volume 1000 L so the "per 1000 L" constants come out as
// clean whole numbers in assertions. Volume scaling is tested separately.
function chlorineConfig(overrides: Partial<SpaConfig> = {}): SpaConfig {
  return {
    volumeLitres: 1000,
    sanitizerType: "chlorine",
    targetRanges: DEFAULT_TARGET_RANGES,
    dosingConstants: DEFAULT_DOSING_CONSTANTS,
    ...overrides,
  };
}

function bromineConfig(overrides: Partial<SpaConfig> = {}): SpaConfig {
  return { ...chlorineConfig(), sanitizerType: "bromine", ...overrides };
}

// A perfectly balanced chlorine reading — the "nothing to do" baseline.
const balanced: TestReadingInput = {
  ph: 7.5,
  freeChlorinePpm: 4,
  totalAlkalinityPpm: 100,
};

function rec(result: ReturnType<typeof calculateRecommendations>, chemical: string) {
  return result.recommendations.find((r) => r.chemical === chemical);
}

describe("balanced water", () => {
  it("produces no actionable recommendations", () => {
    const result = calculateRecommendations(balanced, chlorineConfig());
    const actionable = result.recommendations.filter((r) => r.severity !== "info");
    expect(actionable).toHaveLength(0);
    expect(result.safetyFlags).toHaveLength(0);
    expect(result.summary).toMatch(/balanced/i);
  });
});

describe("total alkalinity", () => {
  it("recommends increaser when below range, with exact grams", () => {
    // ta 60 -> mid 100, deficit 40; (40/10) * 24 g = 96 g at 1000 L
    const result = calculateRecommendations(
      { ...balanced, totalAlkalinityPpm: 60 },
      chlorineConfig(),
    );
    const r = rec(result, "ta_increaser");
    expect(r).toBeDefined();
    expect(r!.amountGrams).toBe(96);
    expect(r!.order).toBe(1);
  });

  it("scales the dose with spa volume", () => {
    // Same deficit but 1050 L -> 96 * 1.05 = 100.8 g
    const result = calculateRecommendations(
      { ...balanced, totalAlkalinityPpm: 60 },
      chlorineConfig({ volumeLitres: 1050 }),
    );
    expect(rec(result, "ta_increaser")!.amountGrams).toBe(100.8);
  });

  it("advises lowering (no exact dose) when above range", () => {
    const result = calculateRecommendations(
      { ...balanced, totalAlkalinityPpm: 200 },
      chlorineConfig(),
    );
    const r = rec(result, "ta_decreaser");
    expect(r).toBeDefined();
    expect(r!.amountGrams).toBeNull();
  });

  it("does nothing at the exact boundaries", () => {
    for (const ta of [DEFAULT_TARGET_RANGES.taMin, DEFAULT_TARGET_RANGES.taMax]) {
      const result = calculateRecommendations(
        { ...balanced, totalAlkalinityPpm: ta },
        chlorineConfig(),
      );
      expect(rec(result, "ta_increaser")).toBeUndefined();
      expect(rec(result, "ta_decreaser")).toBeUndefined();
    }
  });
});

describe("pH stepped buckets (non-linear)", () => {
  it("no action inside the ideal band (7.4 / 7.5 / 7.6)", () => {
    for (const ph of [7.4, 7.5, 7.6]) {
      const result = calculateRecommendations({ ...balanced, ph }, chlorineConfig());
      expect(rec(result, "ph_increaser")).toBeUndefined();
      expect(rec(result, "ph_decreaser")).toBeUndefined();
    }
  });

  it("7.2 counts as acceptable (small nudge), not a mid/large dose", () => {
    const result = calculateRecommendations({ ...balanced, ph: 7.2 }, chlorineConfig());
    const r = rec(result, "ph_increaser")!;
    expect(r.amountGrams).toBe(11); // small dose
    expect(r.severity).toBe("low");
    expect(result.safetyFlags).toHaveLength(0);
  });

  it("mildly low (7.1) is a medium dose, no safety flag", () => {
    const result = calculateRecommendations({ ...balanced, ph: 7.1 }, chlorineConfig());
    const r = rec(result, "ph_increaser")!;
    expect(r.amountGrams).toBe(22);
    expect(r.severity).toBe("medium");
    expect(result.safetyFlags).toHaveLength(0);
  });

  it("badly low (6.8) is a large dose AND a safety flag", () => {
    const result = calculateRecommendations({ ...balanced, ph: 6.8 }, chlorineConfig());
    const r = rec(result, "ph_increaser")!;
    expect(r.amountGrams).toBe(33);
    expect(r.severity).toBe("high");
    expect(result.safetyFlags.some((f) => f.code === "ph_out_of_range")).toBe(true);
  });

  it("high side mirrors the low side (7.7 small, 8.3 large+flag)", () => {
    const small = calculateRecommendations({ ...balanced, ph: 7.7 }, chlorineConfig());
    expect(rec(small, "ph_decreaser")!.amountGrams).toBe(11);
    expect(small.safetyFlags).toHaveLength(0);

    const large = calculateRecommendations({ ...balanced, ph: 8.3 }, chlorineConfig());
    expect(rec(large, "ph_decreaser")!.amountGrams).toBe(33);
    expect(large.safetyFlags.some((f) => f.code === "ph_out_of_range")).toBe(true);
  });
});

describe("chlorine sanitizer", () => {
  it("doses dichlor when low, using the available-chlorine formula", () => {
    // fc 1 -> mid 4, increase 3; 3 * 1000 / (1000 * 0.56) = 5.357 -> 5.4
    const result = calculateRecommendations(
      { ...balanced, freeChlorinePpm: 1 },
      chlorineConfig(),
    );
    const r = rec(result, "dichlor")!;
    expect(r.amountGrams).toBe(5.4);
    expect(r.order).toBe(3);
  });

  it("flags danger and gives no dose when chlorine is too high", () => {
    const result = calculateRecommendations(
      { ...balanced, freeChlorinePpm: 12 },
      chlorineConfig(),
    );
    expect(result.safetyFlags.some((f) => f.code === "sanitizer_too_high")).toBe(true);
    expect(rec(result, "dichlor")).toBeUndefined();
    expect(result.summary).toMatch(/do not use/i);
  });

  it("triggers a shock recommendation when chlorine reads exactly 0", () => {
    const result = calculateRecommendations(
      { ...balanced, freeChlorinePpm: 0 },
      chlorineConfig(),
    );
    expect(rec(result, "mps_shock")).toBeDefined();
    expect(rec(result, "dichlor")).toBeDefined(); // also needs topping up
  });

  it("is informational (not an error) when no chlorine reading is given", () => {
    const result = calculateRecommendations(
      { ph: 7.5, totalAlkalinityPpm: 100 },
      chlorineConfig(),
    );
    const info = result.recommendations.find((r) => r.label === "No chlorine reading");
    expect(info).toBeDefined();
    expect(info!.severity).toBe("info");
  });
});

describe("bromine sanitizer", () => {
  it("mildly low bromine is an instruction (floater), not a weighed dose", () => {
    const result = calculateRecommendations(
      { ph: 7.5, totalAlkalinityPpm: 100, brominePpm: 2 },
      bromineConfig(),
    );
    const r = result.recommendations.find((x) => x.label === "Top up bromine floater")!;
    expect(r).toBeDefined();
    expect(r.amountGrams).toBeNull();
  });

  it("critically low bromine gets a granule boost dose", () => {
    // brMin 3 -> critical below 1.5; 5 g per 1000 L at 1000 L = 5 g
    const result = calculateRecommendations(
      { ph: 7.5, totalAlkalinityPpm: 100, brominePpm: 1 },
      bromineConfig(),
    );
    const r = rec(
      calculateRecommendations(
        { ph: 7.5, totalAlkalinityPpm: 100, brominePpm: 1 },
        bromineConfig(),
      ),
      "bromine_granules",
    );
    expect(r).toBeDefined();
    expect(r!.amountGrams).toBe(5);
    expect(result.recommendations.some((x) => x.severity === "high")).toBe(true);
  });

  it("fresh fill recommends sodium bromide bank-building", () => {
    const result = calculateRecommendations(
      { ph: 7.5, totalAlkalinityPpm: 100, brominePpm: 0, isFreshFill: true },
      bromineConfig(),
    );
    expect(rec(result, "sodium_bromide")).toBeDefined();
    expect(rec(result, "sodium_bromide")!.amountGrams).toBe(6);
  });

  it("flags danger when bromine is too high", () => {
    const result = calculateRecommendations(
      { ph: 7.5, totalAlkalinityPpm: 100, brominePpm: 9 },
      bromineConfig(),
    );
    expect(result.safetyFlags.some((f) => f.code === "sanitizer_too_high")).toBe(true);
  });
});

describe("calcium hardness (optional)", () => {
  it("produces no flag when the field is omitted", () => {
    const result = calculateRecommendations(balanced, chlorineConfig());
    expect(
      result.recommendations.some((r) => r.label.includes("Calcium")),
    ).toBe(false);
  });

  it("flags when supplied and out of range, without inventing a dose", () => {
    const high = calculateRecommendations(
      { ...balanced, calciumHardnessPpm: 400 },
      chlorineConfig(),
    );
    const r = high.recommendations.find((x) => x.label.includes("Calcium"))!;
    expect(r).toBeDefined();
    // Not decorative: calcium is one of the four inputs to the saturation index
    // that protects the heater. But there's no product that removes it, so the
    // flag never carries a gram figure.
    expect(r.severity).toBe("low");
    expect(r.amountGrams).toBeNull();
  });

  it("names dilution, not a chemical, for high calcium", () => {
    const high = calculateRecommendations(
      { ...balanced, calciumHardnessPpm: 400 },
      chlorineConfig(),
    );
    const r = high.recommendations.find((x) => x.label.includes("Calcium"))!;
    expect(r.instructions).toMatch(/dilut/i);
    expect(r.chemical).toBeNull();
  });

  it("no flag when supplied and in range", () => {
    const ok = calculateRecommendations(
      { ...balanced, calciumHardnessPpm: 150 },
      chlorineConfig(),
    );
    expect(ok.recommendations.some((r) => r.label.includes("Calcium"))).toBe(false);
  });
});

describe("ordering and config injection", () => {
  it("returns actions in alkalinity -> pH -> sanitizer -> shock order", () => {
    // Everything wrong at once.
    const result = calculateRecommendations(
      { ph: 6.8, totalAlkalinityPpm: 60, freeChlorinePpm: 0 },
      chlorineConfig(),
    );
    const orders = result.recommendations.map((r) => r.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
    // Expect all four categories present.
    expect(rec(result, "ta_increaser")).toBeDefined();
    expect(rec(result, "ph_increaser")).toBeDefined();
    expect(rec(result, "dichlor")).toBeDefined();
    expect(rec(result, "mps_shock")).toBeDefined();
  });

  it("actually uses the passed-in config, not module defaults", () => {
    // Widen the chlorine target so fc 1 is 'fine', and shift pH ideal so 7.5 is low.
    const custom = chlorineConfig({
      targetRanges: {
        ...DEFAULT_TARGET_RANGES,
        fcMin: 0.5,
        fcMax: 6,
        phIdealMin: 7.8,
        phIdealMax: 8.0,
        phAcceptableMin: 7.6,
        phAcceptableMax: 8.2,
      },
    });
    const result = calculateRecommendations(
      { ph: 7.5, totalAlkalinityPpm: 100, freeChlorinePpm: 1 },
      custom,
    );
    // fc 1 is now in range -> no dichlor
    expect(rec(result, "dichlor")).toBeUndefined();
    // ph 7.5 is now below the (shifted) ideal -> increaser recommended
    expect(rec(result, "ph_increaser")).toBeDefined();
  });
});

// =============================================================================
//  ORP mode (probe users, e.g. iopool). ORP measures whether the sanitiser is
//  WORKING, not how much is present, so these tests also pin down that we never
//  invent a ppm from a millivolt reading.
// =============================================================================
describe("ORP sanitiser mode", () => {
  const orpConfig: SpaConfig = {
    volumeLitres: 1180,
    sanitizerType: "chlorine",
    sanitizerUnit: "orp",
    targetRanges: DEFAULT_TARGET_RANGES,
    dosingConstants: DEFAULT_DOSING_CONSTANTS,
  };
  const base = { ph: 7.5, totalAlkalinityPpm: 100 };

  it("is happy inside the 650-750 mV band and asks for nothing", () => {
    const calc = calculateRecommendations({ ...base, orpMv: 700 }, orpConfig);
    expect(calc.safetyFlags).toHaveLength(0);
    const sanitiser = calc.recommendations.find((r) => r.order === 3);
    expect(sanitiser).toBeUndefined();
  });

  it("flags dangerously high ORP as do-not-use", () => {
    const calc = calculateRecommendations({ ...base, orpMv: 900 }, orpConfig);
    expect(calc.safetyFlags.some((f) => f.code === "sanitizer_too_high")).toBe(
      true,
    );
    expect(calc.summary).toContain("Do not use");
  });

  it("treats a collapsed ORP as unsanitised water", () => {
    const calc = calculateRecommendations({ ...base, orpMv: 400 }, orpConfig);
    expect(
      calc.safetyFlags.some((f) => f.code === "sanitizer_ineffective"),
    ).toBe(true);
    // ...and recommends shocking, the ORP equivalent of "sanitizer reads zero".
    expect(calc.recommendations.some((r) => r.chemical === "mps_shock")).toBe(
      true,
    );
  });

  it("blames high pH first when ORP is low but pH is out of range", () => {
    const calc = calculateRecommendations(
      { ph: 8.0, totalAlkalinityPpm: 100, orpMv: 600 },
      orpConfig,
    );
    const sanitiser = calc.recommendations.find((r) => r.order === 3)!;
    expect(sanitiser.instructions).toMatch(/pH/);
    expect(sanitiser.instructions).toMatch(/FIRST/);
  });

  it("NEVER invents a chlorine dose from millivolts alone", () => {
    const calc = calculateRecommendations({ ...base, orpMv: 600 }, orpConfig);
    const sanitiser = calc.recommendations.find((r) => r.order === 3)!;
    // No weighed dose is possible from ORP for stabilised chlorine.
    expect(sanitiser.amountGrams).toBeNull();
    expect(sanitiser.instructions).toMatch(/retest/i);
  });

  it("prefers the exact ppm path when the user supplies both", () => {
    const calc = calculateRecommendations(
      { ...base, orpMv: 600, freeChlorinePpm: 1 },
      orpConfig,
    );
    const sanitiser = calc.recommendations.find((r) => r.order === 3)!;
    // A real concentration means we can weigh a dose again.
    expect(sanitiser.chemical).toBe("dichlor");
    expect(sanitiser.amountGrams).toBeGreaterThan(0);
  });

  it("asks for a reading when the probe value is missing", () => {
    const calc = calculateRecommendations({ ...base }, orpConfig);
    const sanitiser = calc.recommendations.find((r) => r.order === 3)!;
    expect(sanitiser.severity).toBe("info");
  });

  it("leaves ppm-mode behaviour untouched", () => {
    const ppmConfig: SpaConfig = { ...orpConfig, sanitizerUnit: "ppm" };
    const calc = calculateRecommendations(
      { ...base, freeChlorinePpm: 1 },
      ppmConfig,
    );
    const sanitiser = calc.recommendations.find((r) => r.order === 3)!;
    expect(sanitiser.amountGrams).toBeGreaterThan(0);
  });
});
