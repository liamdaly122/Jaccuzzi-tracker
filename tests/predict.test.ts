import { describe, it, expect } from "vitest";
import {
  linearTrend,
  daysUntilCrossing,
  buildForecasts,
  type ForecastReading,
} from "../lib/predict";
import {
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
} from "../lib/chemistry";

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date("2026-07-24T12:00:00.000Z").getTime();

// Helper: build a point n days after BASE.
function pt(dayOffset: number, value: number | null) {
  return { date: new Date(BASE + dayOffset * DAY).toISOString(), value };
}

function config(sanitizer: "chlorine" | "bromine" = "chlorine"): SpaConfig {
  return {
    volumeLitres: 1000,
    sanitizerType: sanitizer,
    targetRanges: DEFAULT_TARGET_RANGES,
    dosingConstants: DEFAULT_DOSING_CONSTANTS,
  };
}

describe("linearTrend", () => {
  it("fits a falling line and reports the latest value", () => {
    const trend = linearTrend([pt(0, 5), pt(1, 4), pt(2, 3)]);
    expect(trend).not.toBeNull();
    expect(trend!.slopePerDay).toBeCloseTo(-1, 6);
    expect(trend!.latestValue).toBe(3);
    expect(trend!.count).toBe(3);
  });

  it("returns null with fewer than 3 real points", () => {
    expect(linearTrend([pt(0, 5), pt(1, 4)])).toBeNull();
    expect(linearTrend([pt(0, 5), pt(1, null), pt(2, 4)])).toBeNull();
  });

  it("returns null when all points share the same time", () => {
    expect(linearTrend([pt(0, 5), pt(0, 4), pt(0, 3)])).toBeNull();
  });

  it("ignores point order", () => {
    const a = linearTrend([pt(2, 3), pt(0, 5), pt(1, 4)]);
    expect(a!.slopePerDay).toBeCloseTo(-1, 6);
    expect(a!.latestValue).toBe(3);
  });
});

describe("daysUntilCrossing", () => {
  it("predicts a downward crossing of the lower bound", () => {
    const c = daysUntilCrossing(4, -1, 3, 5);
    expect(c).not.toBeNull();
    expect(c!.direction).toBe("falling");
    expect(c!.threshold).toBe(3);
    expect(c!.days).toBeCloseTo(1, 6);
  });

  it("predicts an upward crossing of the upper bound", () => {
    const c = daysUntilCrossing(4, 1, 3, 5);
    expect(c!.direction).toBe("rising");
    expect(c!.threshold).toBe(5);
    expect(c!.days).toBeCloseTo(1, 6);
  });

  it("returns null for a flat trend", () => {
    expect(daysUntilCrossing(4, 0, 3, 5)).toBeNull();
  });

  it("returns null when already at/beyond the bound it's heading toward", () => {
    expect(daysUntilCrossing(3, -1, 3, 5)).toBeNull(); // at min, falling
    expect(daysUntilCrossing(5, 1, 3, 5)).toBeNull(); // at max, rising
  });
});

describe("buildForecasts", () => {
  // A steadily-declining chlorine reading, everything else stable.
  function reading(dayOffset: number, fc: number): ForecastReading {
    return {
      recorded_at: new Date(BASE + dayOffset * DAY).toISOString(),
      ph: 7.5,
      free_chlorine_ppm: fc,
      bromine_ppm: null,
      total_alkalinity_ppm: 100,
    };
  }

  it("warns that a declining sanitizer will drop below range", () => {
    const readings = [reading(0, 5), reading(1, 4.5), reading(2, 4)];
    const forecasts = buildForecasts(readings, config());
    const sani = forecasts.find((f) => f.key === "sanitizer");
    expect(sani).toBeDefined();
    expect(sani!.direction).toBe("falling");
    expect(sani!.daysUntil).toBe(2); // 4 -> 3 at 0.5/day
    // pH and alkalinity are flat, so no forecast for them.
    expect(forecasts.some((f) => f.key === "ph")).toBe(false);
    expect(forecasts.some((f) => f.key === "alkalinity")).toBe(false);
  });

  it("flags an imminent crossing as a warning severity", () => {
    const readings = [reading(0, 5.4), reading(1, 4.4), reading(2, 3.4)];
    const sani = buildForecasts(readings, config()).find((f) => f.key === "sanitizer");
    expect(sani!.severity).toBe("warning"); // crosses within ~0 days
  });

  it("produces nothing when values are stable", () => {
    const readings = [reading(0, 4), reading(1, 4), reading(2, 4)];
    expect(buildForecasts(readings, config())).toHaveLength(0);
  });

  it("produces nothing with too few readings", () => {
    expect(buildForecasts([reading(0, 5), reading(1, 4)], config())).toHaveLength(0);
  });

  it("ignores a slow drift that won't cross within the horizon", () => {
    // 0.05/day from 4.0 -> crossing min (3) is ~20 days away, beyond horizon.
    const readings = [reading(0, 4.1), reading(1, 4.05), reading(2, 4.0)];
    expect(buildForecasts(readings, config())).toHaveLength(0);
  });

  it("follows the configured sanitizer type (bromine)", () => {
    const readings: ForecastReading[] = [0, 1, 2].map((d) => ({
      recorded_at: new Date(BASE + d * DAY).toISOString(),
      ph: 7.5,
      free_chlorine_ppm: null,
      bromine_ppm: 5 - d * 0.5,
      total_alkalinity_ppm: 100,
    }));
    const sani = buildForecasts(readings, config("bromine")).find(
      (f) => f.key === "sanitizer",
    );
    expect(sani).toBeDefined();
    expect(sani!.metric).toBe("Bromine");
  });
});
