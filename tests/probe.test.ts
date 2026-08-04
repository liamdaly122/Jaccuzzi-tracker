import { describe, it, expect } from "vitest";
import {
  validRows,
  toForecastReadings,
  downsampleDaily,
  orpDrift,
  type ProbeRow,
} from "../lib/probe";
import {
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
} from "../lib/chemistry";

const config: SpaConfig = {
  volumeLitres: 1180,
  sanitizerType: "chlorine",
  sanitizerUnit: "orp",
  targetRanges: DEFAULT_TARGET_RANGES,
  dosingConstants: DEFAULT_DOSING_CONSTANTS,
};

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date("2026-08-01T09:00:00.000Z").getTime();
const at = (dayOffset: number, hour = 0) =>
  new Date(BASE + dayOffset * DAY + hour * 3600_000).toISOString();

const row = (
  dayOffset: number,
  orp: number | null,
  ph: number | null = 7.5,
  hour = 0,
  isValid = true,
): ProbeRow => ({
  measured_at: at(dayOffset, hour),
  ph,
  orp_mv: orp,
  temperature_c: 37.5,
  is_valid: isValid,
});

describe("validRows", () => {
  it("drops readings the probe flagged as still settling", () => {
    const rows = [row(0, 700), row(1, 690, 7.5, 0, false)];
    expect(validRows(rows)).toHaveLength(1);
  });
});

describe("toForecastReadings", () => {
  it("adapts probe rows into the forecaster's shape", () => {
    const out = toForecastReadings([row(0, 700, 7.4)]);
    expect(out[0].recorded_at).toBe(at(0));
    expect(out[0].ph).toBe(7.4);
    // The probe genuinely can't measure these — they stay null, never invented.
    expect(out[0].total_alkalinity_ppm).toBeNull();
    expect(out[0].free_chlorine_ppm).toBeNull();
  });
});

describe("downsampleDaily", () => {
  it("collapses many readings a day into one median point", () => {
    const rows = [
      row(0, 700, 7.5, 1),
      row(0, 710, 7.5, 6),
      row(0, 720, 7.5, 12),
      row(1, 680, 7.4, 3),
    ];
    const daily = downsampleDaily(rows);
    expect(daily).toHaveLength(2);
    expect(daily[0].orpMv).toBe(710); // median of 700/710/720
    expect(daily[0].count).toBe(3);
  });

  it("uses the median so one wild reading can't skew a day", () => {
    const rows = [row(0, 700, 7.5, 1), row(0, 705, 7.5, 2), row(0, 20, 7.5, 3)];
    expect(downsampleDaily(rows)[0].orpMv).toBe(700);
  });

  it("returns points oldest to newest", () => {
    const daily = downsampleDaily([row(3, 700), row(0, 710), row(1, 705)]);
    const dates = daily.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("copes with missing metrics and junk timestamps", () => {
    const rows: ProbeRow[] = [
      { measured_at: "not-a-date", ph: 7.5, orp_mv: 700, temperature_c: 37 },
      row(0, null, null),
    ];
    const daily = downsampleDaily(rows);
    expect(daily).toHaveLength(1);
    expect(daily[0].orpMv).toBeNull();
    expect(daily[0].ph).toBeNull();
  });
});

describe("orpDrift", () => {
  // ORP sliding ~10 mV/day over 10 days with pH steady and healthy.
  const decliningRows = Array.from({ length: 10 }, (_, i) =>
    row(i, 750 - i * 10, 7.5),
  );

  it("spots stabiliser buildup: ORP sagging while pH behaves", () => {
    const d = orpDrift(decliningRows, config);
    expect(d.declining).toBe(true);
    expect(d.likelyStabiliserBuildup).toBe(true);
    expect(d.slopePerDay).toBeLessThan(0);
    expect(d.message).toMatch(/fresh water/i);
  });

  it("blames pH instead when pH is also out of range", () => {
    const rows = decliningRows.map((r, i) => ({ ...r, ph: 8.2 - i * 0.01 }));
    const d = orpDrift(rows, config);
    expect(d.declining).toBe(true);
    // Not buildup — the pH explains it, so don't tell them to change the water.
    expect(d.likelyStabiliserBuildup).toBe(false);
    expect(d.message).toMatch(/pH/);
  });

  it("stays quiet when ORP is holding steady", () => {
    const steady = Array.from({ length: 10 }, (_, i) => row(i, 710, 7.5));
    const d = orpDrift(steady, config);
    expect(d.declining).toBe(false);
    expect(d.likelyStabiliserBuildup).toBe(false);
    expect(d.message).toBeNull();
  });

  it("says nothing without enough days of history", () => {
    const d = orpDrift([row(0, 750), row(1, 700), row(2, 650)], config);
    expect(d.slopePerDay).toBeNull();
    expect(d.likelyStabiliserBuildup).toBe(false);
  });

  it("ignores a short burst of readings all on the same day", () => {
    const sameDay = Array.from({ length: 8 }, (_, i) => row(0, 750 - i, 7.5, i));
    expect(orpDrift(sameDay, config).slopePerDay).toBeNull();
  });
});
