import { describe, it, expect } from "vitest";
import {
  computeWaterChangeIntervalDays,
  daysSince,
  batherCapacity,
  usageWaterStatus,
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

describe("batherCapacity", () => {
  it("is gallons / 3 (person-soaks before a change)", () => {
    // 1050 L ~= 277 US gal; /3 ~= 92 person-soaks
    expect(batherCapacity(1050)).toBe(92);
    // 400 US gal -> ~133
    expect(batherCapacity(400 * LITRES_PER_US_GALLON)).toBe(133);
  });

  it("throws on a non-positive volume", () => {
    expect(() => batherCapacity(0)).toThrow();
  });
});

describe("usageWaterStatus", () => {
  it("reports fresh water at zero usage", () => {
    const s = usageWaterStatus(1050, 0);
    expect(s.capacity).toBe(92);
    expect(s.used).toBe(0);
    expect(s.remaining).toBe(92);
    expect(s.fractionUsed).toBe(0);
    expect(s.changeDue).toBe(false);
  });

  it("reports halfway through", () => {
    const s = usageWaterStatus(1050, 46);
    expect(s.remaining).toBe(46);
    expect(s.fractionUsed).toBeCloseTo(0.5, 2);
    expect(s.changeDue).toBe(false);
  });

  it("flags a change as due at/over capacity, clamped", () => {
    expect(usageWaterStatus(1050, 92).changeDue).toBe(true);
    const over = usageWaterStatus(1050, 200);
    expect(over.changeDue).toBe(true);
    expect(over.remaining).toBe(0);
    expect(over.fractionUsed).toBe(1);
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
