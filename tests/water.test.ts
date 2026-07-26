import { describe, it, expect } from "vitest";
import {
  computeWaterChangeIntervalDays,
  daysSince,
  LITRES_PER_US_GALLON,
  MAX_RECOMMENDED_INTERVAL_DAYS,
} from "../lib/water";

describe("computeWaterChangeIntervalDays", () => {
  it("matches the PHTA example (400 US gal, 2 bathers -> ~67 days)", () => {
    const litres = 400 * LITRES_PER_US_GALLON;
    const { intervalDays } = computeWaterChangeIntervalDays(litres, 2);
    expect(intervalDays).toBe(67);
  });

  it("gives a sensible interval for a Lay-Z-Spa San Francisco (1050 L)", () => {
    expect(computeWaterChangeIntervalDays(1050, 2).intervalDays).toBe(46);
    expect(computeWaterChangeIntervalDays(1050, 1).intervalDays).toBe(92);
  });

  it("shortens the interval as more people use the tub", () => {
    const one = computeWaterChangeIntervalDays(1050, 1).intervalDays;
    const four = computeWaterChangeIntervalDays(1050, 4).intervalDays;
    expect(four).toBeLessThan(one);
  });

  it("caps unused / very-low-use tubs at the max interval", () => {
    const zero = computeWaterChangeIntervalDays(1050, 0);
    expect(zero.intervalDays).toBe(MAX_RECOMMENDED_INTERVAL_DAYS);
    expect(zero.cappedByMax).toBe(true);

    const tiny = computeWaterChangeIntervalDays(1050, 0.1);
    expect(tiny.cappedByMax).toBe(true);
  });

  it("never returns less than 1 day even under heavy use", () => {
    const heavy = computeWaterChangeIntervalDays(1050, 500);
    expect(heavy.intervalDays).toBeGreaterThanOrEqual(1);
  });

  it("throws on a non-positive volume", () => {
    expect(() => computeWaterChangeIntervalDays(0, 2)).toThrow();
    expect(() => computeWaterChangeIntervalDays(-100, 2)).toThrow();
  });
});

describe("daysSince", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");

  it("returns null when never done", () => {
    expect(daysSince(null, now)).toBeNull();
  });

  it("counts whole elapsed days", () => {
    expect(daysSince("2026-07-20T12:00:00.000Z", now)).toBe(4);
  });

  it("never goes negative for a future date", () => {
    expect(daysSince("2026-08-01T12:00:00.000Z", now)).toBe(0);
  });
});
