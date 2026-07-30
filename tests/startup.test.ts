import { describe, it, expect } from "vitest";
import {
  commissioningChlorineGrams,
  bromideBankGranulesGrams,
  sodiumBromideStarterMl,
  bromideActivationMpsGrams,
  weeklyMpsGrams,
  bromineTablets,
  buildStartupPlan,
  isSafeToBathe,
  type StartupStageKey,
} from "../lib/startup";
import {
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
} from "../lib/chemistry";

const chlorineConfig: SpaConfig = {
  volumeLitres: 1050,
  sanitizerType: "chlorine",
  targetRanges: DEFAULT_TARGET_RANGES,
  dosingConstants: DEFAULT_DOSING_CONSTANTS,
};
const bromineConfig: SpaConfig = { ...chlorineConfig, sanitizerType: "bromine" };

describe("fresh-fill dose helpers", () => {
  it("chlorine commissioning dose is 0.02 g/L (→ ~10 ppm)", () => {
    expect(commissioningChlorineGrams(1000)).toBe(20);
    expect(commissioningChlorineGrams(1050)).toBe(21);
  });

  it("bromine bank granule shock is 0.06 g/L (~20 ppm)", () => {
    expect(bromideBankGranulesGrams(1000)).toBe(60);
  });

  it("sodium bromide starter is 0.25 ml/L and its MPS activation is 0.03 g/L", () => {
    expect(sodiumBromideStarterMl(1000)).toBe(250);
    expect(bromideActivationMpsGrams(1000)).toBe(30);
  });

  it("weekly MPS is 0.017 g/L", () => {
    expect(weeklyMpsGrams(1000)).toBe(17);
  });

  it("bromine tablets scale 1–3 per 1000 L, at least 1", () => {
    expect(bromineTablets(1000)).toEqual({ min: 1, max: 3 });
    expect(bromineTablets(2000)).toEqual({ min: 2, max: 6 });
    // Small tub still needs at least one tablet.
    expect(bromineTablets(400).min).toBeGreaterThanOrEqual(1);
  });
});

describe("buildStartupPlan", () => {
  const chlorinePlan = buildStartupPlan("chlorine", 1050);
  const brominePlan = buildStartupPlan("bromine", 1050);

  const expectedOrder: StartupStageKey[] = [
    "welcome",
    "sanitizer",
    "volume",
    "fill",
    "heat",
    "test",
    "alkalinity",
    "ph",
    "sanitiser",
    "wait",
    "final",
  ];

  it("returns the stages in the correct fixed order", () => {
    expect(chlorinePlan.map((s) => s.key)).toEqual(expectedOrder);
    expect(brominePlan.map((s) => s.key)).toEqual(expectedOrder);
  });

  it("every stage has a title and body, and keys are unique", () => {
    for (const stage of chlorinePlan) {
      expect(stage.title.length).toBeGreaterThan(0);
      expect(stage.body.length).toBeGreaterThan(0);
    }
    const keys = chlorinePlan.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("chlorine sanitiser stage shows the commissioning dose", () => {
    const stage = chlorinePlan.find((s) => s.key === "sanitiser")!;
    const amounts = (stage.doses ?? []).map((d) => d.amount);
    expect(amounts).toContain("21 g"); // 0.02 * 1050
  });

  it("bromine sanitiser stage shows the bank build + tablets, not a chlorine dose", () => {
    const stage = brominePlan.find((s) => s.key === "sanitiser")!;
    const labels = (stage.doses ?? []).map((d) => d.label).join(" ");
    expect(labels.toLowerCase()).toContain("bromide");
    expect(labels.toLowerCase()).toContain("tablet");
    // Bromine stage should not mention chlorine granules.
    expect(labels.toLowerCase()).not.toContain("chlorine granules");
  });

  it("the wait stage is a safety gate for both chemistries", () => {
    expect(chlorinePlan.find((s) => s.key === "wait")!.kind).toBe("gate");
    expect(brominePlan.find((s) => s.key === "wait")!.kind).toBe("gate");
  });
});

describe("isSafeToBathe", () => {
  const balanced = {
    ph: 7.5,
    totalAlkalinityPpm: 100,
    freeChlorinePpm: 4,
    brominePpm: 4,
  };

  it("is safe when sanitizer is in range, pH ok, no danger", () => {
    expect(isSafeToBathe("chlorine", balanced, chlorineConfig)).toBe(true);
    expect(isSafeToBathe("bromine", balanced, bromineConfig)).toBe(true);
  });

  it("is NOT safe while sanitizer is still too high (post-commissioning)", () => {
    expect(
      isSafeToBathe(
        "chlorine",
        { ...balanced, freeChlorinePpm: 10 },
        chlorineConfig,
      ),
    ).toBe(false);
  });

  it("is NOT safe when sanitizer is absent/too low", () => {
    expect(
      isSafeToBathe(
        "chlorine",
        { ...balanced, freeChlorinePpm: 0 },
        chlorineConfig,
      ),
    ).toBe(false);
    expect(
      isSafeToBathe("bromine", { ...balanced, brominePpm: null }, bromineConfig),
    ).toBe(false);
  });

  it("is NOT safe when pH is badly out of range (danger flag)", () => {
    expect(
      isSafeToBathe("chlorine", { ...balanced, ph: 8.6 }, chlorineConfig),
    ).toBe(false);
  });
});
