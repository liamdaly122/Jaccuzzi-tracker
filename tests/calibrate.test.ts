import { describe, it, expect } from "vitest";
import {
  deriveObservations,
  computeCalibration,
  type CalibrateReading,
  type CalibrateDose,
  type CalibrateConfig,
} from "../lib/calibrate";
import { DEFAULT_DOSING_CONSTANTS } from "../lib/chemistry";

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date("2026-08-01T09:00:00.000Z").getTime();
const at = (dayOffset: number) => new Date(BASE + dayOffset * DAY).toISOString();

const config: CalibrateConfig = {
  volumeLitres: 1000,
  dosingConstants: DEFAULT_DOSING_CONSTANTS,
};

// A clean chlorine cycle: read low, dose dichlor, read higher — repeated.
function chlorineData(cycles: number, gramsPerCycle = 10, rise_ppm = 2) {
  const readings: CalibrateReading[] = [];
  const dosing: CalibrateDose[] = [];
  for (let i = 0; i < cycles; i++) {
    const base = i * 3;
    readings.push({ recorded_at: at(base), free_chlorine_ppm: 1, total_alkalinity_ppm: 100 });
    dosing.push({ logged_at: at(base + 0.1), chemical: "dichlor", amount_grams: gramsPerCycle });
    readings.push({ recorded_at: at(base + 1), free_chlorine_ppm: 1 + rise_ppm, total_alkalinity_ppm: 100 });
  }
  return { readings, dosing };
}

describe("deriveObservations", () => {
  it("pairs each clean dose with its before/after reading", () => {
    const { readings, dosing } = chlorineData(3);
    const obs = deriveObservations(readings, dosing, config);
    expect(obs).toHaveLength(3);
    // 10 g raised 2 ppm in 1000 L → 5 g per ppm per 1000 L
    expect(obs[0].gramsPerPpmPer1000L).toBeCloseTo(5, 5);
    expect(obs[0].chemical).toBe("dichlor");
  });

  it("ignores non-calibratable chemicals (pH, bromine)", () => {
    const readings: CalibrateReading[] = [
      { recorded_at: at(0), free_chlorine_ppm: 1, total_alkalinity_ppm: 100 },
      { recorded_at: at(1), free_chlorine_ppm: 3, total_alkalinity_ppm: 100 },
    ];
    const dosing: CalibrateDose[] = [
      { logged_at: at(0.1), chemical: "ph_increaser", amount_grams: 10 },
      { logged_at: at(0.1), chemical: "bromine_granules", amount_grams: 5 },
    ];
    expect(deriveObservations(readings, dosing, config)).toHaveLength(0);
  });

  it("skips a dose contaminated by another same-chemical dose between readings", () => {
    const readings: CalibrateReading[] = [
      { recorded_at: at(0), free_chlorine_ppm: 1, total_alkalinity_ppm: 100 },
      { recorded_at: at(1), free_chlorine_ppm: 5, total_alkalinity_ppm: 100 },
    ];
    const dosing: CalibrateDose[] = [
      { logged_at: at(0.1), chemical: "dichlor", amount_grams: 10 },
      { logged_at: at(0.5), chemical: "dichlor", amount_grams: 10 }, // contaminant
    ];
    expect(deriveObservations(readings, dosing, config)).toHaveLength(0);
  });

  it("ignores tiny/no changes (below the min delta)", () => {
    const readings: CalibrateReading[] = [
      { recorded_at: at(0), free_chlorine_ppm: 3, total_alkalinity_ppm: 100 },
      { recorded_at: at(1), free_chlorine_ppm: 3.1, total_alkalinity_ppm: 100 },
    ];
    const dosing: CalibrateDose[] = [
      { logged_at: at(0.1), chemical: "dichlor", amount_grams: 10 },
    ];
    expect(deriveObservations(readings, dosing, config)).toHaveLength(0);
  });

  it("ignores an after-reading outside the window", () => {
    const readings: CalibrateReading[] = [
      { recorded_at: at(0), free_chlorine_ppm: 1, total_alkalinity_ppm: 100 },
      { recorded_at: at(10), free_chlorine_ppm: 3, total_alkalinity_ppm: 100 },
    ];
    const dosing: CalibrateDose[] = [
      { logged_at: at(0.1), chemical: "dichlor", amount_grams: 10 },
    ];
    expect(deriveObservations(readings, dosing, config)).toHaveLength(0);
  });
});

describe("computeCalibration", () => {
  it("suggests a tuned chlorine fraction from enough clean observations", () => {
    const { readings, dosing } = chlorineData(3);
    const obs = deriveObservations(readings, dosing, config);
    const suggestions = computeCalibration(obs, config);
    const chlorine = suggestions.find((s) => s.chemical === "dichlor");
    expect(chlorine).toBeDefined();
    expect(chlorine!.constantKey).toBe("dichlorAvailableChlorineFraction");
    expect(chlorine!.observationCount).toBe(3);
    // rate 5 → fraction 1/5 = 0.2
    expect(chlorine!.suggestedValue).toBeCloseTo(0.2, 5);
  });

  it("makes no suggestion with fewer than 3 observations", () => {
    const { readings, dosing } = chlorineData(2);
    const obs = deriveObservations(readings, dosing, config);
    expect(computeCalibration(obs, config)).toHaveLength(0);
  });

  it("makes no suggestion when the tub matches the default within tolerance", () => {
    // Pick a rise that yields ~the default fraction (0.56 → rate ~1.79).
    // 10 g raising ~5.6 ppm ⇒ rate ≈ 1.79 ⇒ fraction ≈ 0.56 (≈ default).
    const { readings, dosing } = chlorineData(3, 10, 5.6);
    const obs = deriveObservations(readings, dosing, config);
    const suggestions = computeCalibration(obs, config);
    expect(suggestions.find((s) => s.chemical === "dichlor")).toBeUndefined();
  });
});
