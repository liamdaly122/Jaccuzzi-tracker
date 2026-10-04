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
  gramsToTeaspoons,
  stagePhase,
  STARTUP_PHASES,
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

describe("gramsToTeaspoons", () => {
  it("converts at 5 g per teaspoon", () => {
    expect(gramsToTeaspoons(5)).toBe(1);
    expect(gramsToTeaspoons(20)).toBe(4);
  });

  it("rounds to the nearest half teaspoon (per the leaflet's guidance)", () => {
    expect(gramsToTeaspoons(21)).toBe(4); // 4.2 -> 4
    expect(gramsToTeaspoons(22.5)).toBe(4.5); // exact half
    expect(gramsToTeaspoons(23)).toBe(4.5); // 4.6 -> 4.5
  });

  it("guards zero / nonsense input", () => {
    expect(gramsToTeaspoons(0)).toBe(0);
    expect(gramsToTeaspoons(-5)).toBe(0);
    expect(gramsToTeaspoons(Number.NaN)).toBe(0);
  });
});

describe("stagePhase", () => {
  it("groups the stages into the four named phases in order", () => {
    expect(stagePhase("welcome")).toEqual({ index: 0, label: "Prepare" });
    expect(stagePhase("test")).toEqual({ index: 1, label: "Balance" });
    expect(stagePhase("sanitiser")).toEqual({ index: 2, label: "Sanitise" });
    expect(stagePhase("final")).toEqual({ index: 3, label: "Safe" });
  });

  it("never regresses as the plan advances", () => {
    const plan = buildStartupPlan("chlorine", 1050);
    const indexes = plan.map((s) => stagePhase(s.key).index);
    const sorted = [...indexes].sort((a, b) => a - b);
    expect(indexes).toEqual(sorted);
  });

  it("covers every stage of both plans", () => {
    for (const sanitizer of ["chlorine", "bromine"] as const) {
      for (const stage of buildStartupPlan(sanitizer, 1050)) {
        const phase = stagePhase(stage.key);
        expect(STARTUP_PHASES[phase.index]).toBe(phase.label);
      }
    }
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

  describe("on a probe alone (ORP mode)", () => {
    const orpConfig: SpaConfig = { ...chlorineConfig, sanitizerUnit: "orp" };
    const probeOnly = { ph: 7.5, totalAlkalinityPpm: 100, freeChlorinePpm: null };

    it("can pass with ORP in range — it used to be impossible", () => {
      expect(isSafeToBathe("chlorine", { ...probeOnly, orpMv: 700 }, orpConfig)).toBe(true);
    });

    it("fails with ORP too low or still too high", () => {
      expect(isSafeToBathe("chlorine", { ...probeOnly, orpMv: 600 }, orpConfig)).toBe(false);
      expect(isSafeToBathe("chlorine", { ...probeOnly, orpMv: 800 }, orpConfig)).toBe(false);
      expect(isSafeToBathe("chlorine", { ...probeOnly, orpMv: null }, orpConfig)).toBe(false);
    });

    it("lets a strip's ppm figure win when there is one", () => {
      expect(
        isSafeToBathe("chlorine", { ...probeOnly, freeChlorinePpm: 1, orpMv: 700 }, orpConfig),
      ).toBe(false);
    });

    it("still needs ppm when the tub is set to strips", () => {
      expect(isSafeToBathe("chlorine", { ...probeOnly, orpMv: 700 }, chlorineConfig)).toBe(false);
    });
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
