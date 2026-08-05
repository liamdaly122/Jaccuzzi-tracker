import { describe, it, expect } from "vitest";
import {
  computeWaterChangeIntervalDays,
  daysSince,
  batherCapacity,
  usageWaterStatus,
  LITRES_PER_US_GALLON,
  MAX_RECOMMENDED_INTERVAL_DAYS,
  sanitiserDemandTrend,
  estimateRefillCost,
  waterChangeVerdict,
  type DemandDose,
} from "../lib/water";

describe("computeWaterChangeIntervalDays", () => {
  it("matches the PHTA example (400 US gal, 2 bathers -> ~67 days)", () => {
    const litres = 400 * LITRES_PER_US_GALLON;
    const { intervalDays } = computeWaterChangeIntervalDays(litres, 2);
    expect(intervalDays).toBe(67);
  });

  it("gives a sensible interval for a Lay-Z-Spa San Francisco (1050 L)", () => {
    expect(computeWaterChangeIntervalDays(1050, 2).intervalDays).toBe(46);
    // The raw formula gives ~92 days for a single daily bather, but the
    // manufacturer's 3-month guidance caps it at 90.
    const light = computeWaterChangeIntervalDays(1050, 1);
    expect(light.intervalDays).toBe(90);
    expect(light.cappedByMax).toBe(true);
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


// -----------------------------------------------------------------------------
const NOW = new Date("2026-08-01T12:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("real-tub sanity check (1180 L Lay-Z-Spa)", () => {
  it("matches the hand-worked figures for 1, 2 and 4 bathers a day", () => {
    // ~104 days raw, but the manufacturer's 90-day cap wins.
    const one = computeWaterChangeIntervalDays(1180, 1);
    expect(one.intervalDays).toBe(90);
    expect(one.cappedByMax).toBe(true);

    expect(computeWaterChangeIntervalDays(1180, 2).intervalDays).toBe(52);
    expect(computeWaterChangeIntervalDays(1180, 4).intervalDays).toBe(26);
  });
});

describe("sanitiserDemandTrend", () => {
  const dose = (day: number, grams: number): DemandDose => ({
    logged_at: daysAgo(day),
    chemical: "dichlor",
    amount_grams: grams,
  });

  it("flags rising demand when recent use outpaces the fortnight before", () => {
    const trend = sanitiserDemandTrend(
      [
        // prior window (15-28 days ago): 20 g total
        dose(20, 10),
        dose(24, 10),
        // recent window (0-14 days): 40 g total => +100%
        dose(3, 20),
        dose(9, 20),
      ],
      NOW,
    );
    expect(trend.rising).toBe(true);
    expect(trend.changeRatio).toBeCloseTo(1, 5);
    expect(trend.message).toContain("100%");
  });

  it("stays quiet when demand is steady", () => {
    const trend = sanitiserDemandTrend(
      [dose(20, 10), dose(24, 10), dose(3, 10), dose(9, 10)],
      NOW,
    );
    expect(trend.rising).toBe(false);
    expect(trend.message).toBeNull();
  });

  it("says nothing when there isn't enough history to judge", () => {
    const trend = sanitiserDemandTrend([dose(3, 20)], NOW);
    expect(trend.changeRatio).toBeNull();
    expect(trend.rising).toBe(false);
  });

  it("ignores chemicals that aren't sanitiser top-ups", () => {
    const phOnly: DemandDose[] = [
      { logged_at: daysAgo(3), chemical: "ph_increaser", amount_grams: 50 },
      { logged_at: daysAgo(5), chemical: "ph_increaser", amount_grams: 50 },
      { logged_at: daysAgo(20), chemical: "ph_increaser", amount_grams: 5 },
      { logged_at: daysAgo(22), chemical: "ph_increaser", amount_grams: 5 },
    ];
    expect(sanitiserDemandTrend(phOnly, NOW).changeRatio).toBeNull();
  });
});

describe("estimateRefillCost", () => {
  it("works out the heating energy for a full 1180 L refill", () => {
    const cost = estimateRefillCost(1180);
    // 1180 kg * 4.186 kJ/kg.K * 28 K / 3600 = ~38.4 kWh
    expect(cost.kwh).toBeCloseTo(38.4, 1);
    expect(cost.totalCost).toBeGreaterThan(0);
    expect(cost.totalCost).toBeCloseTo(cost.energyCost + cost.waterCost, 2);
  });

  it("scales with volume", () => {
    expect(estimateRefillCost(2000).kwh).toBeGreaterThan(
      estimateRefillCost(1000).kwh,
    );
  });
});

describe("waterChangeVerdict", () => {
  it("ineffective sanitiser overrides everything else", () => {
    const v = waterChangeVerdict({
      ageDays: 2,
      intervalDays: 52,
      sanitiserIneffective: true,
    });
    expect(v.status).toBe("change_now");
    expect(v.decidedBy).toBe("sanitiser-ineffective");
  });

  it("calls it when the water is past its interval", () => {
    const v = waterChangeVerdict({ ageDays: 60, intervalDays: 52 });
    expect(v.status).toBe("change_now");
    expect(v.decidedBy).toBe("age");
  });

  it("calls it when person-soak capacity is used up", () => {
    const v = waterChangeVerdict({
      ageDays: 10,
      intervalDays: 52,
      usage: usageWaterStatus(1180, 999),
    });
    expect(v.status).toBe("change_now");
    expect(v.decidedBy).toBe("usage");
  });

  it("warns early when chemical demand is climbing", () => {
    const v = waterChangeVerdict({
      ageDays: 20,
      intervalDays: 52,
      demand: {
        recentGramsPerDay: 2,
        priorGramsPerDay: 1,
        changeRatio: 1,
        rising: true,
        message: "using more",
      },
    });
    expect(v.status).toBe("change_soon");
    expect(v.decidedBy).toBe("demand");
  });

  it("reports fresh water early on, and does not nag", () => {
    const v = waterChangeVerdict({ ageDays: 3, intervalDays: 52 });
    expect(v.status).toBe("fresh");
    expect(v.decidedBy).toBe("none");
  });

  it("says 'getting there' near the end without demanding a change", () => {
    const v = waterChangeVerdict({ ageDays: 45, intervalDays: 52 });
    expect(v.status).toBe("watch");
  });
});

describe("waterChangeVerdict — measured stabiliser", () => {
  const fresh = { ageDays: 5, intervalDays: 90 };

  it("calls a water change on a stabiliser reading alone", () => {
    const v = waterChangeVerdict({ ...fresh, cyaPpm: 140, cyaDrainAbove: 100 });
    expect(v.status).toBe("change_now");
    expect(v.decidedBy).toBe("stabiliser");
    expect(v.detail).toMatch(/140 ppm/);
  });

  it("prefers the measurement over the ORP inference", () => {
    // Both fire; the strip number is the one the user can act on and check.
    const v = waterChangeVerdict({
      ...fresh,
      cyaPpm: 140,
      cyaDrainAbove: 100,
      sanitiserIneffective: true,
    });
    expect(v.decidedBy).toBe("stabiliser");
  });

  it("still falls back to the inference when no strip has measured it", () => {
    const v = waterChangeVerdict({ ...fresh, cyaPpm: null, sanitiserIneffective: true });
    expect(v.decidedBy).toBe("sanitiser-ineffective");
  });

  it("leaves a healthy stabiliser level well alone", () => {
    const v = waterChangeVerdict({ ...fresh, cyaPpm: 40, cyaDrainAbove: 100 });
    expect(v.status).not.toBe("change_now");
  });
});
